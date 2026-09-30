/**
 * TBAO TEAM - API ROUTER (HARDENED ENTERPRISE SECURITY)
 * Xác thực License, Chữ ký số bất đối xứng Ed25519, Chống Replay, Chống Brute Force, Anti-Tamper
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { signData, getPublicKeyPem } = require('../security/crypto');
const { validateNonceAndTimestamp } = require('../security/anti_replay');
const { checkJailedIp, recordFailedAttempt, checkKeyRateLimit } = require('../security/rate_limiter');
const { getCachedLicense, setCachedLicense } = require('../security/cache');
const { maskKey, sanitizeIp, recordSecurityEvent } = require('../security/logger');

const router = express.Router();

// Helper ghi log kiểm toán an toàn (che giấu thông tin nhạy cảm)
async function audit(key, hwid, action, message, ip) {
  try {
    await db.query(
      `INSERT INTO audit_logs(key_code, hwid, action, message, ip_address, created_at)
       VALUES($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        typeof key === 'string' ? key.slice(0, 64) : null,
        typeof hwid === 'string' ? hwid.slice(0, 128) : null,
        String(action).slice(0, 32),
        message ? String(message).slice(0, 255) : null,
        ip ? String(ip).slice(0, 45) : null
      ]
    );
  } catch (err) {
    console.error('[AUDIT_ERROR]', err.message);
  }
}

// Handler kiểm tra và ràng buộc key (Server-Authoritative)
async function check(req, res) {
  const ip = sanitizeIp(req);
  const keyRaw = req.body?.key;
  const hwidRaw = req.body?.hwid;
  const nonceRaw = req.body?.nonce;
  const timestampRaw = req.body?.timestamp;

  // 1. Kiểm tra tham số cơ bản
  if (!keyRaw || !hwidRaw || typeof keyRaw !== 'string' || typeof hwidRaw !== 'string') {
    return res.status(400).json({ ok: false, valid: false, reason: 'MISSING_PARAMS' });
  }

  const key = keyRaw.trim();
  const hwid = hwidRaw.trim();

  // 2. Chặn các ký tự bất thường chống injection / format bomb
  if (key.length < 4 || key.length > 64 || !/^[A-Za-z0-9._-]+$/.test(key)) {
    return res.status(400).json({ ok: false, valid: false, reason: 'INVALID_KEY_FORMAT' });
  }

  if (hwid.length < 4 || hwid.length > 128 || !/^[A-Za-z0-9._#:-]+$/.test(hwid)) {
    return res.status(400).json({ ok: false, valid: false, reason: 'INVALID_HWID_FORMAT' });
  }

  // 3. Cơ chế Chống Tấn Công Replay (Anti-Replay Verification)
  const replayCheck = await validateNonceAndTimestamp(nonceRaw, timestampRaw, db);
  if (!replayCheck.valid) {
    await recordSecurityEvent(db, 'REPLAY_ATTACK_BLOCKED', {
      ip,
      key,
      hwid,
      details: replayCheck.message || replayCheck.reason
    });
    return res.status(400).json({
      ok: false,
      valid: false,
      reason: replayCheck.reason,
      message: replayCheck.message || 'Yêu cầu không hợp lệ hoặc đã bị replay.'
    });
  }

  // 4. Per-Key Rate Limiting (Chống botnet đánh vào 1 key)
  if (!checkKeyRateLimit(key)) {
    return res.status(429).json({
      ok: false,
      valid: false,
      reason: 'KEY_RATE_LIMIT_EXCEEDED',
      message: 'Key này đang nhận quá nhiều yêu cầu xác thực trong thời gian ngắn.'
    });
  }

  // 5. Kiểm tra Heartbeat Cache (Giảm tải CSDL cho các client gửi heartbeat thường xuyên)
  const cached = getCachedLicense(key, hwid);
  if (cached) {
    const freshPayload = {
      ...cached,
      timestamp: timestampRaw ? Number(timestampRaw) : Date.now(),
      nonce: nonceRaw ? String(nonceRaw).trim() : crypto.randomBytes(8).toString('hex')
    };
    const { signature, hmac_signature } = signData(freshPayload);
    return res.json({
      ...freshPayload,
      signature,
      hmac_signature,
      cached: true,
      message: 'License valid (cached)'
    });
  }

  // 6. Truy vấn CSDL xác thực License (Server-Authoritative)
  try {
    const r = await db.query('SELECT * FROM licenses WHERE key_code = $1', [key]);
    if (!r.rowCount) {
      recordFailedAttempt(req, db);
      await audit(key, hwid, 'CHECK_FAIL', 'KEY_NOT_FOUND', ip);
      return res.status(404).json({ ok: false, valid: false, reason: 'KEY_NOT_FOUND' });
    }

    const k = r.rows[0];

    // Kiểm tra trạng thái Khóa (Ban/Flagged)
    if (['banned', 'shared_flagged'].includes(k.status)) {
      await audit(key, hwid, 'CHECK_BLOCKED', `KEY_BANNED: ${k.ban_reason}`, ip);
      return res.status(403).json({
        ok: false,
        valid: false,
        reason: 'KEY_BANNED',
        ban_reason: k.ban_reason || 'Banned by administrator'
      });
    }

    // Kiểm tra Hết hạn (Expiration)
    if (k.expires_at && new Date(k.expires_at) < new Date()) {
      await db.query("UPDATE licenses SET status = 'expired' WHERE id = $1", [k.id]);
      await audit(key, hwid, 'CHECK_EXPIRED', 'License expired', ip);
      return res.status(403).json({ ok: false, valid: false, reason: 'KEY_EXPIRED' });
    }

    // Kiểm tra liên kết thiết bị
    const existingBinding = await db.query(
      'SELECT id FROM key_bindings WHERE key_id = $1 AND hwid = $2',
      [k.id, hwid]
    );

    let boundCount = 0;

    if (existingBinding.rowCount > 0) {
      // Máy cũ hợp lệ -> Cập nhật last_seen_at
      await db.query('UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE hwid = $1', [hwid]);
      const countRes = await db.query('SELECT COUNT(*) AS count FROM key_bindings WHERE key_id = $1', [k.id]);
      boundCount = countRes.rows[0]?.count || 1;
    } else {
      // Thiết bị mới -> Mở Transaction an toàn chống Race Condition
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        const lockQuery = db.isTurso
          ? 'SELECT id, device_limit, status FROM licenses WHERE id = $1'
          : 'SELECT id, device_limit, status FROM licenses WHERE id = $1 FOR UPDATE';
        const lockRes = await client.query(lockQuery, [k.id]);
        const currentLicense = lockRes.rows[0];

        if (['banned', 'shared_flagged', 'expired'].includes(currentLicense.status)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ ok: false, valid: false, reason: 'KEY_UNAVAILABLE' });
        }

        const countRes = await client.query('SELECT COUNT(*) AS count FROM key_bindings WHERE key_id = $1', [k.id]);
        const currentCount = countRes.rows[0]?.count || 0;

        // Chống phá hoại (Anti-Griefing): Chỉ từ chối thiết bị lạ vượt quá giới hạn
        if (currentCount >= currentLicense.device_limit) {
          await client.query('ROLLBACK');
          await audit(key, hwid, 'LIMIT_REJECTED', `Limit ${currentLicense.device_limit} reached`, ip);
          return res.status(403).json({
            ok: false,
            valid: false,
            reason: 'DEVICE_LIMIT_REACHED',
            message: 'Thiết bị chưa được kích hoạt và key đã đạt giới hạn thiết bị tối đa.',
            device_limit: currentLicense.device_limit,
            bound_devices: currentCount
          });
        }

        await client.query(
          `INSERT INTO devices(hwid, ip_first_seen, last_seen_at)
           VALUES($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT(hwid) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
          [hwid, ip]
        );

        await client.query(
          'INSERT INTO key_bindings(key_id, hwid, is_primary) VALUES($1, $2, 0) ON CONFLICT(key_id, hwid) DO NOTHING',
          [k.id, hwid]
        );

        await client.query('COMMIT');
        boundCount = currentCount + 1;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }

    await audit(key, hwid, 'CHECK_OK', 'License valid', ip);

    // 7. Tạo Payload phản hồi & Ký số mật mã học
    const timestamp = timestampRaw ? Number(timestampRaw) : Date.now();
    const nonce = nonceRaw ? String(nonceRaw).trim() : crypto.randomBytes(8).toString('hex');

    const payload = {
      ok: true,
      valid: true,
      key,
      hwid,
      expires_at: k.expires_at,
      device_limit: k.device_limit,
      bound_devices: boundCount,
      timestamp,
      nonce
    };

    // Ký số Ed25519 bất đối xứng + HMAC
    const { signature, hmac_signature } = signData(payload);

    // Lưu vào Heartbeat cache trong 30 giây
    setCachedLicense(key, hwid, payload, 30000);

    return res.json({
      ...payload,
      signature,
      hmac_signature,
      message: 'License valid'
    });
  } catch (err) {
    console.error('[CHECK_KEY_ERROR]', err);
    return res.status(500).json({ ok: false, valid: false, error: 'INTERNAL_SERVER_ERROR' });
  }
}

// Endpoint đăng ký thiết bị (Hardware Fingerprint Enrollment)
const handleRegisterDevice = async (req, res) => {
  try {
    const { hwid, cpu_info, os_info } = req.body || {};
    if (!hwid || typeof hwid !== 'string') {
      return res.status(400).json({ ok: false, reason: 'MISSING_HWID' });
    }

    const cleanHwid = hwid.trim();
    if (cleanHwid.length < 4 || cleanHwid.length > 128 || !/^[A-Za-z0-9._#:-]+$/.test(cleanHwid)) {
      return res.status(400).json({ ok: false, reason: 'INVALID_HWID_FORMAT' });
    }

    const cleanCpu = cpu_info && typeof cpu_info === 'string' ? cpu_info.trim().slice(0, 256) : null;
    const cleanOs = os_info && typeof os_info === 'string' ? os_info.trim().slice(0, 256) : null;
    const ip = sanitizeIp(req);

    await db.query(
      `INSERT INTO devices(hwid, cpu_info, os_info, ip_first_seen, last_seen_at)
       VALUES($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT(hwid) DO UPDATE SET
         cpu_info = COALESCE(EXCLUDED.cpu_info, devices.cpu_info),
         os_info = COALESCE(EXCLUDED.os_info, devices.os_info),
         last_seen_at = CURRENT_TIMESTAMP`,
      [cleanHwid, cleanCpu, cleanOs, ip]
    );

    res.json({ ok: true, message: 'HWID registered' });
  } catch (err) {
    console.error('[REGISTER_HWID_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
  }
};

router.post('/register-hwid', checkJailedIp, handleRegisterDevice);
router.post('/register-device', checkJailedIp, handleRegisterDevice);

const { getGuardTemplate, protectPythonCode } = require('../security/python_protector');

// Endpoint phân phối Template bảo vệ Python cho Client/Frontend
router.get('/protector-template', (req, res) => {
  try {
    const origin = req.protocol + '://' + req.get('host');
    const template = getGuardTemplate(origin);
    res.json({ ok: true, template, server_url: origin });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint chèn mã bảo vệ vào file Python gốc
router.post('/protect-code', (req, res) => {
  try {
    const { code, server_url } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'MISSING_PYTHON_CODE' });
    }
    const origin = server_url || (req.protocol + '://' + req.get('host'));
    const protectedCode = protectPythonCode(code, origin);
    res.json({
      ok: true,
      message: 'Code protected successfully',
      server_url: origin,
      original_length: code.length,
      protected_length: protectedCode.length,
      protected_code: protectedCode
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint phân phối Public Key để Client xác minh chữ ký (Không chứa Secret)
router.get('/public-key', (req, res) => {
  res.json({
    ok: true,
    algorithm: 'Ed25519',
    public_key: getPublicKeyPem(),
    usage: 'Dùng Public Key này trong Client (C#/C++/Python) để xác thực tính toàn vẹn của Response'
  });
});

// Endpoint kiểm tra trạng thái bảo mật của server
router.get('/security-info', (req, res) => {
  res.json({
    ok: true,
    protocol: 'TBAO-SECURITY-V2',
    signature_algorithm: 'Ed25519 + HMAC-SHA256',
    anti_replay: true,
    max_drift_seconds: 300,
    server_time: Date.now()
  });
});

router.post('/check-key', checkJailedIp, check);
router.post('/check', checkJailedIp, check);
router.post('/validate', checkJailedIp, check);

router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', database: db.isTurso ? 'turso_cloud' : 'postgres_or_memory' });
});

module.exports = router;
