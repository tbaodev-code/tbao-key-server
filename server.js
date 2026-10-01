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

// 4. Giới hạn Payload Body tối đa 10MB (Hỗ trợ upload và build mã nguồn Python an toàn)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
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

// 6. Phục vụ tài nguyên tĩnh công khai (CSS, BGM, login script)
// index: false để không bao giờ tự động gửi file HTML index chưa qua xác thực
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  maxAge: '1h'
}));

// ==================== BẢO VỆ GIAO DIỆN & TÀI LIỆU Ở BACKEND (CHỐNG ĐỌC TRỘM) ====================
// Người dùng chưa đăng nhập: Phục vụ login.html (Tuyệt đối không có Dashboard / Docs / Script nhạy cảm)
// Người dùng đã đăng nhập: Phục vụ dashboard.html (Đầy đủ Quản trị Key, Thiết Bị và Tài liệu API)
app.get('/', (req, res) => {
  if (req.session && req.session.admin) {
    return res.sendFile(path.join(__dirname, 'protected', 'dashboard.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Bảo vệ file Script điều khiển Dashboard & Docs ở backend (Trả 401 nếu chưa có session)
app.get('/protected-assets/dashboard.js', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(401).type('text/javascript').send('/* 401 UNAUTHORIZED: Yêu cầu đăng nhập để truy cập tài nguyên */');
  }
  res.sendFile(path.join(__dirname, 'protected', 'dashboard.js'));
});

// Route xem tài liệu API (Bắt buộc phải đăng nhập)
app.get('/docs', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.redirect('/');
  }
  return res.sendFile(path.join(__dirname, 'protected', 'dashboard.html'));
});

// Chặn truy cập trực tiếp các file html nếu cố tình đoán URL
app.get(['/index.html', '/dashboard.html', '/login.html'], (req, res) => {
  res.redirect('/');
});

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

// 10. Web Fallback (SPA) - Kiểm tra phiên làm việc trước khi trả giao diện
app.use((req, res) => {
  if (req.session && req.session.admin) {
    return res.sendFile(path.join(__dirname, 'protected', 'dashboard.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 11. Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT_SERVER_ERROR]', err);
  if (!res.headersSent) {
    const status = err.status || err.statusCode || 500;
    const errorCode = err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : (err.code || 'INTERNAL_SERVER_ERROR');
    res.status(status).json({
      ok: false,
      error: errorCode,
      message: err.message || 'Lỗi xử lý yêu cầu phía máy chủ'
    });
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
