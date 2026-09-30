/**
 * TBAO TEAM - ADMIN ROUTER (HARDENED SECURITY)
 * Quản trị License, Chống Brute Force, Chống CSRF, Thu hồi Session an toàn
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { csrfAdminGuard } = require('../security/http_guard');
const { invalidateKey } = require('../security/cache');
const { sanitizeIp, recordSecurityEvent } = require('../security/logger');

const router = express.Router();

// Middleware xác thực quyền Admin
const auth = (req, res, next) => {
  if (req.session?.admin) {
    return next();
  }
  return res.status(401).json({ ok: false, error: 'LOGIN_REQUIRED' });
};

// So sánh an toàn chống tấn công Timing Attack
function safeCompare(input, expected) {
  const inputBuf = Buffer.from(String(input || ''));
  const expectedBuf = Buffer.from(String(expected || ''));

  if (inputBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(inputBuf, inputBuf);
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

// Sinh mã License ngẫu nhiên có độ entropy cao
const makeKey = () => {
  const x = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TBAO-${x.slice(0, 4)}-${x.slice(4, 8)}-${x.slice(8, 12)}`;
};

// Áp dụng bảo vệ chống CSRF cho toàn bộ router Admin
router.use(csrfAdminGuard(db));

router.get('/session', (req, res) => {
  res.json({ ok: true, logged_in: !!req.session?.admin });
});

router.post('/login', (req, res) => {
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASS || 'CHANGE_ME';
  const ip = sanitizeIp(req);

  const userMatch = safeCompare(req.body?.username, expectedUser);
  const passMatch = safeCompare(req.body?.password, expectedPass);

  if (userMatch && passMatch) {
    return req.session.regenerate((err) => {
      if (err) {
        console.error('[SESSION_REGEN_ERROR]', err);
        return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
      }
      req.session.admin = true;
      recordSecurityEvent(db, 'ADMIN_LOGIN_SUCCESS', { ip });
      return res.json({ ok: true });
    });
  }

  recordSecurityEvent(db, 'ADMIN_LOGIN_FAILED', {
    ip,
    details: `Thử đăng nhập sai cho user: ${String(req.body?.username || '').slice(0, 32)}`
  });
  res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/devices', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM devices ORDER BY last_seen_at DESC LIMIT 200');
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('[GET_DEVICES_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.get('/keys', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT l.*,
        (SELECT COUNT(*) FROM key_bindings b WHERE b.key_id = l.id) AS bound_count
      FROM licenses l
      ORDER BY created_at DESC
      LIMIT 500
    `);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('[GET_KEYS_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.post('/create-key', auth, async (req, res) => {
  const { primary_hwid, device_limit, duration_days, note } = req.body || {};

  if (!primary_hwid || typeof primary_hwid !== 'string') {
    return res.status(400).json({ ok: false, error: 'PRIMARY_HWID_REQUIRED' });
  }

  const cleanHwid = primary_hwid.trim();
  if (cleanHwid.length < 4 || cleanHwid.length > 128 || !/^[A-Za-z0-9._#:-]+$/.test(cleanHwid)) {
    return res.status(400).json({ ok: false, error: 'INVALID_HWID_FORMAT' });
  }

  const limit = Math.min(1000, Math.max(1, parseInt(device_limit, 10) || 1));
  let exp = null;

  if (duration_days !== 'forever' && duration_days !== '' && duration_days != null) {
    const d = parseInt(duration_days, 10);
    if (!Number.isFinite(d) || d < 1 || d > 3650) {
      return res.status(400).json({ ok: false, error: 'INVALID_DURATION' });
    }
    exp = new Date(Date.now() + d * 86400000).toISOString();
  }

  const key = makeKey();
  const cleanNote = note && typeof note === 'string' ? note.trim().slice(0, 255) : null;
  const ip = sanitizeIp(req);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO devices(hwid, ip_first_seen, last_seen_at)
       VALUES($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(hwid) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
      [cleanHwid, ip]
    );

    const licRes = await client.query(
      `INSERT INTO licenses(key_code, primary_hwid, device_limit, expires_at, status, note)
       VALUES($1, $2, $3, $4, 'active', $5)
       RETURNING id`,
      [key, cleanHwid, limit, exp, cleanNote]
    );

    const licenseId = licRes.rows[0].id;

    await client.query(
      `INSERT INTO key_bindings(key_id, hwid, is_primary)
       VALUES($1, $2, 1)
       ON CONFLICT(key_id, hwid) DO NOTHING`,
      [licenseId, cleanHwid]
    );

    await client.query('COMMIT');
    res.json({ ok: true, key, primary_hwid: cleanHwid, device_limit: limit, expires_at: exp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CREATE_KEY_ERROR]', err);
    res.status(500).json({ ok: false, error: 'CANNOT_CREATE_KEY' });
  } finally {
    client.release();
  }
});

router.post('/edit-key', auth, async (req, res) => {
  const { key_code, device_limit, note } = req.body || {};
  if (!key_code || typeof key_code !== 'string') {
    return res.status(400).json({ ok: false, error: 'KEY_CODE_REQUIRED' });
  }

  const limit = Math.min(1000, Math.max(1, parseInt(device_limit, 10) || 1));
  const cleanNote = note && typeof note === 'string' ? note.trim().slice(0, 255) : null;
  const cleanKey = key_code.trim();

  try {
    const r = await db.query(
      'UPDATE licenses SET device_limit = $1, note = $2 WHERE key_code = $3 RETURNING key_code',
      [limit, cleanNote, cleanKey]
    );
    invalidateKey(cleanKey);
    res.json(r.rowCount ? { ok: true } : { ok: false, error: 'KEY_NOT_FOUND' });
  } catch (err) {
    console.error('[EDIT_KEY_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.post('/renew-key', auth, async (req, res) => {
  const { key_code, add_days } = req.body || {};
  const d = parseInt(add_days, 10);
  const cleanKey = String(key_code || '').trim();

  if (!cleanKey || !Number.isFinite(d) || d < 1 || d > 3650) {
    return res.status(400).json({ ok: false, error: 'INVALID_DATA' });
  }

  try {
    const r = await db.query('SELECT * FROM licenses WHERE key_code = $1', [cleanKey]);
    if (!r.rowCount) {
      return res.status(404).json({ ok: false, error: 'KEY_NOT_FOUND' });
    }

    const row = r.rows[0];
    if (!row.expires_at) {
      return res.json({ ok: true, message: 'Key vĩnh viễn' });
    }

    const baseTime = Math.max(Date.now(), new Date(row.expires_at).getTime());
    const newExp = new Date(baseTime + d * 86400000);

    await db.query(
      "UPDATE licenses SET expires_at = $1, status = 'active', ban_reason = NULL, banned_at = NULL WHERE id = $2",
      [newExp.toISOString(), row.id]
    );

    invalidateKey(cleanKey);
    res.json({ ok: true, new_expires_at: newExp.toISOString() });
  } catch (err) {
    console.error('[RENEW_KEY_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.post('/toggle-ban', auth, async (req, res) => {
  const { key_code, action } = req.body || {};
  const cleanKey = String(key_code || '').trim();

  if (!cleanKey || !['ban', 'unban'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ACTION' });
  }

  const isBan = action === 'ban';
  try {
    const r = await db.query(
      `UPDATE licenses SET
         status = $1,
         ban_reason = $2,
         banned_at = CASE WHEN $3 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE key_code = $4 RETURNING id`,
      [isBan ? 'banned' : 'active', isBan ? 'MANUAL_BAN' : null, isBan ? 1 : 0, cleanKey]
    );

    invalidateKey(cleanKey);
    res.json(r.rowCount ? { ok: true } : { ok: false, error: 'KEY_NOT_FOUND' });
  } catch (err) {
    console.error('[TOGGLE_BAN_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.post('/delete-key', auth, async (req, res) => {
  const { key_code } = req.body || {};
  const cleanKey = String(key_code || '').trim();

  if (!cleanKey) {
    return res.status(400).json({ ok: false, error: 'KEY_CODE_REQUIRED' });
  }

  try {
    const r = await db.query('DELETE FROM licenses WHERE key_code = $1 RETURNING id', [cleanKey]);
    invalidateKey(cleanKey);
    res.json(r.rowCount ? { ok: true } : { ok: false, error: 'KEY_NOT_FOUND' });
  } catch (err) {
    console.error('[DELETE_KEY_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// Xem nhật ký bảo mật (Security Alerts & Events)
router.get('/security-events', auth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM security_events ORDER BY created_at DESC LIMIT 100');
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[SECURITY_EVENTS_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

router.get('/shared-keys', auth, async (req, res) => {
  try {
    const r = await db.query("SELECT * FROM licenses WHERE status = 'shared_flagged' ORDER BY banned_at DESC");
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[SHARED_KEYS_ERROR]', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
