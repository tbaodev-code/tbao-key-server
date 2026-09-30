/**
 * TBAO TEAM - LICENSE SERVER (HARDENED PRODUCTION ARCHITECTURE)
 * Server-Authoritative, Cryptographic Security, DDoS & Abuse Mitigation, Anti-Replay
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const db = require('./db');

const { hostHeaderGuard, timeoutGuard, jsonErrorHandler } = require('./security/http_guard');
const { globalApiLimiter, adminLoginLimiter } = require('./security/rate_limiter');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Cảnh báo biến môi trường bảo mật quan trọng
if (isProduction) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me' || process.env.SESSION_SECRET.includes('tbao-gaming')) {
    console.warn('⚠️ [BẢO MẬT] CẢNH BÁO NGUY CƠ CAO: Hãy cấu hình SESSION_SECRET ngẫu nhiên mạnh trên Production!');
  }
  if (!process.env.ADMIN_PASS || process.env.ADMIN_PASS === 'CHANGE_ME') {
    console.warn('⚠️ [BẢO MẬT] CẢNH BÁO NGUY CƠ CAO: Đang dùng mật khẩu admin mặc định (CHANGE_ME). Hãy đổi ADMIN_PASS ngay!');
  }
}

// 1. Tắt hoàn toàn X-Powered-By
app.disable('x-powered-by');
app.set('trust proxy', 1);

// 2. Bảo vệ Protocol & Timeout (Chống Slowloris)
app.use(timeoutGuard(15000));
app.use(hostHeaderGuard);

// 3. Cấu hình Helmet Security Headers chuẩn OWASP Top 10
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // Tuyệt đối KHÔNG dùng 'unsafe-inline' cho script
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"] // Chống Clickjacking
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false
  })
);

// 4. Giới hạn Payload Body tối đa 16KB (Chống Body Bomb DoS)
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(jsonErrorHandler);

// 5. Cấu hình Session Store an toàn
let sessionStore = undefined;
if (process.env.DATABASE_URL) {
  try {
    const pgSession = require('connect-pg-simple')(session);
    sessionStore = new pgSession({
      pool: db.pool,
      tableName: 'session',
      createTableIfMissing: true
    });
  } catch (err) {
    console.warn('⚠️ [SESSION] Fallback sang Memory session:', err.message);
  }
}

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'tbao-sec-key-vault-change-prod',
    resave: false,
    saveUninitialized: false,
    name: isProduction ? '__Host-tbao.sid' : 'tbao.sid',
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 giờ
    }
  })
);

// 6. Phục vụ tài nguyên tĩnh Web giao diện
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

// 7. Route Trạng Thái Sức Khỏe Máy Chủ
app.get('/status', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      ok: true,
      service: 'TBAO TEAM KEY SERVER',
      status: 'online',
      database: db.isTurso ? 'turso_cloud' : 'postgres_or_memory',
      security_level: 'hardened-v2.0'
    });
  } catch (e) {
    res.status(503).json({ ok: false, database: 'offline' });
  }
});

// 8. Đăng ký các Router với Rate Limiting Đa Tầng
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');

app.use('/admin/login', adminLoginLimiter);
app.use('/admin', adminRouter);

app.use('/api/v1', globalApiLimiter, apiRouter);
app.use('/api', globalApiLimiter, apiRouter);

// 9. Route 404 cho API và Admin (Trả JSON, không rò rỉ giao diện web)
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'ENDPOINT_NOT_FOUND' }));
app.use('/admin', (req, res) => res.status(404).json({ ok: false, error: 'ENDPOINT_NOT_FOUND' }));

// 10. Web Fallback (SPA)
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 11. Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT_SERVER_ERROR]', err);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

// Khởi chạy máy chủ
db.init()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚡ [TBAO TEAM] Hardened License Server running at http://localhost:${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = () => {
      console.log('⚡ [TBAO TEAM] Đang đóng kết nối máy chủ an toàn...');
      server.close(() => {
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((e) => {
    console.error('Fatal initialization error:', e);
    process.exit(1);
  });
