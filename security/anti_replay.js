/**
 * TBAO TEAM - ANTI-REPLAY ATTACK ENGINE
 * Ngăn chặn kẻ tấn công bắt gói tin cũ (replay old valid request/response)
 */

const MAX_DRIFT_MS = 5 * 60 * 1000; // Cho phép độ lệch tối đa 5 phút
const memoryNonces = new Map(); // nonce -> expiresAt

// Dọn dẹp nonce hết hạn trong RAM mỗi 60 giây
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of memoryNonces.entries()) {
    if (expiresAt < now) {
      memoryNonces.delete(nonce);
    }
  }
}, 60 * 1000);

/**
 * Kiểm tra hợp lệ Nonce và Timestamp
 * @param {string} nonce - Chuỗi ngẫu nhiên duy nhất
 * @param {number|string} timestamp - Dấu thời gian Unix mili-giây
 * @param {object} db - Database pool/client
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
async function validateNonceAndTimestamp(nonce, timestamp, db) {
  // Nếu không gửi nonce hoặc timestamp, trả về thông báo để client nâng cấp bảo mật
  if (!nonce || !timestamp) {
    return { valid: true, legacy: true };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { valid: false, reason: 'INVALID_TIMESTAMP_FORMAT' };
  }

  const now = Date.now();
  const drift = Math.abs(now - tsNum);

  if (drift > MAX_DRIFT_MS) {
    return {
      valid: false,
      reason: 'TIMESTAMP_EXPIRED_OR_DRIFT_TOO_LARGE',
      message: `Độ lệch thời gian client-server vượt quá 5 phút (${Math.round(drift / 1000)}s)`
    };
  }

  if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 64) {
    return { valid: false, reason: 'INVALID_NONCE_FORMAT' };
  }

  const cleanNonce = nonce.trim();

  // 1. Kiểm tra nhanh trong RAM
  if (memoryNonces.has(cleanNonce)) {
    return { valid: false, reason: 'REPLAY_ATTACK_DETECTED' };
  }

  const expiresAt = now + MAX_DRIFT_MS + 60000; // Lưu giữ trong 6 phút
  memoryNonces.set(cleanNonce, expiresAt);

  // 2. Lưu trữ vào DB (asynchronous / non-blocking) để duy trì khi server reboot
  if (db && typeof db.query === 'function') {
    db.query(
      `INSERT INTO used_nonces(nonce, expires_at) VALUES($1, $2) ON CONFLICT(nonce) DO NOTHING`,
      [cleanNonce, expiresAt]
    ).catch(() => {});
  }

  return { valid: true, legacy: false };
}

module.exports = {
  validateNonceAndTimestamp,
  MAX_DRIFT_MS
};
