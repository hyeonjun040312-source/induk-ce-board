const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { isAdmin } = require('../middlewares/auth');

// 모든 관리자 라우터는 isAdmin 미들웨어를 통과해야 함 (비인가 시 403 Forbidden)
router.use(isAdmin);

/**
 * 관리자 대시보드 및 통합 관리 페이지 GET /admin
 */
router.get('/', async (req, res) => {
  try {
    // 1. 통계 데이터 조회
    const userCountRow = await db.get('SELECT COUNT(*) as count FROM users');
    const postCountRow = await db.get('SELECT COUNT(*) as count FROM posts');
    const commentCountRow = await db.get('SELECT COUNT(*) as count FROM comments');
    const noticeCountRow = await db.get('SELECT COUNT(*) as count FROM posts WHERE is_notice = 1');

    const stats = {
      userCount: userCountRow ? userCountRow.count : 0,
      postCount: postCountRow ? postCountRow.count : 0,
      commentCount: commentCountRow ? commentCountRow.count : 0,
      noticeCount: noticeCountRow ? noticeCountRow.count : 0
    };

    // 2. 전체 회원 목록 조회
    const users = await db.all('SELECT id, username, name, student_id, role, created_at FROM users ORDER BY id DESC');

    // 3. 전체 게시글 목록 조회
    const posts = await db.all(`
      SELECT p.*, 
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
      FROM posts p
      ORDER BY p.is_notice DESC, p.id DESC
    `);

    res.render('admin/index', {
      pageTitle: '관리자 전용 관리 페이지 - 인덕대학교 컴퓨터전자공학과',
      stats,
      users,
      posts,
      successMessage: req.session.successMessage,
      errorMessage: req.session.errorMessage
    });

    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (err) {
    console.error('[Admin Route] 대시보드 조회 에러:', err);
    res.status(500).render('error', {
      status: 500,
      title: '관리자 페이지 오류',
      message: '관리자 데이터를 불러오는 중 오류가 발생했습니다.',
      user: req.session.user
    });
  }
});

/**
 * 회원 역할 변경 POST /admin/users/:id/role
 */
router.post('/users/:id/role', async (req, res) => {
  const targetUserId = Number(req.params.id);
  const { role } = req.body;
  const currentUser = req.session.user;

  if (targetUserId === currentUser.id) {
    req.session.errorMessage = '본인 자신의 권한은 직접 변경할 수 없습니다.';
    return res.redirect('/admin');
  }

  if (!['student', 'admin'].includes(role)) {
    req.session.errorMessage = '유효하지 않은 권한 값입니다.';
    return res.redirect('/admin');
  }

  try {
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
    req.session.successMessage = '회원 권한이 성공적으로 변경되었습니다.';
  } catch (err) {
    console.error('[Admin Route] 회원 권한 변경 에러:', err);
    req.session.errorMessage = '권한 변경 중 오류가 발생했습니다.';
  }

  return res.redirect('/admin#users');
});

/**
 * 회원 강제 탈퇴/삭제 POST /admin/users/:id/delete
 */
router.post('/users/:id/delete', async (req, res) => {
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;

  if (targetUserId === currentUser.id) {
    req.session.errorMessage = '자기 자신 관리자 계정은 삭제할 수 없습니다.';
    return res.redirect('/admin');
  }

  try {
    // 회원이 작성한 게시글의 첨부파일 디스크에서 정리
    const userPosts = await db.all('SELECT file_stored_name FROM posts WHERE author_id = ?', [targetUserId]);
    userPosts.forEach(p => {
      if (p.file_stored_name) {
        const filePath = path.join(__dirname, '..', 'uploads', path.basename(p.file_stored_name));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      }
    });

    // 회원 및 연관 데이터 삭제
    await db.run('DELETE FROM comments WHERE author_id = ?', [targetUserId]);
    await db.run('DELETE FROM posts WHERE author_id = ?', [targetUserId]);
    await db.run('DELETE FROM users WHERE id = ?', [targetUserId]);

    req.session.successMessage = '해당 회원이 성공적으로 삭제(탈퇴 처리)되었습니다.';
  } catch (err) {
    console.error('[Admin Route] 회원 삭제 에러:', err);
    req.session.errorMessage = '회원 삭제 처리 중 오류가 발생했습니다.';
  }

  return res.redirect('/admin#users');
});

/**
 * 게시글 공지사항 전환/해제 토글 POST /admin/posts/:id/toggle-notice
 */
router.post('/posts/:id/toggle-notice', async (req, res) => {
  const postId = Number(req.params.id);

  try {
    const post = await db.get('SELECT id, is_notice FROM posts WHERE id = ?', [postId]);
    if (!post) {
      req.session.errorMessage = '게시글이 존재하지 않습니다.';
      return res.redirect('/admin');
    }

    const newNoticeState = post.is_notice === 1 ? 0 : 1;
    await db.run('UPDATE posts SET is_notice = ? WHERE id = ?', [newNoticeState, postId]);

    req.session.successMessage = newNoticeState === 1
      ? '게시글이 학과 공지사항으로 등록되었습니다.'
      : '게시글의 공지사항 설정이 해제되었습니다.';
  } catch (err) {
    console.error('[Admin Route] 공지사항 토글 에러:', err);
    req.session.errorMessage = '공지 설정 변경 중 오류가 발생했습니다.';
  }

  return res.redirect('/admin#posts');
});

/**
 * 부적절한 게시글 관리자 강제 삭제 POST /admin/posts/:id/delete
 */
router.post('/posts/:id/delete', async (req, res) => {
  const postId = Number(req.params.id);

  try {
    const post = await db.get('SELECT file_stored_name FROM posts WHERE id = ?', [postId]);
    if (post && post.file_stored_name) {
      const filePath = path.join(__dirname, '..', 'uploads', path.basename(post.file_stored_name));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }

    await db.run('DELETE FROM comments WHERE post_id = ?', [postId]);
    await db.run('DELETE FROM posts WHERE id = ?', [postId]);

    req.session.successMessage = '부적절한 게시글이 관리자 권한으로 삭제되었습니다.';
  } catch (err) {
    console.error('[Admin Route] 게시글 강제 삭제 에러:', err);
    req.session.errorMessage = '게시글 삭제 중 오류가 발생했습니다.';
  }

  return res.redirect('/admin#posts');
});

module.exports = router;
