/**
 * TBAO TEAM - HTTP HARDENING & PROTOCOL DEFENSE
 * Chống Host Header Injection, CSRF, Slowloris, JSON Body Bomb & Malformed Payloads
 */

const { sanitizeIp, recordSecurityEvent } = require('./logger');

// 1. Chống Host Header Injection
function hostHeaderGuard(req, res, next) {
  const host = req.headers['host'];
  if (!host) {
    return res.status(400).json({ ok: false, error: 'MISSING_HOST_HEADER' });
  }

  // Chặn các ký tự lạ hoặc newline injection trong Host header
  if (!/^[a-zA-Z0-9.:_-]+$/.test(host) || host.length > 128) {
    return res.status(400).json({ ok: false, error: 'MALFORMED_HOST_HEADER' });
  }

  next();
}

// 2. Chống CSRF trên các endpoint thay đổi trạng thái của Admin
function csrfAdminGuard(db) {
  return function (req, res, next) {
    // Chỉ kiểm tra các method thay đổi dữ liệu
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Ngoại lệ: Route login chưa có session
    if (req.path === '/login') {
      return next();
    }

    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const currentHost = req.headers['host'];

    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== currentHost) {
          recordSecurityEvent(db, 'CSRF_BLOCKED', {
            ip: sanitizeIp(req),
            details: `Origin '${originUrl.host}' không khớp với Host '${currentHost}'`
          });
          return res.status(403).json({ ok: false, error: 'CROSS_SITE_REQUEST_FORGERY_BLOCKED' });
        }
      } catch {
        return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN_HEADER' });
      }
    } else if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.host !== currentHost) {
          recordSecurityEvent(db, 'CSRF_BLOCKED', {
            ip: sanitizeIp(req),
            details: `Referer '${refererUrl.host}' không khớp với Host '${currentHost}'`
          });
          return res.status(403).json({ ok: false, error: 'CROSS_SITE_REQUEST_FORGERY_BLOCKED' });
        }
      } catch {
        return res.status(403).json({ ok: false, error: 'INVALID_REFERER_HEADER' });
      }
    }

    next();
  };
}

// 3. Timeout Guard chống Slowloris attack (15 giây)
function timeoutGuard(timeoutMs = 15000) {
  return function (req, res, next) {
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({ ok: false, error: 'REQUEST_TIMEOUT' });
      }
    });
    next();
  };
}

// 4. Bắt lỗi cú pháp JSON & Payload Quá Dung Lượng từ express.json
function jsonErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      ok: false,
      error: 'MALFORMED_JSON',
      message: 'Dữ liệu gửi lên không đúng định dạng JSON hợp lệ'
    });
  }
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      ok: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Dung lượng file Python hoặc dữ liệu gửi lên vượt quá giới hạn cho phép (Tối đa 10MB)!'
    });
  }
  next(err);
}

module.exports = {
  hostHeaderGuard,
  csrfAdminGuard,
  timeoutGuard,
  jsonErrorHandler
};
