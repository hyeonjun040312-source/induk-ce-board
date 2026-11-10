-- ===================================================
-- 인덕대학교 컴퓨터전자공학과 게시판 데이터베이스 스키마
-- ===================================================

-- 1. 사용자 테이블 (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,           -- 로그인 아이디
    password TEXT NOT NULL,                  -- 암호화된 비밀번호 (bcrypt)
    name TEXT NOT NULL,                      -- 사용자 이름 (실명 또는 닉네임)
    student_id TEXT,                         -- 학번 (선택 사항)
    role TEXT DEFAULT 'student',             -- 역할: 'student' (일반학생), 'admin' (관리자)
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- 2. 게시글 테이블 (Posts)
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,                     -- 제목
    content TEXT NOT NULL,                   -- 본문
    author_id INTEGER NOT NULL,              -- 작성자 고유 ID (users.id)
    author_name TEXT NOT NULL,               -- 작성자 이름
    author_username TEXT NOT NULL,           -- 작성자 아이디
    is_notice INTEGER DEFAULT 0,             -- 공지사항 여부 (0: 일반, 1: 공지사항)
    file_original_name TEXT,                 -- 첨부파일 원본 파일명
    file_stored_name TEXT,                   -- 서버 저장 파일명 (UUID 또는 타임스탬프)
    file_size INTEGER,                       -- 파일 크기 (bytes)
    file_mimetype TEXT,                      -- 파일 MIME 타입
    views INTEGER DEFAULT 0,                 -- 조회수
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 댓글 테이블 (Comments)
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,                -- 연관 게시글 ID
    author_id INTEGER NOT NULL,              -- 작성자 고유 ID (users.id)
    author_name TEXT NOT NULL,               -- 작성자 이름
    author_username TEXT NOT NULL,           -- 작성자 아이디
    content TEXT NOT NULL,                   -- 댓글 내용
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_notice ON posts(is_notice DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);
