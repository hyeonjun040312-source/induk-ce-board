const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/board');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 템플릿 엔진 설정 (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. 바디 파서 미들웨어
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 3. 정적 파일 디렉토리 제공
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. 세션 설정 (인증 상태 유지)
app.use(session({
  name: 'induk_ce_session',
  secret: 'induk-computer-electronic-engineering-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24시간 세션 유지
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// 5. 모든 템플릿에서 공통으로 사용할 전역 변수 등록
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// 6. 라우트 등록
app.use('/auth', authRoutes);
app.use('/board', boardRoutes);
app.use('/admin', adminRoutes);

// 기본 루트는 게시판 목록으로 리다이렉트
app.get('/', (req, res) => {
  res.redirect('/board');
});

// 7. 404 Not Found 처리
app.use((req, res) => {
  res.status(404).render('error', {
    status: 404,
    title: '페이지를 찾을 수 없습니다 (404 Not Found)',
    message: '요청하신 주소의 페이지가 존재하지 않거나 이동되었습니다.',
    user: req.session.user
  });
});

// 8. 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).render('error', {
    status: err.status || 500,
    title: '서버 오류 발생',
    message: err.message || '서버 내부에서 오류가 발생했습니다.',
    user: req.session ? req.session.user : null
  });
});

// 9. 서버 실행
app.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 [인덕대학교 컴퓨터전자공학과 게시판 서버 시작]`);
  console.log(`🌐 접속 주소: http://localhost:${PORT}`);
  console.log(`📌 기본 계정 안내:`);
  console.log(`   - 관리자: 아이디 [admin] / 비밀번호 [admin1234]`);
  console.log(`   - 학생1 : 아이디 [student1] / 비밀번호 [student1234]`);
  console.log(`   - 학생2 : 아이디 [student2] / 비밀번호 [student1234]`);
  console.log('========================================================');
});
