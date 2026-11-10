/**
 * 인덕대학교 컴퓨터전자공학과 게시판 클라이언트 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 알림 메시지(Alert) 5초 후 자동 페이드아웃
  const alerts = document.querySelectorAll('.alert');
  if (alerts.length > 0) {
    setTimeout(() => {
      alerts.forEach(alert => {
        alert.style.transition = 'opacity 0.5s ease';
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 500);
      });
    }, 5000);
  }

  // 2. 파일 업로드 크기 사전 검증 (클라이언트 레벨)
  const fileInput = document.getElementById('file');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const file = this.files[0];
      if (file) {
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
          alert('첨부파일 크기는 최대 20MB까지 업로드 가능합니다.');
          this.value = '';
          return false;
        }
      }
    });
  }

  // 3. 폼 중복 전송 방지
  const forms = document.querySelectorAll('.post-form, .auth-form, .comment-form');
  forms.forEach(form => {
    form.addEventListener('submit', function () {
      const submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn) {
        // 잠시 후 버튼 비활성화 (전송 이벤트는 정상 발생하도록)
        setTimeout(() => {
          submitBtn.disabled = true;
          submitBtn.dataset.originalHtml = submitBtn.innerHTML;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
        }, 10);
      }
    });
  });
});
