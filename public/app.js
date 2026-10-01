// Helper chọn element
const $ = (id) => document.getElementById(id);

let cachedKeys = [];
let cachedDevices = [];
let lastCreatedKey = '';
let activeSdkTab = 'csharp';

// Toast Notification System
function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `cyber-toast toast-${type}`;
  const icon = type === 'success' ? '⚡' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// API Helper
async function api(u, o = {}) {
  const r = await fetch(u, {
    headers: { 'Content-Type': 'application/json', ...(o.headers || {}) },
    ...o
  });
  let x = {};
  try {
    x = await r.json();
  } catch {}
  if (r.status === 401) {
    showLogin();
  }
  return x;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function fmt(v) {
  if (!v) return '<span style="color:#d8b4fe">Vĩnh viễn ∞</span>';
  const d = new Date(v);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function showLogin() {
  const loginCard = $('loginCard');
  const panel = $('panel');
  if (loginCard) loginCard.hidden = false;
  if (panel) panel.hidden = true;
}

function showPanel() {
  const loginCard = $('loginCard');
  const panel = $('panel');
  if (loginCard) loginCard.hidden = true;
  if (panel) panel.hidden = false;
  loadAll();
}

async function checkSession() {
  const x = await api('/admin/session');
  x.logged_in ? showPanel() : showLogin();
}

async function login() {
  const btn = $('loginBtn');
  const userInput = $('username');
  const passInput = $('password');
  const msgEl = $('loginMsg');

  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }

  try {
    const x = await api('/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: userInput ? userInput.value : '',
        password: passInput ? passInput.value : ''
      })
    });

    if (x.ok) {
      if (msgEl) {
        msgEl.textContent = 'XÁC THỰC THÀNH CÔNG // KHỞI ĐỘNG HỆ THỐNG';
        msgEl.style.color = '#34d399';
      }
      showToast('Đăng nhập thành công!', 'success');
      setTimeout(showPanel, 300);
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

async function logout() {
  await api('/admin/logout', { method: 'POST' });
  showToast('Đã đăng xuất phiên làm việc', 'info');
  showLogin();
}

async function loadDevices() {
  const x = await api('/admin/devices');
  if (!x.ok) return;
  
  cachedDevices = x.data || [];

  const statEl = $('statDevices');
  if (statEl) statEl.textContent = cachedDevices.length;

  filterDevices();
}

function renderDevices(devices) {
  const tbody = $('devicesBody');
  const mContainer = $('devicesCardsMobile');

  if (!devices || devices.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:24px;">Chưa có thiết bị nào kết nối</td></tr>`;
    }
    if (mContainer) {
      mContainer.innerHTML = `<div style="text-align:center;color:#64748b;padding:20px;background:var(--bg-surface-2);border-radius:10px;">Chưa có thiết bị nào kết nối</div>`;
    }
    return;
  }

  if (tbody) {
    tbody.innerHTML = devices.map(d => `
        <tr>
          <td><span class="key-code-badge">${esc(d.hwid)}</span></td>
          <td><span style="color:#cbd5e1">${esc(d.cpu_info || 'Standard Hardware')}</span></td>
          <td><span style="color:#94a3b8">${esc(d.os_info || 'Unknown OS')}</span></td>
          <td><span style="color:#a78bfa">${fmt(d.last_seen_at)}</span></td>
          <td>
            <div class="table-btn-group">
              <button type="button" class="btn-action-mini" data-forge="${esc(d.hwid)}" title="Cấp key cho máy này">⚡ CẤP KEY</button>
              <button type="button" class="btn-action-mini" data-copy="${esc(d.hwid)}" title="Copy HWID">📋</button>
            </div>
          </td>
        </tr>
      `).join('');
  }

  // Render Mobile Cards cho Thiết Bị
  if (mContainer) {
    mContainer.innerHTML = devices.map(d => `
        <div class="cyber-mobile-card">
          <div class="card-m-header">
            <div class="card-m-title">
              <span style="font-size:16px;">💻</span>
              <span class="key-code-badge" style="font-size:12px;">${esc(d.hwid)}</span>
            </div>
            <button type="button" class="btn-mini-copy" data-copy="${esc(d.hwid)}" title="Sao chép HWID">📋</button>
          </div>
          <div class="card-m-body">
            <div class="card-m-row">
              <span class="card-m-label">CPU HARDWARE</span>
              <span class="card-m-val" style="color:#cbd5e1;">${esc(d.cpu_info || 'Standard Hardware')}</span>
            </div>
            <div class="card-m-row">
              <span class="card-m-label">HỆ ĐIỀU HÀNH</span>
              <span class="card-m-val" style="color:#94a3b8;">${esc(d.os_info || 'Unknown OS')}</span>
            </div>
            <div class="card-m-row">
              <span class="card-m-label">ONLINE CUỐI</span>
              <span class="card-m-val" style="color:#a78bfa;">${fmt(d.last_seen_at)}</span>
            </div>
          </div>
          <div class="device-m-actions">
            <button type="button" class="btn btn-cyber-primary btn-m-full" data-forge="${esc(d.hwid)}">
              <span>⚡ CẤP KEY CHO MÁY NÀY</span>
            </button>
            <button type="button" class="btn btn-secondary btn-m-full" data-copy="${esc(d.hwid)}" title="Copy HWID">
              <span>📋 SAO CHÉP</span>
            </button>
          </div>
        </div>
      `).join('');
  }
}

