/**
 * TBAO TEAM - LICENSE HEARTBEAT CACHE
 * Giảm tải Database: Cache kết quả xác thực hợp lệ trong 30 giây
 * Tự động xóa cache ngay khi Admin cập nhật/khóa/xóa key!
 */

const cache = new Map(); // key:hwid -> { payload, expiresAt }
const DEFAULT_TTL_MS = 30 * 1000; // 30 giây

function getCachedLicense(key, hwid) {
  if (!key || !hwid) return null;
  const cacheKey = `${key.trim()}:${hwid.trim()}`;
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.payload;
}

function setCachedLicense(key, hwid, payload, ttlMs = DEFAULT_TTL_MS) {
  if (!key || !hwid) return;
  const cacheKey = `${key.trim()}:${hwid.trim()}`;
  cache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + ttlMs
  });
}

function invalidateKey(key) {
  if (!key) return;
  const cleanKey = key.trim();
  for (const [cacheKey] of cache.entries()) {
    if (cacheKey.startsWith(cleanKey + ':')) {
      cache.delete(cacheKey);
    }
  }
}

function clearAllCache() {
  cache.clear();
}

module.exports = {
  getCachedLicense,
  setCachedLicense,
  invalidateKey,
  clearAllCache
};
