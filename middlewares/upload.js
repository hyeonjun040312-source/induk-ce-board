const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 스토리지 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 한글 파일명 복원 (Latin-1 to UTF-8 변환)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});

// 파일 크기 및 필터링 설정
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 최대 20MB
  },
  fileFilter: (req, file, cb) => {
    // 악성 실행 파일 차단
    const forbiddenExts = ['.exe', '.sh', '.bat', '.cmd', '.vbs', '.js', '.msi'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (forbiddenExts.includes(ext)) {
      return cb(new Error('보안상 실행 파일(.exe, .bat 등)은 업로드할 수 없습니다.'));
    }
    cb(null, true);
  }
});

module.exports = upload;
