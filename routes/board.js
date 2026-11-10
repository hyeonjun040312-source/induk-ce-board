const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { isAuthenticated, isPostOwnerOrAdmin, isCommentOwnerOrAdmin } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

/**
 * 게시글 목록 화면 GET /board
 */
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const search = req.query.search ? req.query.search.trim() : '';

  try {
    let posts = [];
    let totalCount = 0;

    if (search) {
      const searchParam = `%${search}%`;
      const countResult = await db.get(
        `SELECT COUNT(*) as count FROM posts 
         WHERE title LIKE ? OR content LIKE ? OR author_name LIKE ?`,
        [searchParam, searchParam, searchParam]
      );
      totalCount = countResult ? countResult.count : 0;

      posts = await db.all(
        `SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count 
         FROM posts p
         WHERE p.title LIKE ? OR p.content LIKE ? OR p.author_name LIKE ?
         ORDER BY p.is_notice DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [searchParam, searchParam, searchParam, limit, offset]
      );
    } else {
      const countResult = await db.get('SELECT COUNT(*) as count FROM posts');
      totalCount = countResult ? countResult.count : 0;

      posts = await db.all(
        `SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count 
         FROM posts p
         ORDER BY p.is_notice DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    const totalPages = Math.ceil(totalCount / limit) || 1;

    res.render('board/list', {
      pageTitle: '학과 게시판 - 인덕대학교 컴퓨터전자공학과',
      posts,
      currentPage: page,
      totalPages,
      totalCount,
      search,
      successMessage: req.session.successMessage,
      errorMessage: req.session.errorMessage
    });

    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (err) {
    console.error('[Board Route] 목록 조회 에러:', err);
    res.status(500).render('error', {
      status: 500,
      title: '서버 오류',
      message: '게시글 목록을 불러오는 중 문제가 발생했습니다.',
      user: req.session.user
    });
  }
});

/**
 * 게시글 작성 화면 GET /board/new
 */
router.get('/new', isAuthenticated, (req, res) => {
  res.render('board/form', {
    pageTitle: '글 작성 - 인덕대학교 컴퓨터전자공학과',
    post: null,
    isEdit: false,
    errorMessage: req.session.errorMessage
  });
  req.session.errorMessage = null;
});

/**
 * 게시글 작성 처리 POST /board/new
 */
router.post('/new', isAuthenticated, upload.single('file'), async (req, res) => {
  const { title, content, is_notice } = req.body;
  const user = req.session.user;

  if (!title || !title.trim() || !content || !content.trim()) {
    req.session.errorMessage = '제목과 내용을 모두 입력해 주세요.';
    return res.redirect('/board/new');
  }

  // 관리자만 공지사항 지정 가능
  const noticeFlag = (user.role === 'admin' && (is_notice === '1' || is_notice === 'on')) ? 1 : 0;

  // 파일 정보 추출
  let fileOriginalName = null;
  let fileStoredName = null;
  let fileSize = 0;
  let fileMimetype = null;

  if (req.file) {
    fileOriginalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    fileStoredName = req.file.filename;
    fileSize = req.file.size;
    fileMimetype = req.file.mimetype;
  }

  try {
    const result = await db.run(
      `INSERT INTO posts 
       (title, content, author_id, author_name, author_username, is_notice, file_original_name, file_stored_name, file_size, file_mimetype)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        content.trim(),
        user.id,
        user.name,
        user.username,
        noticeFlag,
        fileOriginalName,
        fileStoredName,
        fileSize,
        fileMimetype
      ]
    );

    req.session.successMessage = '게시글이 성공적으로 등록되었습니다.';
    return res.redirect(`/board/${result.lastID}`);
  } catch (err) {
    console.error('[Board Route] 글 작성 에러:', err);
    req.session.errorMessage = '게시글 등록 중 오류가 발생했습니다.';
    return res.redirect('/board/new');
  }
});

/**
 * 게시글 상세 화면 GET /board/:id
 */
router.get('/:id', async (req, res) => {
  const postId = req.params.id;

  try {
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).render('error', {
        status: 404,
        title: '게시글 없음',
        message: '요청하신 게시글이 존재하지 않습니다.',
        user: req.session.user
      });
    }

    // 조회수 증가
    await db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [postId]);
    post.views += 1;

    // 댓글 목록 조회
    const comments = await db.all(
      'SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC',
      [postId]
    );

    res.render('board/detail', {
      pageTitle: `${post.title} - 인덕대학교 컴퓨터전자공학과`,
      post,
      comments,
      successMessage: req.session.successMessage,
      errorMessage: req.session.errorMessage
    });

    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (err) {
    console.error('[Board Route] 상세 조회 에러:', err);
    res.status(500).render('error', {
      status: 500,
      title: '서버 오류',
      message: '게시글을 불러오는 도중 오류가 발생했습니다.',
      user: req.session.user
    });
  }
});

/**
 * 첨부파일 다운로드 GET /board/download/:id
 */
router.get('/download/:id', async (req, res) => {
  const postId = req.params.id;

  try {
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (!post || !post.file_stored_name) {
      return res.status(404).send('첨부파일이 존재하지 않습니다.');
    }

    // Path Traversal 방지
    const safeFilename = path.basename(post.file_stored_name);
    const filePath = path.join(__dirname, '..', 'uploads', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('서버에 파일이 존재하지 않습니다.');
    }

    const downloadName = encodeURIComponent(post.file_original_name || safeFilename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
    return res.download(filePath, post.file_original_name || safeFilename);
  } catch (err) {
    console.error('[Board Route] 파일 다운로드 에러:', err);
    res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
  }
});

/**
 * 게시글 수정 화면 GET /board/:id/edit
 * 권한 검증: isPostOwnerOrAdmin (타인은 403 Forbidden)
 */
router.get('/:id/edit', isAuthenticated, isPostOwnerOrAdmin, (req, res) => {
  res.render('board/form', {
    pageTitle: '글 수정 - 인덕대학교 컴퓨터전자공학과',
    post: req.post,
    isEdit: true,
    errorMessage: req.session.errorMessage
  });
  req.session.errorMessage = null;
});

/**
 * 게시글 수정 처리 POST /board/:id/edit
 * 권한 검증: isPostOwnerOrAdmin (타인은 403 Forbidden)
 */
router.post('/:id/edit', isAuthenticated, isPostOwnerOrAdmin, upload.single('file'), async (req, res) => {
  const { title, content, is_notice, delete_file } = req.body;
  const user = req.session.user;
  const post = req.post;

  if (!title || !title.trim() || !content || !content.trim()) {
    req.session.errorMessage = '제목과 내용을 모두 입력해 주세요.';
    return res.redirect(`/board/${post.id}/edit`);
  }

  // 관리자만 공지사항 변경 가능 (일반 학생은 기존 상태 유지)
  const noticeFlag = (user.role === 'admin')
    ? (is_notice === '1' || is_notice === 'on' ? 1 : 0)
    : post.is_notice;

  let fileOriginalName = post.file_original_name;
  let fileStoredName = post.file_stored_name;
  let fileSize = post.file_size;
  let fileMimetype = post.file_mimetype;

  // 새 파일 업로드 또는 파일 삭제 요청 시 기존 파일 디스크 삭제
  if (req.file || delete_file === '1') {
    if (post.file_stored_name) {
      const oldFilePath = path.join(__dirname, '..', 'uploads', path.basename(post.file_stored_name));
      if (fs.existsSync(oldFilePath)) {
        try { fs.unlinkSync(oldFilePath); } catch (e) { console.warn('구 파일 삭제 실패:', e); }
      }
    }
    fileOriginalName = null;
    fileStoredName = null;
    fileSize = 0;
    fileMimetype = null;
  }

  // 새 파일 정보 적용
  if (req.file) {
    fileOriginalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    fileStoredName = req.file.filename;
    fileSize = req.file.size;
    fileMimetype = req.file.mimetype;
  }

  try {
    await db.run(
      `UPDATE posts 
       SET title = ?, content = ?, is_notice = ?, file_original_name = ?, file_stored_name = ?, file_size = ?, file_mimetype = ?
       WHERE id = ?`,
      [title.trim(), content.trim(), noticeFlag, fileOriginalName, fileStoredName, fileSize, fileMimetype, post.id]
    );

    req.session.successMessage = '게시글이 수정되었습니다.';
    return res.redirect(`/board/${post.id}`);
  } catch (err) {
    console.error('[Board Route] 글 수정 에러:', err);
    req.session.errorMessage = '게시글 수정 중 오류가 발생했습니다.';
    return res.redirect(`/board/${post.id}/edit`);
  }
});

/**
 * 게시글 삭제 처리 POST /board/:id/delete
 * 권한 검증: isPostOwnerOrAdmin (타인은 403 Forbidden)
 */
router.post('/:id/delete', isAuthenticated, isPostOwnerOrAdmin, async (req, res) => {
  const post = req.post;

  try {
    // 저장된 파일 디스크에서 삭제
    if (post.file_stored_name) {
      const filePath = path.join(__dirname, '..', 'uploads', path.basename(post.file_stored_name));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn('파일 삭제 실패:', e); }
      }
    }

    // 연관 댓글 및 게시글 삭제
    await db.run('DELETE FROM comments WHERE post_id = ?', [post.id]);
    await db.run('DELETE FROM posts WHERE id = ?', [post.id]);

    req.session.successMessage = '게시글이 삭제되었습니다.';
    return res.redirect('/board');
  } catch (err) {
    console.error('[Board Route] 글 삭제 에러:', err);
    req.session.errorMessage = '게시글 삭제 중 오류가 발생했습니다.';
    return res.redirect(`/board/${post.id}`);
  }
});

/**
 * 댓글 작성 처리 POST /board/:id/comments
 */
router.post('/:id/comments', isAuthenticated, async (req, res) => {
  const postId = req.params.id;
  const { content } = req.body;
  const user = req.session.user;

  if (!content || !content.trim()) {
    req.session.errorMessage = '댓글 내용을 입력해 주세요.';
    return res.redirect(`/board/${postId}`);
  }

  try {
    const post = await db.get('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) {
      req.session.errorMessage = '해당 게시글이 존재하지 않습니다.';
      return res.redirect('/board');
    }

    await db.run(
      `INSERT INTO comments (post_id, author_id, author_name, author_username, content)
       VALUES (?, ?, ?, ?, ?)`,
      [postId, user.id, user.name, user.username, content.trim()]
    );

    req.session.successMessage = '댓글이 등록되었습니다.';
    return res.redirect(`/board/${postId}#comments`);
  } catch (err) {
    console.error('[Board Route] 댓글 작성 에러:', err);
    req.session.errorMessage = '댓글 등록 중 오류가 발생했습니다.';
    return res.redirect(`/board/${postId}`);
  }
});

/**
 * 댓글 삭제 처리 POST /board/comments/:commentId/delete
 * 권한 검증: isCommentOwnerOrAdmin (타인은 403 Forbidden)
 */
router.post('/comments/:commentId/delete', isAuthenticated, isCommentOwnerOrAdmin, async (req, res) => {
  const comment = req.comment;

  try {
    await db.run('DELETE FROM comments WHERE id = ?', [comment.id]);

    // AJAX 요청이면 JSON 응답, 일반 폼 전송이면 리다이렉트
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ success: true, message: '댓글이 삭제되었습니다.' });
    }

    req.session.successMessage = '댓글이 삭제되었습니다.';
    return res.redirect(`/board/${comment.post_id}#comments`);
  } catch (err) {
    console.error('[Board Route] 댓글 삭제 에러:', err);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: '댓글 삭제 중 오류가 발생했습니다.' });
    }
    req.session.errorMessage = '댓글 삭제 중 오류가 발생했습니다.';
    return res.redirect(`/board/${comment.post_id}#comments`);
  }
});

module.exports = router;
