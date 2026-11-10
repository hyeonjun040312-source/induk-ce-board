const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'board.sqlite');

let dbDriver = null;
let db = null;

// SQLite3 드라이버 로드 시도
try {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.warn('[DB] SQLite3 파일 오픈 실패. JSON 모드로 전환합니다:', err.message);
      initJsonDb();
    } else {
      dbDriver = 'sqlite3';
      console.log(`[DB] SQLite3 데이터베이스 연결 성공 (${DB_PATH})`);
      initSqliteTables();
    }
  });
} catch (e) {
  console.warn('[DB] sqlite3 모듈 로드 불가. 내장 경량 파일 DB 모드로 작동합니다.');
  initJsonDb();
}

/**
 * SQLite 테이블 생성 및 초기 시드 데이터 삽입
 */
function initSqliteTables() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  db.exec(schemaSql, async (err) => {
    if (err) {
      console.error('[DB] 스키마 실행 실패:', err.message);
      return;
    }
    console.log('[DB] 데이터베이스 테이블 준비 완료');
    await seedInitialData();
  });
}

/**
 * Promise 기반 쿼리 래퍼 (SQLite)
 */
const queryApi = {
  get: (sql, params = []) => {
    if (dbDriver === 'sqlite3') {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    } else {
      return jsonDb.get(sql, params);
    }
  },

  all: (sql, params = []) => {
    if (dbDriver === 'sqlite3') {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      return jsonDb.all(sql, params);
    }
  },

  run: (sql, params = []) => {
    if (dbDriver === 'sqlite3') {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    } else {
      return jsonDb.run(sql, params);
    }
  }
};

/**
 * JSON 파일 DB 폴백 구현 (외부 의존성 없을 때 자동 작동)
 */
let jsonDbState = {
  users: [],
  posts: [],
  comments: [],
  autoInc: { users: 1, posts: 1, comments: 1 }
};
const JSON_FILE_PATH = path.join(__dirname, 'board_data.json');

function initJsonDb() {
  dbDriver = 'json';
  if (fs.existsSync(JSON_FILE_PATH)) {
    try {
      jsonDbState = JSON.parse(fs.readFileSync(JSON_FILE_PATH, 'utf8'));
      console.log('[DB] JSON 데이터 파일 로드 완료');
    } catch (e) {
      console.error('[DB] JSON 파일 파싱 에러, 새로 초기화합니다.');
    }
  }
  seedInitialData();
}

function saveJsonDb() {
  fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(jsonDbState, null, 2), 'utf8');
}

