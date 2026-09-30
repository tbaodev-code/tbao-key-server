require('dotenv').config();

const isTurso = !!(
  process.env.TURSO_DATABASE_URL ||
  (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('libsql://') || process.env.DATABASE_URL.includes('turso.io')))
);

let pool, query, init;

if (isTurso) {
  // ================== CSDL TURSO CLOUD (libSQL) ==================
  const { createClient } = require('@libsql/client');
  const rawUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const url = rawUrl.includes('.aws-') ? rawUrl.replace(/\.aws-[^.]+\.turso\.io/, '.turso.io') : rawUrl;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;

  console.log(`⚡ [TURSO ENGINE] Kết nối tới CSDL Turso Cloud (libSQL): ${url}`);
  const client = createClient({ url, authToken });

  query = async function (sql, params = []) {
    const res = await client.execute({ sql, args: params });
    return {
      rows: res.rows,
      rowCount: res.rows.length
    };
  };

  // Transaction-aware Pool Wrapper cho Turso over HTTP
  pool = {
    query,
    connect: async () => {
      let tx = null;
      try {
        tx = await client.transaction('write');
      } catch (err) {
        console.warn('[TURSO_TX_WARN] Không thể mở transaction riêng, fallback về client trực tiếp:', err.message);
      }

      return {
        query: async (sql, params = []) => {
          const trimmed = (sql || '').trim().toUpperCase();
          if (trimmed === 'BEGIN') {
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === 'COMMIT') {
            if (tx) await tx.commit();
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === 'ROLLBACK') {
            if (tx) {
              try { await tx.rollback(); } catch {}
            }
            return { rows: [], rowCount: 0 };
          }

          if (tx) {
            const res = await tx.execute({ sql, args: params });
            return { rows: res.rows, rowCount: res.rows.length };
          } else {
            return query(sql, params);
          }
        },
        release: () => {
          if (tx) {
            try { tx.close(); } catch {}
          }
        }
      };
    }
  };

  init = async function () {
    await query(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hwid TEXT NOT NULL UNIQUE,
        cpu_info TEXT,
        os_info TEXT,
        ip_first_seen TEXT,
        first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid);`);

    await query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT NOT NULL UNIQUE,
        primary_hwid TEXT NOT NULL,
        device_limit INTEGER NOT NULL DEFAULT 1,
        expires_at DATETIME,
        status TEXT NOT NULL DEFAULT 'active',
        note TEXT,
        ban_reason TEXT,
        banned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_licenses_code ON licenses(key_code);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);`);

    await query(`
      CREATE TABLE IF NOT EXISTS key_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        hwid TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(key_id, hwid)
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_bindings_key ON key_bindings(key_id);`);

    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT,
        hwid TEXT,
        action TEXT NOT NULL,
        message TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);`);

    await query(`
      CREATE TABLE IF NOT EXISTS used_nonces (
        nonce TEXT PRIMARY KEY,
        expires_at BIGINT NOT NULL
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);`);

    await query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        source_ip TEXT,
        target_key TEXT,
        hwid TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(created_at);`);
    console.log('✅ [TURSO] Bảng CSDL và Index bảo mật đã sẵn sàng!');
  };

} else if (process.env.DATABASE_URL) {
  // ================== CSDL POSTGRESQL (Render, Supabase, Neon) ==================
  const { Pool: PgPool } = require('pg');
  const isProduction = process.env.NODE_ENV === 'production';
  const isRemoteDb = !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
  const useSsl = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && (isProduction || isRemoteDb));

  pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  query = async function (text, params) {
    return pool.query(text, params);
  };

  init = async function () {
    await query(`
      CREATE TABLE IF NOT EXISTS devices(
        id BIGSERIAL PRIMARY KEY,
        hwid TEXT UNIQUE NOT NULL,
        cpu_info TEXT,
        os_info TEXT,
        ip_first_seen TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid);

      CREATE TABLE IF NOT EXISTS licenses(
        id BIGSERIAL PRIMARY KEY,
        key_code TEXT UNIQUE NOT NULL,
        primary_hwid TEXT NOT NULL,
        device_limit INTEGER NOT NULL DEFAULT 1,
        expires_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        note TEXT,
        ban_reason TEXT,
        banned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_licenses_key_code ON licenses(key_code);
      CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

      CREATE TABLE IF NOT EXISTS key_bindings(
        id BIGSERIAL PRIMARY KEY,
        key_id BIGINT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        hwid TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(key_id, hwid)
      );
      CREATE INDEX IF NOT EXISTS idx_key_bindings_key_id ON key_bindings(key_id);
      CREATE INDEX IF NOT EXISTS idx_key_bindings_hwid ON key_bindings(hwid);

      CREATE TABLE IF NOT EXISTS audit_logs(
        id BIGSERIAL PRIMARY KEY,
        key_code TEXT,
        hwid TEXT,
        action TEXT NOT NULL,
        message TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_key_code ON audit_logs(key_code);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

      CREATE TABLE IF NOT EXISTS used_nonces(
        nonce TEXT PRIMARY KEY,
        expires_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);

      CREATE TABLE IF NOT EXISTS security_events(
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        source_ip TEXT,
        target_key TEXT,
        hwid TEXT,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(created_at);
    `);
  };

} else {
  // ================== CSDL ẢO IN-MEMORY CHO LOCAL TEST ==================
  console.log('⚡ [LOCAL DEV] Không có biến DATABASE_URL. Tự động kích hoạt PostgreSQL ảo (in-memory) để chạy thử nghiệm...');
  const { newDb } = require('pg-mem');
  const memDb = newDb();
  const { Pool: MemPool } = memDb.adapters.createPg();
  pool = new MemPool();

  query = async function (text, params) {
    return pool.query(text, params);
  };

  init = async function () {
    await query(`
      CREATE TABLE IF NOT EXISTS devices(
        id BIGSERIAL PRIMARY KEY,
        hwid TEXT UNIQUE NOT NULL,
        cpu_info TEXT,
        os_info TEXT,
        ip_first_seen TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS licenses(
        id BIGSERIAL PRIMARY KEY,
        key_code TEXT UNIQUE NOT NULL,
        primary_hwid TEXT NOT NULL,
        device_limit INTEGER NOT NULL DEFAULT 1,
        expires_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        note TEXT,
        ban_reason TEXT,
        banned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS key_bindings(
        id BIGSERIAL PRIMARY KEY,
        key_id BIGINT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        hwid TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(key_id, hwid)
      );
      CREATE TABLE IF NOT EXISTS audit_logs(
        id BIGSERIAL PRIMARY KEY,
        key_code TEXT,
        hwid TEXT,
        action TEXT NOT NULL,
        message TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS used_nonces(
        nonce TEXT PRIMARY KEY,
        expires_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_events(
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        source_ip TEXT,
        target_key TEXT,
        hwid TEXT,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  };
}

// Tự động dọn dẹp các Nonce hết hạn trong CSDL mỗi 10 phút
setInterval(async () => {
  try {
    const now = Date.now();
    await query('DELETE FROM used_nonces WHERE expires_at < $1', [now]);
  } catch {}
}, 10 * 60 * 1000);

module.exports = { pool, query, init, isTurso };
