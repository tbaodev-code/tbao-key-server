/**
 * TBAO TEAM - MULTI-TIER ABUSE & DDOS DEFENSE
 * Giới hạn tần suất request đa tầng: Theo IP, Theo Key, Theo Thiết bị & Brute-Force Negative Jail
 */

const rateLimit = require('express-rate-limit');
const { sanitizeIp, recordSecurityEvent } = require('./logger');

// Bộ nhớ theo dõi hành vi dò mã (Brute Force Hunting)
const failedAttemptsByIp = new Map(); // ip -> { count, firstFailedAt, jailedUntil }

// Tự động dọn dẹp danh sách theo dõi mỗi 2 phút
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of failedAttemptsByIp.entries()) {
    if (data.jailedUntil && data.jailedUntil < now) {
      failedAttemptsByIp.delete(ip);
    } else if (!data.jailedUntil && now - data.firstFailedAt > 10 * 60 * 1000) {
      failedAttemptsByIp.delete(ip);
    }
  }
}, 2 * 60 * 1000);

/**
 * Ghi nhận một lần dò key thất bại (KEY_NOT_FOUND)
 * Nếu vượt quá 8 lần trong 5 phút -> Tống giam IP 15 phút!
 */
function recordFailedAttempt(req, db) {
  const ip = sanitizeIp(req);
  const now = Date.now();
  const data = failedAttemptsByIp.get(ip) || { count: 0, firstFailedAt: now, jailedUntil: null };

  if (data.jailedUntil && data.jailedUntil > now) return;

  if (now - data.firstFailedAt > 5 * 60 * 1000) {
    data.count = 1;
    data.firstFailedAt = now;
  } else {
    data.count += 1;
  }

  if (data.count >= 8) {
    data.jailedUntil = now + 15 * 60 * 1000; // Khóa 15 phút
    recordSecurityEvent(db, 'BRUTE_FORCE_JAIL', {
      ip,
      details: `IP bị khóa 15 phút do phát hiện 8 lần thử key không tồn tại liên tiếp`
    });
  }

  failedAttemptsByIp.set(ip, data);
}

/**
 * Middleware kiểm tra xem IP có đang bị giam hay không
 */
function checkJailedIp(req, res, next) {
  const ip = sanitizeIp(req);
  const data = failedAttemptsByIp.get(ip);
  const now = Date.now();

  if (data && data.jailedUntil && data.jailedUntil > now) {
    const remainingSeconds = Math.ceil((data.jailedUntil - now) / 1000);
    return res.status(403).json({
      ok: false,
      valid: false,
      reason: 'IP_TEMPORARILY_BLOCKED',
      message: `Địa chỉ IP của bạn bị tạm khóa 15 phút do nghi vấn tấn công dò mã. Vui lòng đợi ${remainingSeconds}s.`,
      retry_after: remainingSeconds
    });
  }
  next();
}

// 1. Rate Limiter Toàn Cục cho API (120 req / phút / IP)
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, valid: false, reason: 'GLOBAL_RATE_LIMIT_EXCEEDED' }
});

// 2. Rate Limiter Đăng nhập Admin (Chỉ tính số lần thử SAI, không phạt khi đăng nhập đúng)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Cho phép 15 lần thử sai
  skipSuccessfulRequests: true, // Khi login thành công -> Không tính vào giới hạn!
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'TOO_MANY_LOGIN_ATTEMPTS_LOCKED_15_MIN' }
});

// 3. Per-Key Throttling trong RAM (Chống botnet phân tán đập vào 1 key)
const keyCheckTimestamps = new Map(); // key -> [timestamps]

function checkKeyRateLimit(key) {
  if (!key) return true;
  const now = Date.now();
  const timestamps = keyCheckTimestamps.get(key) || [];
  const recent = timestamps.filter((t) => now - t < 60000);

  if (recent.length >= 30) {
    // Quá 30 lượt kiểm tra / phút cho cùng 1 key
    return false;
  }

  recent.push(now);
  keyCheckTimestamps.set(key, recent);
  return true;
}

module.exports = {
  globalApiLimiter,
  adminLoginLimiter,
  recordFailedAttempt,
  checkJailedIp,
  checkKeyRateLimit
};
