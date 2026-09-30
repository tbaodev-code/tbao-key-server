PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hwid TEXT NOT NULL UNIQUE,
    cpu_info TEXT,
    os_info TEXT,
    ip_first_seen TEXT,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid);

CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code TEXT NOT NULL UNIQUE,
    primary_hwid TEXT NOT NULL,
    device_limit INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    ban_reason TEXT,
    banned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    note TEXT,
    FOREIGN KEY (primary_hwid) REFERENCES devices(hwid) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_keys_code ON keys(key_code);
CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);

CREATE TABLE IF NOT EXISTS key_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL,
    hwid TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    bound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES keys(id) ON DELETE CASCADE,
    FOREIGN KEY (hwid) REFERENCES devices(hwid) ON DELETE CASCADE,
    UNIQUE(key_id, hwid)
);

CREATE INDEX IF NOT EXISTS idx_bindings_key ON key_bindings(key_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code TEXT,
    hwid TEXT,
    action TEXT,
    message TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);