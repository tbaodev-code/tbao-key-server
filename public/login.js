/**
 * TBAO TEAM - AUTHENTICATION CLIENT SCRIPT
 * Chỉ xử lý gửi yêu cầu đăng nhập và nhận diện phản hồi từ máy chủ.
 * Tuyệt đối không chứa mã nguồn điều khiển giao diện Dashboard hay Tài liệu API.
 */

const $ = (id) => document.getElementById(id);

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `cyber-toast toast-${type}`;
  const icon = type === 'success' ? '⚡' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${String(message).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function updateLiveClock() {
  const clockEl = $('liveClock');
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
  }
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

function toggleMusic() {
  const music = $('bgMusic');
  const btn = $('musicBtn');
  const icon = $('musicIcon');

  if (!music || !btn) return;

  if (music.paused) {
    music.play().then(() => {
      btn.classList.add('playing');
      if (icon) icon.textContent = '🔊';
      showToast('Đang phát BGM Gaming', 'info');
    }).catch(() => {});
  } else {
    music.pause();
    btn.classList.remove('playing');
    if (icon) icon.textContent = '🎵';
  }
}

async function login() {
  const userInput = $('username');
  const passInput = $('password');
  const msgEl = $('loginMsg');
  const btn = $('loginBtn');

  const username = userInput ? userInput.value.trim() : '';
  const password = passInput ? passInput.value : '';

  if (!username || !password) {
    if (msgEl) {
      msgEl.textContent = '⚠️ VUI LÒNG NHẬP ĐẦY ĐỦ USERNAME VÀ MẬT KHẨU';
      msgEl.style.color = '#fb7185';
    }
    showToast('Vui lòng nhập đầy đủ thông tin', 'error');
    if (!username && userInput) userInput.focus();
    else if (!password && passInput) passInput.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }
  if (msgEl) {
    msgEl.textContent = 'ĐANG XÁC THỰC VỚI HỆ THỐNG...';
    msgEl.style.color = '#38bdf8';
  }

  try {
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const x = await res.json();

    if (x.ok) {
      if (msgEl) {
        msgEl.textContent = 'XÁC THỰC THÀNH CÔNG // ĐANG MỞ KHÓA GIAO DIỆN';
        msgEl.style.color = '#34d399';
      }
      showToast('Đăng nhập thành công! Đang chuyển hướng...', 'success');
      setTimeout(() => {
        window.location.href = '/';
      }, 350);
    } else {
      if (msgEl) {
        msgEl.style.color = '#fb7185';
        if (x.error === 'TOO_MANY_ATTEMPTS_PLEASE_WAIT') {
          msgEl.textContent = '⚠️ QUÁ NHIỀU LẦN THỬ SAI! VUI LÒNG ĐỢI 15 PHÚT.';
        } else {
          msgEl.textContent = '⚠️ MẬT MÃ HOẶC TÊN TRUY CẬP KHÔNG CHÍNH XÁC';
        }
      }
      showToast('Xác thực thất bại', 'error');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    if (msgEl) {
      msgEl.textContent = '⚠️ KHÔNG THỂ KẾT NỐI ĐẾN MÁY CHỦ';
      msgEl.style.color = '#fb7185';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = $('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', login);

  const passInput = $('password');
  if (passInput) {
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') login();
    });
  }

  const userInput = $('username');
  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (passInput) passInput.focus();
        else login();
      }
    });
  }

  const musicBtn = $('musicBtn');
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);

  checkStatus();
  setInterval(checkStatus, 15000);
});

async function checkStatus() {
  try {
    const res = await fetch('/status');
    const x = await res.json();
    const el = $('status');
    if (el) {
      if (x.ok) {
        el.innerHTML = `<span class="status-pulse"></span><span class="status-text">ONLINE // ${(x.database || 'TURSO_CLOUD').toUpperCase()}</span>`;
      } else {
        el.innerHTML = `<span class="status-pulse" style="background:#fb7185"></span><span class="status-text" style="color:#fb7185">OFFLINE</span>`;
      }
    }
  } catch {}
}