async function loadKeys() {
  const x = await api('/admin/keys');
  if (!x.ok) return;
  cachedKeys = x.data || [];

  const statKeys = $('statKeys');
  const statActive = $('statActive');
  const statShared = $('statShared');

  if (statKeys) statKeys.textContent = cachedKeys.length;
  if (statActive) statActive.textContent = cachedKeys.filter(k => k.status === 'active').length;
  if (statShared) statShared.textContent = cachedKeys.filter(k => ['shared_flagged', 'banned'].includes(k.status)).length;

  filterKeys(); // Lọc và render theo trạng thái ô tìm kiếm hiện thời
}

function renderKeys(keys) {
  const tbody = $('keysBody');
  const mContainer = $('keysCardsMobile');

  if (!keys || keys.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:30px;">Không có mã bản quyền nào</td></tr>`;
    }
    if (mContainer) {
      mContainer.innerHTML = '';
    }
    return;
  }

  // 1. Render Desktop Table (Hiển thị màn hình >= 768px)
  if (tbody) {
    tbody.innerHTML = keys.map(k => {
      const bound = k.bound_count || 0;
      const limit = k.device_limit || 1;
      const pct = Math.min(100, (bound / limit) * 100);
      const isFull = bound >= limit;

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="key-code-badge">${esc(k.key_code)}</span>
              <button type="button" class="btn-mini-copy" data-copy="${esc(k.key_code)}" title="Copy Key">📋</button>
            </div>
          </td>
          <td><span style="font-family:monospace;font-size:12px;color:#94a3b8">${esc(k.primary_hwid)}</span></td>
          <td><b>${limit}</b></td>
          <td>
            <div class="device-ratio-wrap">
              <span style="font-family:Rajdhani;font-weight:700;font-size:14px;color:${isFull ? '#fbbf24' : '#34d399'}">${bound}/${limit}</span>
              <div class="ratio-track">
                <div class="ratio-bar ${isFull ? 'full' : ''}" style="width:${pct}%"></div>
              </div>
            </div>
          </td>
          <td><span class="badge ${esc(k.status)}">● ${esc(k.status)}</span></td>
          <td>${fmt(k.expires_at)}</td>
          <td><span style="color:#94a3b8;font-size:12px">${esc(k.note || '-')}</span></td>
          <td>
            <div class="table-btn-group">
              <button type="button" class="btn-action-mini" data-action="test" data-key="${esc(k.key_code)}" data-hwid="${esc(k.primary_hwid)}" title="Thử nghiệm API trực tiếp">⚡</button>
              <button type="button" class="btn-action-mini" data-action="edit" data-key="${esc(k.key_code)}" title="Chỉnh sửa giới hạn">✏️</button>
              <button type="button" class="btn-action-mini" data-action="renew" data-key="${esc(k.key_code)}" title="Gia hạn ngày">⏳</button>
              <button type="button" class="btn-action-mini" data-action="toggle" data-key="${esc(k.key_code)}" data-next="${k.status === 'banned' ? 'unban' : 'ban'}" title="${k.status === 'banned' ? 'Mở khóa' : 'Khóa'}">
                ${k.status === 'banned' ? '🔓' : '🔒'}
              </button>
              <button type="button" class="btn-action-mini danger" data-action="delete" data-key="${esc(k.key_code)}" title="Xóa key">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 2. Render Cyber Mobile Cards (Hiển thị riêng cho điện thoại < 768px)
  if (mContainer) {
    mContainer.innerHTML = keys.map(k => {
      const bound = k.bound_count || 0;
      const limit = k.device_limit || 1;
      const pct = Math.min(100, (bound / limit) * 100);
      const isFull = bound >= limit;

      return `
        <div class="cyber-mobile-card">
          <div class="card-m-header">
            <div class="card-m-title">
              <span class="key-code-badge">${esc(k.key_code)}</span>
              <button type="button" class="btn-mini-copy" data-copy="${esc(k.key_code)}" title="Sao chép Key">📋</button>
            </div>
            <span class="badge ${esc(k.status)}">● ${esc(k.status)}</span>
          </div>

          <div class="card-m-body">
            <div class="card-m-hwid-box">
              <span class="card-m-hwid-text" title="${esc(k.primary_hwid)}">${esc(k.primary_hwid)}</span>
              <button type="button" class="btn-mini-copy" data-copy="${esc(k.primary_hwid)}" title="Sao chép HWID">📋</button>
            </div>

            <div class="card-m-row">
              <span class="card-m-label">THIẾT BỊ CHO PHÉP</span>
              <div class="device-ratio-wrap" style="width:120px;">
                <span style="font-family:Rajdhani;font-weight:700;font-size:13px;color:${isFull ? '#fbbf24' : '#34d399'}">${bound}/${limit}</span>
                <div class="ratio-track" style="width:70px;">
                  <div class="ratio-bar ${isFull ? 'full' : ''}" style="width:${pct}%"></div>
                </div>
              </div>
            </div>

            <div class="card-m-row">
              <span class="card-m-label">THỜI HẠN DÙNG</span>
              <span class="card-m-val">${fmt(k.expires_at)}</span>
            </div>

            ${k.note ? `<div class="card-m-note">📝 <b>Ghi chú:</b> ${esc(k.note)}</div>` : ''}
          </div>

          <div class="card-m-actions">
            <button type="button" class="btn-m-action" data-action="test" data-key="${esc(k.key_code)}" data-hwid="${esc(k.primary_hwid)}" title="Test API">
              <span class="action-icon">⚡</span>
              <span>TEST</span>
            </button>
            <button type="button" class="btn-m-action" data-action="edit" data-key="${esc(k.key_code)}" title="Chỉnh sửa">
              <span class="action-icon">✏️</span>
              <span>SỬA</span>
            </button>
            <button type="button" class="btn-m-action" data-action="renew" data-key="${esc(k.key_code)}" title="Gia hạn">
              <span class="action-icon">⏳</span>
              <span>HẠN</span>
            </button>
            <button type="button" class="btn-m-action" data-action="toggle" data-key="${esc(k.key_code)}" data-next="${k.status === 'banned' ? 'unban' : 'ban'}" title="${k.status === 'banned' ? 'Mở khóa' : 'Khóa'}">
              <span class="action-icon">${k.status === 'banned' ? '🔓' : '🔒'}</span>
              <span>${k.status === 'banned' ? 'MỞ' : 'KHÓA'}</span>
            </button>
            <button type="button" class="btn-m-action danger" data-action="delete" data-key="${esc(k.key_code)}" title="Xóa vĩnh viễn">
              <span class="action-icon">🗑️</span>
              <span>XÓA</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// BỘ LỌC TÌM KIẾM THỜI GIAN THỰC CHO BẢN QUYỀN (REALTIME KEYS SEARCH)
function filterKeys() {
  const searchInput = $('keySearchInput');
  const clearBtn = $('clearSearchBtn');
  const emptyBox = $('keySearchEmpty');
  const emptyText = $('emptySearchQueryText');
  const tableWrap = document.querySelector('#keysSection .cyber-table-wrap');
  const mobileContainer = $('keysCardsMobile');

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  // Điều khiển nút Clear X
  if (clearBtn) {
    clearBtn.hidden = !query;
  }

  // Nếu rỗng: hiển thị toàn bộ
  if (!query) {
    if (emptyBox) emptyBox.hidden = true;
    if (tableWrap) tableWrap.style.display = '';
    if (mobileContainer) mobileContainer.style.display = '';
    renderKeys(cachedKeys);
    return;
  }

  // Lọc theo Key, HWID, Ghi chú, Trạng thái
  const filtered = cachedKeys.filter(k => 
    (k.key_code && k.key_code.toLowerCase().includes(query)) ||
    (k.primary_hwid && k.primary_hwid.toLowerCase().includes(query)) ||
    (k.note && k.note.toLowerCase().includes(query)) ||
    (k.status && k.status.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    // Không tìm thấy kết quả
    if (emptyBox) emptyBox.hidden = false;
    if (emptyText) emptyText.textContent = `Không tìm thấy bản quyền nào khớp với từ khóa "${query}".`;
    if (tableWrap) tableWrap.style.display = 'none';
    if (mobileContainer) mobileContainer.style.display = 'none';
    renderKeys([]);
  } else {
    // Tìm thấy kết quả
    if (emptyBox) emptyBox.hidden = true;
    if (tableWrap) tableWrap.style.display = '';
    if (mobileContainer) mobileContainer.style.display = '';
    renderKeys(filtered);
  }
}

function clearSearch() {
  const searchInput = $('keySearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  filterKeys();
}

// BỘ LỌC TÌM KIẾM THỜI GIAN THỰC CHO THIẾT BỊ (REALTIME RIGS SEARCH)
function filterDevices() {
  const searchInput = $('deviceSearchInput');
  const clearBtn = $('clearDeviceSearchBtn');
  const emptyBox = $('deviceSearchEmpty');
  const emptyText = $('emptyDeviceSearchQueryText');
  const tableWrap = document.querySelector('#devicesSection .cyber-table-wrap');
  const mobileContainer = $('devicesCardsMobile');

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  // Điều khiển nút Clear X
  if (clearBtn) {
    clearBtn.hidden = !query;
  }

  // Nếu rỗng: hiển thị toàn bộ
  if (!query) {
    if (emptyBox) emptyBox.hidden = true;
    if (tableWrap) tableWrap.style.display = '';
    if (mobileContainer) mobileContainer.style.display = '';
    renderDevices(cachedDevices);
    return;
  }

  // Lọc theo HWID, CPU, Hệ điều hành
  const filtered = cachedDevices.filter(d => 
    (d.hwid && d.hwid.toLowerCase().includes(query)) ||
    (d.cpu_info && d.cpu_info.toLowerCase().includes(query)) ||
    (d.os_info && d.os_info.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    // Không tìm thấy kết quả
    if (emptyBox) emptyBox.hidden = false;
    if (emptyText) emptyText.textContent = `Không tìm thấy thiết bị nào khớp với từ khóa "${query}".`;
    if (tableWrap) tableWrap.style.display = 'none';
    if (mobileContainer) mobileContainer.style.display = 'none';
    renderDevices([]);
  } else {
    // Tìm thấy kết quả
    if (emptyBox) emptyBox.hidden = true;
    if (tableWrap) tableWrap.style.display = '';
    if (mobileContainer) mobileContainer.style.display = '';
    renderDevices(filtered);
  }
}

function clearDeviceSearch() {
  const searchInput = $('deviceSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  filterDevices();
}

async function loadAll() {
  await Promise.all([loadDevices(), loadKeys()]);
}

// Key Forge Presets
function setDuration(days, targetBtn) {
  const durInput = $('duration');
  const foreverCheck = $('forever');
  if (durInput) durInput.value = days;
  if (foreverCheck) foreverCheck.checked = false;

  document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  if (targetBtn) targetBtn.classList.add('active');
}

function toggleForever(isForever) {
  const durInput = $('duration');
  if (isForever) {
    if (durInput) durInput.value = '';
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  } else {
    if (durInput) durInput.value = '30';
  }
}

async function createKey() {
  const hwidInput = $('hwidInput');
  const hwid = hwidInput ? hwidInput.value.trim() : '';

  if (!hwid) {
    showToast('Vui lòng nhập Primary HWID!', 'error');
    if (hwidInput) hwidInput.focus();
    return;
  }

  const foreverCheck = $('forever');
  const durInput = $('duration');
  const noteInput = $('note');
  const limitInput = $('deviceLimit');

  const duration = (foreverCheck && foreverCheck.checked) ? 'forever' : (durInput ? durInput.value : '30');
  const note = noteInput ? noteInput.value.trim() : '';
  const limit = limitInput ? (Number(limitInput.value) || 1) : 1;

  const resultBox = $('resultBox');
  const createResult = $('createResult');

  const x = await api('/admin/create-key', {
    method: 'POST',
    body: JSON.stringify({
      primary_hwid: hwid,
      device_limit: limit,
      duration_days: duration,
      note: note
    })
  });

  if (x.ok) {
    lastCreatedKey = x.key;
    if (resultBox) resultBox.hidden = false;
    if (createResult) {
      createResult.textContent = `[+] KEY CREATED: ${x.key}\n[+] PRIMARY HWID: ${x.primary_hwid}\n[+] DEVICE LIMIT: ${x.device_limit}\n[+] EXPIRES AT: ${fmt(x.expires_at)}`;
    }
    if (hwidInput) hwidInput.value = '';
    if (noteInput) noteInput.value = '';
    showToast(`Đã sinh Key: ${x.key}`, 'success');
    loadAll();
  } else {
    if (resultBox) resultBox.hidden = false;
    if (createResult) {
      createResult.textContent = `[-] ERROR: ${x.error || 'CANNOT_CREATE_KEY'}`;
    }
    showToast('Tạo Key thất bại: ' + (x.error || 'Lỗi CSDL'), 'error');
  }
}

function copyCreatedKey() {
  if (lastCreatedKey) {
    copyToClipboard(lastCreatedKey);
  } else {
    showToast('Chưa có mã key nào để sao chép', 'info');
  }
}

function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Đã sao chép: ${text}`, 'success');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  showToast(`Đã sao chép: ${text}`, 'success');
}

async function editKey(k) {
  const current = cachedKeys.find(item => item.key_code === k);
  const currentLimit = current ? current.device_limit : '1';
  const currentNote = current ? (current.note || '') : '';

  const d = prompt(`Giới hạn thiết bị mới cho ${k}:`, currentLimit);
  if (d === null) return;
  const n = prompt('Ghi chú mới:', currentNote);

  const x = await api('/admin/edit-key', {
    method: 'POST',
    body: JSON.stringify({ key_code: k, device_limit: Number(d), note: n })
  });

  if (x.ok) {
    showToast('Đã cập nhật key thành công', 'success');
  } else {
    showToast(x.error || 'Lỗi khi cập nhật', 'error');
  }
  loadKeys();
}

async function addDays(k) {
  const d = prompt(`Cộng thêm bao nhiêu ngày cho ${k}?`, '7');
  if (d === null) return;
  const x = await api('/admin/renew-key', {
    method: 'POST',
    body: JSON.stringify({ key_code: k, add_days: Number(d) })
  });

  if (x.ok) {
    showToast(`Hạn mới: ${fmt(x.new_expires_at)}`, 'success');
  } else {
    showToast(x.error || 'Lỗi khi gia hạn', 'error');
  }
  loadKeys();
}

async function toggleKey(k, a) {
  const actionText = a === 'ban' ? 'KHÓA' : 'MỞ KHÓA';
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} key ${k}?`)) return;

  const x = await api('/admin/toggle-ban', {
    method: 'POST',
    body: JSON.stringify({ key_code: k, action: a })
  });

  if (x.ok) {
    showToast(`Đã ${actionText.toLowerCase()} key ${k}`, 'success');
  } else {
    showToast(x.error || 'Lỗi cập nhật', 'error');
  }
  loadKeys();
}

async function deleteKey(k) {
  if (!confirm(`⚠️ CẢNH BÁO NGUY HIỂM:\nXóa vĩnh viễn key ${k}? Mọi dữ liệu ràng buộc thiết bị sẽ bị hủy bỏ!`)) return;

  const x = await api('/admin/delete-key', {
    method: 'POST',
    body: JSON.stringify({ key_code: k })
  });

  if (x.ok) {
    showToast(`Đã xóa vĩnh viễn key ${k}`, 'success');
  } else {
    showToast(x.error || 'Lỗi xóa key', 'error');
  }
  loadKeys();
}

// Live Clock HUD
function updateLiveClock() {
  const clockEl = $('liveClock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('vi-VN');
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// System Status Check
async function status() {
  try {
    const x = await api('/status');
    const statusEl = $('status');
    if (!statusEl) return;

    if (x.ok) {
      statusEl.innerHTML = `<span class="status-pulse"></span><span class="status-text">SYSTEM ONLINE</span>`;
      statusEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      statusEl.style.color = '#34d399';
    } else {
      statusEl.innerHTML = `<span class="status-pulse" style="background:#f43f5e"></span><span class="status-text">DATABASE OFFLINE</span>`;
      statusEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      statusEl.style.color = '#fb7185';
    }
  } catch {
    const statusEl = $('status');
    if (!statusEl) return;
    statusEl.innerHTML = `<span class="status-pulse" style="background:#f43f5e"></span><span class="status-text">SERVER OFFLINE</span>`;
    statusEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
    statusEl.style.color = '#fb7185';
  }
}

// Cyber Music Player Toggle
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
    }).catch(err => {
      console.warn('Audio play restricted by browser:', err);
    });
  } else {
    music.pause();
    btn.classList.remove('playing');
    if (icon) icon.textContent = '🎵';
  }
}

// ================== DOCS & LIVE TESTER LOGIC ==================
function toggleDocs(show) {
  const docs = $('apiDocsSection');
  if (!docs) return;

  if (typeof show === 'boolean') {
    docs.hidden = !show;
  } else {
    docs.hidden = !docs.hidden;
  }

  if (!docs.hidden) {
    docs.scrollIntoView({ behavior: 'smooth' });
    showToast('Đã mở tài liệu API', 'info');
  }
}

// Trình kiểm thử API trực tiếp
async function runApiTest() {
  const keyInput = $('testKeyInput');
  const hwidInput = $('testHwidInput');
  const resBox = $('testResultBox');
  const resJson = $('testResultJson');
  const statusBadge = $('testHttpStatus');

  const key = keyInput ? keyInput.value.trim() : '';
  const hwid = hwidInput ? hwidInput.value.trim() : '';

  if (!key || !hwid) {
    showToast('Vui lòng nhập cả Key và HWID để test!', 'error');
    return;
  }

  if (resBox) resBox.hidden = false;
  if (resJson) resJson.textContent = '// Đang gửi yêu cầu tới server...';

  try {
    const startTime = Date.now();
    const nonce = 'web_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const timestamp = Date.now();

    const res = await fetch('/api/v1/check-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hwid, nonce, timestamp })
    });
    const latency = Date.now() - startTime;
    const data = await res.json();

    if (statusBadge) {
      statusBadge.textContent = `HTTP ${res.status} (${latency}ms)`;
      statusBadge.className = `badge ${res.ok ? 'active' : 'banned'}`;
    }

    if (resJson) {
      resJson.textContent = JSON.stringify(data, null, 2);
    }

    if (res.ok && data.valid) {
      showToast('Kết quả: Key hợp lệ (200 OK)', 'success');
    } else {
      showToast(`Từ chối: ${data.reason || 'FAILED'} (${res.status})`, 'error');
    }
  } catch (err) {
    if (resJson) resJson.textContent = '// Lỗi mạng hoặc không thể kết nối: ' + err.message;
    if (statusBadge) {
      statusBadge.textContent = 'NETWORK_ERROR';
      statusBadge.className = 'badge banned';
    }
    showToast('Lỗi gửi request', 'error');
  }
}

// Chuyển Tab Code mẫu
function switchSdkTab(tabName) {
  activeSdkTab = tabName;
  document.querySelectorAll('.sdk-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const allTabs = ['csharp', 'cpp', 'python', 'nodejs', 'curl'];
  allTabs.forEach(t => {
    const el = $('tab-' + t);
    if (el) el.hidden = (t !== tabName);
  });
}

function copyActiveSdkCode() {
  const activeBox = $('tab-' + activeSdkTab);
  if (!activeBox) return;
  const code = activeBox.querySelector('code');
  if (code) {
    copyToClipboard(code.innerText);
  }
}

// Tự động đồng bộ URL hiện tại vào tài liệu & code SDK mẫu
function syncOriginInDocs() {
  try {
    const origin = window.location.origin;
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);

    const baseUrlEl = $('docsBaseUrl');
    if (baseUrlEl) baseUrlEl.textContent = origin;

    const curlEl = $('quickCurlText');
    if (curlEl) {
      curlEl.textContent = `curl -X POST "${origin}/api/v1/check-key" -H "Content-Type: application/json" -d "{\\"key\\":\\"TBAO-TEST-KEY\\",\\"hwid\\":\\"HWID-MY-PC\\"}"`;
    }

    document.querySelectorAll('.sdk-code-box code').forEach(codeEl => {
      let text = codeEl.innerHTML;
      text = text.replace(/http:\/\/localhost:3000/g, origin);
      text = text.replace(/CheckLicense\(L"localhost", 3000/g, `CheckLicense(L"${host}", ${port}`);
      codeEl.innerHTML = text;
    });
  } catch (err) {
    console.warn('Sync docs origin error:', err);
  }
}

// Xử lý hành động trên Key (dùng chung cho cả Desktop Table và Mobile Cards)
function handleKeyAction(target) {
  if (target.dataset.copy) {
    copyToClipboard(target.dataset.copy);
    return;
  }

  const act = target.dataset.action;
  const key = target.dataset.key;
  if (!act || !key) return;

  if (act === 'test') {
    const testKeyInput = $('testKeyInput');
    const testHwidInput = $('testHwidInput');
    if (testKeyInput) testKeyInput.value = key;
    if (testHwidInput) testHwidInput.value = target.dataset.hwid || '';
    toggleDocs(true);
    const testerCard = document.querySelector('.tester-card');
    if (testerCard) testerCard.scrollIntoView({ behavior: 'smooth' });
    showToast(`Đã nạp ${key} vào Live Tester`, 'info');
    return;
  }

  if (act === 'edit') editKey(key);
  else if (act === 'renew') addDays(key);
  else if (act === 'toggle') toggleKey(key, target.dataset.next);
  else if (act === 'delete') deleteKey(key);
}

// Xử lý hành động trên Thiết bị (dùng chung cho Desktop và Mobile Cards)
function handleDeviceAction(target) {
  if (target.dataset.copy) {
    copyToClipboard(target.dataset.copy);
    return;
  }

  if (target.dataset.forge) {
    const hwidInput = $('hwidInput');
    if (hwidInput) {
      hwidInput.value = target.dataset.forge;
      hwidInput.scrollIntoView({ behavior: 'smooth' });
      hwidInput.focus();
    }
    showToast(`Đã nạp HWID vào ô Tạo Key!`, 'info');
  }
}

// Khởi tạo Mobile Bottom Navigation
function initBottomNav() {
  const nav = $('mobileBottomNav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.bottom-nav-item');
    if (!btn) return;
    const targetId = btn.dataset.target;
    if (!targetId) return;

    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (targetId === 'apiDocsSection') {
      toggleDocs(true);
      const docs = $('apiDocsSection');
      if (docs) docs.scrollIntoView({ behavior: 'smooth' });
    } else {
      const targetEl = $(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
}

// ================== PYTHON CODE PROTECTOR COMPONENT ==================
let selectedPyFile = null;
let originalPyCode = '';
let protectedPyCode = '';
let protectedFileName = '';

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

let protectInputMode = 'upload'; // 'upload' or 'paste'

function switchProtectInputMode(mode) {
  protectInputMode = mode;
  const tabUpload = $('tabUploadFileBtn');
  const tabPaste = $('tabPasteCodeBtn');
  const uploadContainer = $('pyUploadContainer');
  const pasteContainer = $('pyPasteContainer');
  const buildBtn = $('buildProtectedBtn');

  if (mode === 'upload') {
    if (tabUpload) tabUpload.classList.add('active');
    if (tabPaste) tabPaste.classList.remove('active');
    if (uploadContainer) uploadContainer.hidden = false;
    if (pasteContainer) pasteContainer.hidden = true;
    if (buildBtn) buildBtn.disabled = !selectedPyFile || !originalPyCode;
  } else {
    if (tabPaste) tabPaste.classList.add('active');
    if (tabUpload) tabUpload.classList.remove('active');
    if (uploadContainer) uploadContainer.hidden = true;
    if (pasteContainer) pasteContainer.hidden = false;
    const directCode = $('pyDirectCodeInput');
    if (buildBtn) buildBtn.disabled = !(directCode && directCode.value.trim().length > 0);
  }
}

function handlePyFileSelect(file) {
  if (!file) return;

  const fileNameLower = (file.name || '').toLowerCase();
  if (file.name && !fileNameLower.endsWith('.py') && !fileNameLower.endsWith('.txt')) {
    showToast('Tệp đã chọn không có đuôi .py, hệ thống sẽ tự động gán .py khi bảo vệ!', 'warning');
  }

  selectedPyFile = file;
  const displayName = file.name || 'script.py';
  const fileNameEl = $('pyFileName');
  const fileSizeEl = $('pyFileSize');
  const fileInfoBox = $('pyFileInfoBox');
  const dropzone = $('pyDropzone');
  const buildBtn = $('buildProtectedBtn');
  const resultBox = $('buildResultBox');

  if (fileNameEl) fileNameEl.textContent = displayName;
  if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size || 0);
  if (fileInfoBox) fileInfoBox.hidden = false;
  if (dropzone) dropzone.style.display = 'none';
  if (buildBtn && protectInputMode === 'upload') buildBtn.disabled = false;
  if (resultBox) resultBox.hidden = true;

  const reader = new FileReader();
  reader.onload = (e) => {
    originalPyCode = e.target.result;
    showToast(`Đã nạp ${displayName} (${formatBytes(file.size || 0)})`, 'info');
  };
  reader.onerror = () => {
    showToast('Lỗi khi đọc file trên thiết bị!', 'error');
  };
  reader.readAsText(file, 'utf-8');
}

function removePyFile() {
  selectedPyFile = null;
  originalPyCode = '';
  protectedPyCode = '';
  protectedFileName = '';

  const fileInput = $('pyFileInput');
  if (fileInput) fileInput.value = '';

  const fileInfoBox = $('pyFileInfoBox');
  const dropzone = $('pyDropzone');
  const buildBtn = $('buildProtectedBtn');
  const resultBox = $('buildResultBox');

  if (fileInfoBox) fileInfoBox.hidden = true;
  if (dropzone) dropzone.style.display = '';
  if (buildBtn && protectInputMode === 'upload') buildBtn.disabled = true;
  if (resultBox) resultBox.hidden = true;
}

async function buildProtectedCode() {
  let codeToProtect = '';
  let targetFileName = 'protected_script.py';

  if (protectInputMode === 'paste') {
    const directCodeEl = $('pyDirectCodeInput');
    codeToProtect = directCodeEl ? directCodeEl.value.trim() : '';
    if (!codeToProtect) {
      showToast('Vui lòng nhập hoặc dán mã Python vào ô văn bản!', 'error');
      return;
    }
    const customNameEl = $('pyCustomOutputName');
    const baseName = (customNameEl ? customNameEl.value.trim() : 'tool.py') || 'tool.py';
    targetFileName = baseName.replace(/\.py$/i, '') + '_protected.py';
  } else {
    if (!selectedPyFile || !originalPyCode) {
      showToast('Vui lòng chọn hoặc tải lên file Python trước khi build!', 'error');
      return;
    }
    codeToProtect = originalPyCode;
    const baseName = selectedPyFile.name || 'script.py';
    targetFileName = baseName.replace(/\.py$/i, '') + '_protected.py';
  }

  const buildBtn = $('buildProtectedBtn');
  if (buildBtn) {
    buildBtn.disabled = true;
    buildBtn.innerHTML = '<span>⏳ ĐANG BẢO VỆ CODE...</span>';
  }

  try {
    const customUrlInput = $('customServerUrlInput');
    const customUrl = customUrlInput ? customUrlInput.value.trim() : '';
    const origin = customUrl || window.location.origin;
    const res = await api('/api/v1/protect-code', {
      method: 'POST',
      body: JSON.stringify({
        code: codeToProtect,
        server_url: origin
      })
    });

    if (res.ok && res.protected_code) {
      protectedPyCode = res.protected_code;
      protectedFileName = targetFileName;

      const downloadFileName = $('downloadFileName');
      if (downloadFileName) downloadFileName.textContent = protectedFileName;

      const previewPre = $('protectedCodePre');
      if (previewPre) previewPre.textContent = protectedPyCode;

      const resultBox = $('buildResultBox');
      if (resultBox) {
        resultBox.hidden = false;
        resultBox.scrollIntoView({ behavior: 'smooth' });
      }

      showToast(`✓ Đã bảo vệ thành công mã nguồn!`, 'success');
    } else {
      showToast(res.message || res.error || 'Lỗi khi bảo vệ mã nguồn!', 'error');
    }
  } catch (err) {
    console.error('Build protected code error:', err);
    showToast(err.message || 'Lỗi kết nối máy chủ!', 'error');
  } finally {
    if (buildBtn) {
      buildBtn.disabled = false;
      buildBtn.innerHTML = '<span>⚡ BUILD / BẢO VỆ CODE</span>';
    }
  }
}

function downloadProtectedFile() {
  if (!protectedPyCode) {
    showToast('Chưa có mã nguồn đã bảo vệ để tải xuống!', 'error');
    return;
  }

  const blob = new Blob([protectedPyCode], { type: 'text/x-python;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = protectedFileName || 'protected_script.py';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Đã tải xuống: ${a.download}`, 'success');
}

function toggleCodePreview() {
  const previewBox = $('codePreviewBox');
  if (previewBox) {
    previewBox.hidden = !previewBox.hidden;
  }
}

// GẮN TOÀN BỘ EVENT LISTENERS AN TOÀN TRÊN DOMCONTENTLOADED
document.addEventListener('DOMContentLoaded', () => {
  // 1. Nút đăng nhập
  const loginBtn = $('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', login);

  // 2. Nhấn Enter tại ô password
  const passInput = $('password');
  if (passInput) {
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') login();
    });
  }

  // 3. Nút đăng xuất
  const logoutBtn = $('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // 4. Nút làm mới danh sách
  const refreshBtn = $('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAll);

  // 5. Ô tìm kiếm thời gian thực & nút Xóa tìm kiếm (Bản quyền)
  const searchInput = $('keySearchInput');
  if (searchInput) searchInput.addEventListener('input', filterKeys);

  const clearSearchBtn = $('clearSearchBtn');
  if (clearSearchBtn) clearSearchBtn.addEventListener('click', clearSearch);

  const resetSearchBtn = $('resetSearchBtn');
  if (resetSearchBtn) resetSearchBtn.addEventListener('click', clearSearch);

  // 5b. Ô tìm kiếm thời gian thực & nút Xóa tìm kiếm & Làm mới (Thiết bị)
  const deviceSearchInput = $('deviceSearchInput');
  if (deviceSearchInput) deviceSearchInput.addEventListener('input', filterDevices);

  const clearDeviceSearchBtn = $('clearDeviceSearchBtn');
  if (clearDeviceSearchBtn) clearDeviceSearchBtn.addEventListener('click', clearDeviceSearch);

  const resetDeviceSearchBtn = $('resetDeviceSearchBtn');
  if (resetDeviceSearchBtn) resetDeviceSearchBtn.addEventListener('click', clearDeviceSearch);

  const refreshDevicesBtn = $('refreshDevicesBtn');
  if (refreshDevicesBtn) refreshDevicesBtn.addEventListener('click', loadDevices);

  // 6. Nút tạo key
  const createKeyBtn = $('createKeyBtn');
  if (createKeyBtn) createKeyBtn.addEventListener('click', createKey);

  // 7. Nút copy key sau khi tạo
  const copyKeyBtn = $('copyKeyBtn');
  if (copyKeyBtn) copyKeyBtn.addEventListener('click', copyCreatedKey);

  // 8. Các nút chọn nhanh thời hạn (preset duration)
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = btn.dataset.days;
      if (days) setDuration(Number(days), btn);
    });
  });

  // 9. Checkbox vĩnh viễn
  const foreverCheck = $('forever');
  if (foreverCheck) {
    foreverCheck.addEventListener('change', (e) => {
      toggleForever(e.target.checked);
    });
  }

  // 10. Nút phát nhạc
  const musicBtn = $('musicBtn');
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);

  // 11. Các nút mở/đóng Tài liệu API & Điều hướng Protect
  const toggleDocsNavBtn = $('toggleDocsNavBtn');
  if (toggleDocsNavBtn) toggleDocsNavBtn.addEventListener('click', () => toggleDocs());

  const openDocsPublicBtn = $('openDocsPublicBtn');
  if (openDocsPublicBtn) openDocsPublicBtn.addEventListener('click', () => toggleDocs(true));

  const closeDocsBtn = $('closeDocsBtn');
  if (closeDocsBtn) closeDocsBtn.addEventListener('click', () => toggleDocs(false));

  const navProtectBtn = $('navProtectBtn');
  if (navProtectBtn) {
    navProtectBtn.addEventListener('click', () => {
      const sec = $('protectSection');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Copy Base URL & cURL trong Docs
  const copyBaseUrlBtn = $('copyBaseUrlBtn');
  if (copyBaseUrlBtn) {
    copyBaseUrlBtn.addEventListener('click', () => {
      const urlEl = $('docsBaseUrl');
      if (urlEl) copyToClipboard(urlEl.textContent.trim());
    });
  }

  const copyQuickCurlBtn = $('copyQuickCurlBtn');
  if (copyQuickCurlBtn) {
    copyQuickCurlBtn.addEventListener('click', () => {
      const curlEl = $('quickCurlText');
      if (curlEl) copyToClipboard(curlEl.textContent.trim());
    });
  }

  // 12. Trình test API trực tiếp
  const runApiTestBtn = $('runApiTestBtn');
  if (runApiTestBtn) runApiTestBtn.addEventListener('click', runApiTest);

  // 13. Tabs SDK code mẫu
  document.querySelectorAll('.sdk-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchSdkTab(btn.dataset.tab);
    });
  });

  // 14. Nút copy code mẫu
  const copyCodeBtn = $('copyCodeBtn');
  if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyActiveSdkCode);

  // 15. Python Code Protector Event Handlers
  const customServerUrlInput = $('customServerUrlInput');
  if (customServerUrlInput && !customServerUrlInput.value) {
    customServerUrlInput.value = window.location.origin;
  }

  const tabUploadFileBtn = $('tabUploadFileBtn');
  const tabPasteCodeBtn = $('tabPasteCodeBtn');
  const pasteClipboardBtn = $('pasteClipboardBtn');
  const pyDirectCodeInput = $('pyDirectCodeInput');
  const pyDropzone = $('pyDropzone');
  const pyFileInput = $('pyFileInput');
  const removePyFileBtn = $('removePyFileBtn');
  const buildProtectedBtn = $('buildProtectedBtn');
  const downloadProtectedBtn = $('downloadProtectedBtn');
  const quickCopyProtectedBtn = $('quickCopyProtectedBtn');
  const togglePreviewBtn = $('togglePreviewBtn');
  const copyProtectedCodeBtn = $('copyProtectedCodeBtn');

  if (tabUploadFileBtn) tabUploadFileBtn.addEventListener('click', () => switchProtectInputMode('upload'));
  if (tabPasteCodeBtn) tabPasteCodeBtn.addEventListener('click', () => switchProtectInputMode('paste'));

  if (pyDirectCodeInput) {
    pyDirectCodeInput.addEventListener('input', () => {
      if (protectInputMode === 'paste') {
        if (buildProtectedBtn) buildProtectedBtn.disabled = !pyDirectCodeInput.value.trim();
      }
    });
  }

  if (pasteClipboardBtn && pyDirectCodeInput) {
    pasteClipboardBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text) {
            pyDirectCodeInput.value = text;
            if (buildProtectedBtn) buildProtectedBtn.disabled = false;
            showToast('Đã dán mã từ Clipboard!', 'success');
            return;
          }
        }
      } catch (err) {
        // Trình duyệt mobile có thể chặn clipboard tự động nếu chưa cấp quyền
      }
      pyDirectCodeInput.focus();
      showToast('Hãy chạm giữ và chọn "Dán" vào ô văn bản!', 'info');
    });
  }

  if (pyDropzone) {
    pyDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      pyDropzone.classList.add('dragover');
    });

    pyDropzone.addEventListener('dragleave', () => {
      pyDropzone.classList.remove('dragover');
    });

    pyDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      pyDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handlePyFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (pyFileInput) {
    pyFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePyFileSelect(e.target.files[0]);
      }
    });
  }

  if (removePyFileBtn) removePyFileBtn.addEventListener('click', removePyFile);
  if (buildProtectedBtn) buildProtectedBtn.addEventListener('click', buildProtectedCode);
  if (downloadProtectedBtn) downloadProtectedBtn.addEventListener('click', downloadProtectedFile);
  if (togglePreviewBtn) togglePreviewBtn.addEventListener('click', toggleCodePreview);
  if (copyProtectedCodeBtn) {
    copyProtectedCodeBtn.addEventListener('click', () => {
      if (protectedPyCode) copyToClipboard(protectedPyCode);
    });
  }
  if (quickCopyProtectedBtn) {
    quickCopyProtectedBtn.addEventListener('click', () => {
      if (protectedPyCode) {
        copyToClipboard(protectedPyCode);
        showToast('✓ Đã copy code bảo vệ! Sẵn sàng dán vào Termux.', 'success');
      } else {
        showToast('Chưa có code đã bảo vệ!', 'error');
      }
    });
  }

  // 16. Event Delegation cho các nút trong bảng danh sách key (Desktop Table)
  const keysBody = $('keysBody');
  if (keysBody) {
    keysBody.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (target) handleKeyAction(target);
    });
  }

  // 17. Event Delegation cho danh sách key Mobile Cards
  const keysCardsMobile = $('keysCardsMobile');
  if (keysCardsMobile) {
    keysCardsMobile.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (target) handleKeyAction(target);
    });
  }

  // 18. Event Delegation cho danh sách thiết bị kết nối (Desktop Table)
  const devicesBody = $('devicesBody');
  if (devicesBody) {
    devicesBody.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (target) handleDeviceAction(target);
    });
  }

  // 19. Event Delegation cho danh sách thiết bị Mobile Cards
  const devicesCardsMobile = $('devicesCardsMobile');
  if (devicesCardsMobile) {
    devicesCardsMobile.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (target) handleDeviceAction(target);
    });
  }

  // 20. Khởi tạo Mobile Bottom Navigation
  initBottomNav();

  // Khởi động phiên làm việc & kiểm tra trạng thái
  checkSession();
  status();
  syncOriginInDocs();
  setInterval(status, 15000);
});