const jsonDb = {
  get: async (sql, params = []) => {
    const rows = await jsonDb.all(sql, params);
    return rows[0] || null;
  },

  all: async (sql, params = []) => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    // 1. 유저 조회
    if (cleanSql.includes('from users')) {
      if (cleanSql.includes('where username = ?')) {
        return jsonDbState.users.filter(u => u.username === params[0]);
      }
      if (cleanSql.includes('where id = ?')) {
        return jsonDbState.users.filter(u => u.id === Number(params[0]));
      }
      if (cleanSql.includes('count(*) as count')) {
        return [{ count: jsonDbState.users.length }];
      }
      return [...jsonDbState.users].sort((a, b) => b.id - a.id);
    }

    // 2. 게시글 목록 조회 (검색 및 정렬 포함)
    if (cleanSql.includes('from posts')) {
      if (cleanSql.includes('count(*) as count')) {
        let list = jsonDbState.posts;
        if (params.length > 0 && cleanSql.includes('like')) {
          const keyword = (params[0] || '').replace(/%/g, '').toLowerCase();
          list = list.filter(p =>
            (p.title && p.title.toLowerCase().includes(keyword)) ||
            (p.content && p.content.toLowerCase().includes(keyword)) ||
            (p.author_name && p.author_name.toLowerCase().includes(keyword))
          );
        }
        return [{ count: list.length }];
      }

      if (cleanSql.includes('where id = ?')) {
        return jsonDbState.posts.filter(p => p.id === Number(params[0]));
      }

      let list = [...jsonDbState.posts];
      if (cleanSql.includes('like')) {
        const keyword = (params[0] || '').replace(/%/g, '').toLowerCase();
        list = list.filter(p =>
          (p.title && p.title.toLowerCase().includes(keyword)) ||
          (p.content && p.content.toLowerCase().includes(keyword)) ||
          (p.author_name && p.author_name.toLowerCase().includes(keyword))
        );
      }

      // 공지 우선, 최신순 정렬
      list.sort((a, b) => {
        if (b.is_notice !== a.is_notice) return b.is_notice - a.is_notice;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      // 페이징 (limit, offset)
      if (cleanSql.includes('limit ? offset ?')) {
        const limit = params[params.length - 2];
        const offset = params[params.length - 1];
        list = list.slice(offset, offset + limit);
      }

      // 댓글 수 계산 첨부
      return list.map(p => ({
        ...p,
        comment_count: jsonDbState.comments.filter(c => c.post_id === p.id).length
      }));
    }

    // 3. 댓글 목록 조회
    if (cleanSql.includes('from comments')) {
      if (cleanSql.includes('count(*) as count')) {
        return [{ count: jsonDbState.comments.length }];
      }
      if (cleanSql.includes('where post_id = ?')) {
        return jsonDbState.comments
          .filter(c => c.post_id === Number(params[0]))
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      }
      if (cleanSql.includes('where id = ?')) {
        return jsonDbState.comments.filter(c => c.id === Number(params[0]));
      }
      return [...jsonDbState.comments];
    }

    return [];
  },

  run: async (sql, params = []) => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    // 1. 유저 등록
    if (cleanSql.startsWith('insert into users')) {
      const id = jsonDbState.autoInc.users++;
      const [username, password, name, student_id, role] = params;
      const newUser = { id, username, password, name, student_id, role: role || 'student', created_at: now };
      jsonDbState.users.push(newUser);
      saveJsonDb();
      return { lastID: id, changes: 1 };
    }

    // 2. 유저 삭제
    if (cleanSql.startsWith('delete from users')) {
      const id = Number(params[0]);
      jsonDbState.users = jsonDbState.users.filter(u => u.id !== id);
      jsonDbState.posts = jsonDbState.posts.filter(p => p.author_id !== id);
      jsonDbState.comments = jsonDbState.comments.filter(c => c.author_id !== id);
      saveJsonDb();
      return { changes: 1 };
    }

    // 3. 유저 역할 변경
    if (cleanSql.startsWith('update users set role = ?')) {
      const [role, id] = params;
      const user = jsonDbState.users.find(u => u.id === Number(id));
      if (user) user.role = role;
      saveJsonDb();
      return { changes: 1 };
    }

    // 4. 게시글 등록
    if (cleanSql.startsWith('insert into posts')) {
      const id = jsonDbState.autoInc.posts++;
      const [title, content, author_id, author_name, author_username, is_notice, file_original_name, file_stored_name, file_size, file_mimetype] = params;
      const newPost = {
        id,
        title,
        content,
        author_id: Number(author_id),
        author_name,
        author_username,
        is_notice: Number(is_notice || 0),
        file_original_name: file_original_name || null,
        file_stored_name: file_stored_name || null,
        file_size: file_size || 0,
        file_mimetype: file_mimetype || null,
        views: 0,
        created_at: now,
        updated_at: now
      };
      jsonDbState.posts.push(newPost);
      saveJsonDb();
      return { lastID: id, changes: 1 };
    }

    // 5. 게시글 수정
    if (cleanSql.startsWith('update posts set title = ?')) {
      const [title, content, is_notice, file_original_name, file_stored_name, file_size, file_mimetype, id] = params;
      const post = jsonDbState.posts.find(p => p.id === Number(id));
      if (post) {
        post.title = title;
        post.content = content;
        post.is_notice = Number(is_notice || 0);
        if (file_stored_name !== undefined) {
          post.file_original_name = file_original_name;
          post.file_stored_name = file_stored_name;
          post.file_size = file_size;
          post.file_mimetype = file_mimetype;
        }
        post.updated_at = now;
        saveJsonDb();
      }
      return { changes: 1 };
    }

    // 6. 조회수 증가
    if (cleanSql.includes('update posts set views = views + 1')) {
      const id = Number(params[0]);
      const post = jsonDbState.posts.find(p => p.id === id);
      if (post) {
        post.views = (post.views || 0) + 1;
        saveJsonDb();
      }
      return { changes: 1 };
    }

    // 7. 공지사항 토글
    if (cleanSql.startsWith('update posts set is_notice = ?')) {
      const [is_notice, id] = params;
      const post = jsonDbState.posts.find(p => p.id === Number(id));
      if (post) {
        post.is_notice = Number(is_notice);
        saveJsonDb();
      }
      return { changes: 1 };
    }

    // 8. 게시글 삭제
    if (cleanSql.startsWith('delete from posts')) {
      const id = Number(params[0]);
      jsonDbState.posts = jsonDbState.posts.filter(p => p.id !== id);
      jsonDbState.comments = jsonDbState.comments.filter(c => c.post_id !== id);
      saveJsonDb();
      return { changes: 1 };
    }

    // 9. 댓글 등록
    if (cleanSql.startsWith('insert into comments')) {
      const id = jsonDbState.autoInc.comments++;
      const [post_id, author_id, author_name, author_username, content] = params;
      const newComment = {
        id,
        post_id: Number(post_id),
        author_id: Number(author_id),
        author_name,
        author_username,
        content,
        created_at: now
      };
      jsonDbState.comments.push(newComment);
      saveJsonDb();
      return { lastID: id, changes: 1 };
    }

    // 10. 댓글 삭제
    if (cleanSql.startsWith('delete from comments')) {
      const id = Number(params[0]);
      jsonDbState.comments = jsonDbState.comments.filter(c => c.id !== id);
      saveJsonDb();
      return { changes: 1 };
    }

    return { changes: 0 };
  }
};

