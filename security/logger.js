/**
 * TBAO TEAM - SECURITY AUDIT & EVENT LOGGER
 * Ghi log bảo mật có kiểm soát, che giấu dữ liệu nhạy cảm (Key, Password, Secret)
 */

function maskKey(key) {
  if (!key || typeof key !== 'string') return '[NO_KEY]';
  const clean = key.trim();
  if (clean.length <= 8) return '****';
  return clean.slice(0, 5) + '-****-****-' + clean.slice(-4);
}

function sanitizeIp(req) {
  if (!req) return '127.0.0.1';
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  return String(ip).split(',')[0].trim().slice(0, 45);
}

async function recordSecurityEvent(db, eventType, data = {}) {
  const { ip, key, hwid, details } = data;
  const maskedK = key ? maskKey(key) : null;
  const safeHwid = hwid ? String(hwid).slice(0, 64) : null;
  const safeDetails = details ? String(details).slice(0, 255) : null;
  const safeIp = ip ? String(ip).slice(0, 45) : null;

  console.warn(`🚨 [SECURITY_ALERT] Type: ${eventType} | IP: ${safeIp || 'N/A'} | Key: ${maskedK || 'N/A'} | Details: ${safeDetails || 'N/A'}`);

  if (db && typeof db.query === 'function') {
    try {
      await db.query(
        `INSERT INTO security_events(event_type, source_ip, target_key, hwid, details, created_at)
         VALUES($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [eventType, safeIp, maskedK, safeHwid, safeDetails]
      );
    } catch (err) {
      // Đảm bảo không làm sập ứng dụng nếu lỗi log
      console.error('[SECURITY_LOGGER_ERR]', err.message);
    }
  }
}

module.exports = {
  maskKey,
  sanitizeIp,
  recordSecurityEvent
};
