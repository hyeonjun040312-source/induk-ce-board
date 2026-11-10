const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

/**
 * 로그인 페이지 GET
 */
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/board');
  }
  const errorMessage = req.session.errorMessage;
  const successMessage = req.session.successMessage;
  req.session.errorMessage = null;
  req.session.successMessage = null;

  res.render('auth/login', {
    pageTitle: '로그인 - 인덕대학교 컴퓨터전자공학과',
    errorMessage,
    successMessage
  });
});

/**
 * 로그인 처리 POST
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.session.errorMessage = '아이디와 비밀번호를 모두 입력해 주세요.';
    return res.redirect('/auth/login');
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      req.session.errorMessage = '존재하지 않는 아이디입니다.';
      return res.redirect('/auth/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.session.errorMessage = '비밀번호가 일치하지 않습니다.';
      return res.redirect('/auth/login');
    }

    // 세션에 유저 정보 저장 (비밀번호 제외)
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      student_id: user.student_id,
      role: user.role
    };

    req.session.successMessage = `${user.name}님 환영합니다!`;
    return res.redirect('/board');
  } catch (err) {
    console.error('[Auth Route] 로그인 에러:', err);
    req.session.errorMessage = '로그인 처리 중 오류가 발생했습니다.';
    return res.redirect('/auth/login');
  }
});

/**
 * 회원가입 페이지 GET
 */
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/board');
  }
  const errorMessage = req.session.errorMessage;
  req.session.errorMessage = null;

  res.render('auth/register', {
    pageTitle: '회원가입 - 인덕대학교 컴퓨터전자공학과',
    errorMessage
  });
});

/**
 * 회원가입 처리 POST
 * 복잡한 인증 절차 없이 아이디와 비밀번호, 이름만으로 즉시 가입 가능
 */
router.post('/register', async (req, res) => {
  const { username, password, passwordConfirm, name, student_id } = req.body;

  if (!username || !password || !name) {
    req.session.errorMessage = '아이디, 비밀번호, 이름은 필수 입력 항목입니다.';
    return res.redirect('/auth/register');
  }

  if (password.length < 4) {
    req.session.errorMessage = '비밀번호는 최소 4자 이상이어야 합니다.';
    return res.redirect('/auth/register');
  }

  if (password !== passwordConfirm) {
    req.session.errorMessage = '비밀번호 확인이 일치하지 않습니다.';
    return res.redirect('/auth/register');
  }

  try {
    // 아이디 중복 확인
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      req.session.errorMessage = '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.';
      return res.redirect('/auth/register');
    }

    // 비밀번호 해싱 후 계정 생성
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      'INSERT INTO users (username, password, name, student_id, role) VALUES (?, ?, ?, ?, ?)',
      [username.trim(), hashedPassword, name.trim(), student_id ? student_id.trim() : '', 'student']
    );

    req.session.successMessage = '회원가입이 완료되었습니다! 로그인해 주세요.';
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[Auth Route] 회원가입 에러:', err);
    req.session.errorMessage = '회원가입 처리 중 오류가 발생했습니다.';
    return res.redirect('/auth/register');
  }
});

/**
 * 로그아웃 처리 GET/POST
 */
router.all('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth Route] 세션 삭제 오류:', err);
    }
    res.redirect('/auth/login');
  });
});

module.exports = router;