/**
 * 초기 시드 데이터 생성 (관리자, 샘플 학생, 학과 공지사항 및 게시글)
 */
async function seedInitialData() {
  try {
    const existingAdmin = await queryApi.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (existingAdmin) {
      return; // 이미 데이터가 있으면 시딩 생략
    }

    console.log('[DB] 초기 시드 데이터를 생성합니다...');

    // 1. 관리자 계정 생성 (비밀번호: admin1234)
    const adminHash = await bcrypt.hash('admin1234', 10);
    const adminResult = await queryApi.run(
      'INSERT INTO users (username, password, name, student_id, role) VALUES (?, ?, ?, ?, ?)',
      ['admin', adminHash, '학과사무실(관리자)', '00000000', 'admin']
    );

    // 2. 학생 계정 1 생성 (김인덕, 비밀번호: student1234)
    const student1Hash = await bcrypt.hash('student1234', 10);
    const s1Result = await queryApi.run(
      'INSERT INTO users (username, password, name, student_id, role) VALUES (?, ?, ?, ?, ?)',
      ['student1', student1Hash, '김인덕', '20241501', 'student']
    );

    // 3. 학생 계정 2 생성 (이전자, 비밀번호: student1234)
    const student2Hash = await bcrypt.hash('student1234', 10);
    const s2Result = await queryApi.run(
      'INSERT INTO users (username, password, name, student_id, role) VALUES (?, ?, ?, ?, ?)',
      ['student2', student2Hash, '이전자', '20241502', 'student']
    );

    // 4. 초기 공지사항 게시글 등록
    const notice1 = await queryApi.run(
      `INSERT INTO posts (title, content, author_id, author_name, author_username, is_notice, file_original_name, file_stored_name, file_size, file_mimetype)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '[필독] 2026학년도 컴퓨터전자공학과 전공트랙 이수 및 캡스톤디자인 안내',
        `안녕하세요. 인덕대학교 컴퓨터전자공학과 학과사무실입니다.

2026학년도 1학기 컴퓨터전자공학과 전공트랙 이수 신청 및 졸업작품(캡스톤디자인) 안내드립니다.

1. 전공트랙 선택 안내
- 인공지능/빅데이터 트랙
- 임베디드 IoT/로보틱스 트랙
- 웹/클라우드 시스템 트랙

2. 신청 기한: 2026년 3월 15일 18:00까지
3. 제출 서류: 첨부된 신청서 양식을 다운로드하여 작성 후 학과사무실로 제출 바랍니다.

문의사항은 학과사무실(02-950-7000)로 연락 바랍니다.`,
        adminResult.lastID,
        '학과사무실(관리자)',
        'admin',
        1,
        null,
        null,
        0,
        null
      ]
    );

    // 5. 일반 게시글 등록 (학생 1)
    const post1 = await queryApi.run(
      `INSERT INTO posts (title, content, author_id, author_name, author_username, is_notice, file_original_name, file_stored_name, file_size, file_mimetype)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '2026 임베디드 소프트웨어 경진대회 스터디원 모집합니다!',
        `컴퓨터전자공학과 학우 여러분 안녕하세요!
임베디드 시스템 설계 및 아두이노/라즈베리파이 기반 제어 스터디를 함께 하실 팀원을 모집합니다.

- 모집 인원: 2~3명 (학년 무관, 열정 있으신 분 환영!)
- 주요 활동: 주 1회 세미나, 경진대회 출품작 브레인스토밍
- 관심 있으신 분은 댓글 남겨주시면 연락드리겠습니다!`,
        s1Result.lastID,
        '김인덕',
        'student1',
        0,
        null,
        null,
        0,
        null
      ]
    );

    // 6. 댓글 등록 (학생 2)
    await queryApi.run(
      `INSERT INTO comments (post_id, author_id, author_name, author_username, content)
       VALUES (?, ?, ?, ?, ?)`,
      [
        post1.lastID,
        s2Result.lastID,
        '이전자',
        'student2',
        '저 2학년 전자트랙인데 참가 가능할까요? C언어 기초는 공부했습니다!'
      ]
    );

    console.log('[DB] 초기 시드 데이터 생성이 완료되었습니다.');
    console.log('   - 관리자 계정: admin / admin1234');
    console.log('   - 학생 계정 1: student1 / student1234');
    console.log('   - 학생 계정 2: student2 / student1234');
  } catch (err) {
    console.error('[DB] 시드 데이터 생성 중 에러:', err);
  }
}

module.exports = queryApi;
