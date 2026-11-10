const db = require('../database/db');

/**
 * 로그인 여부 확인 미들웨어
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.errorMessage = '로그인이 필요한 서비스입니다.';
  return res.redirect('/auth/login');
}

/**
 * 관리자 권한 확인 미들웨어
 * 관리자(role === 'admin')가 아닌 경우 403 Forbidden 반환
 */
function isAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    req.session.errorMessage = '로그인이 필요합니다.';
    return res.redirect('/auth/login');
  }

  if (req.session.user.role === 'admin') {
    return next();
  }

  return res.status(403).render('error', {
    status: 403,
    title: '접근 권한 없음 (403 Forbidden)',
    message: '관리자 전용 페이지입니다. 관리자 계정으로 로그인해 주세요.',
    user: req.session.user
  });
}

/**
 * 게시글 수정/삭제 권한 검증 미들웨어 (작성자 본인 또는 관리자)
 * 타인의 글에 대한 비인가 접근을 백엔드에서 원천 차단
 */
async function isPostOwnerOrAdmin(req, res, next) {
  const postId = req.params.id;
  const user = req.session.user;

  if (!user) {
    req.session.errorMessage = '로그인이 필요합니다.';
    return res.redirect('/auth/login');
  }

  try {
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);

    if (!post) {
      return res.status(404).render('error', {
        status: 404,
        title: '게시글을 찾을 수 없음',
        message: '존재하지 않거나 이미 삭제된 게시글입니다.',
        user
      });
    }

    // 작성자 본인이거나 관리자인 경우만 허용
    if (post.author_id === user.id || user.role === 'admin') {
      req.post = post; // 후속 라우터 핸들러에서 재조회 없이 사용할 수 있도록 캐싱
      return next();
    }

    // 타인 글에 대한 조작 시도 - 403 Forbidden 철저 차단
    return res.status(403).render('error', {
      status: 403,
      title: '접근 권한 없음 (403 Forbidden)',
      message: '해당 게시글의 수정 또는 삭제 권한이 없습니다. 본인이 작성한 글만 변경할 수 있습니다.',
      user
    });
  } catch (err) {
    console.error('[Auth Middleware] 게시글 권한 확인 오류:', err);
    return res.status(500).render('error', {
      status: 500,
      title: '서버 내부 오류',
      message: '권한을 확인하는 도중 오류가 발생했습니다.',
      user
    });
  }
}

/**
 * 댓글 삭제 권한 검증 미들웨어 (작성자 본인 또는 관리자)
 */
async function isCommentOwnerOrAdmin(req, res, next) {
  const commentId = req.params.commentId;
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  try {
    const comment = await db.get('SELECT * FROM comments WHERE id = ?', [commentId]);

    if (!comment) {
      return res.status(404).json({ success: false, message: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.author_id === user.id || user.role === 'admin') {
      req.comment = comment;
      return next();
    }

    return res.status(403).json({
      success: false,
      message: '본인이 작성한 댓글만 삭제할 수 있습니다. (403 Forbidden)'
    });
  } catch (err) {
    console.error('[Auth Middleware] 댓글 권한 확인 오류:', err);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isPostOwnerOrAdmin,
  isCommentOwnerOrAdmin
};
