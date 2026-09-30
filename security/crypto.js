/**
 * TBAO TEAM - ENTERPRISE CRYPTOGRAPHIC ENGINE
 * Chữ ký số bất đối xứng Ed25519 & HMAC-SHA256 chống giả mạo Response & Reverse-engineering
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', '.server_signing_key.json');

let privateKey = null;
let publicKey = null;
let publicKeyPem = '';
let hmacSecret = process.env.SESSION_SECRET || 'tbao-super-secure-crypto-engine-2026';

function initKeys() {
  if (process.env.ED25519_PRIVATE_KEY && process.env.ED25519_PUBLIC_KEY) {
    try {
      privateKey = crypto.createPrivateKey(process.env.ED25519_PRIVATE_KEY);
      publicKey = crypto.createPublicKey(process.env.ED25519_PUBLIC_KEY);
      publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
      return;
    } catch (e) {
      console.warn('[CRYPTO] Lỗi đọc ED25519 từ env, tạo/tải từ file:', e.message);
    }
  }

  // Tải từ file lưu trữ cục bộ
  if (fs.existsSync(KEY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
      privateKey = crypto.createPrivateKey(data.privateKeyPem);
      publicKey = crypto.createPublicKey(data.publicKeyPem);
      publicKeyPem = data.publicKeyPem;
      if (data.hmacSecret) hmacSecret = data.hmacSecret;
      return;
    } catch (e) {
      console.warn('[CRYPTO] Lỗi đọc file key cũ, tiến hành sinh mới:', e.message);
    }
  }

  // Tự động sinh cặp khóa Ed25519 chuẩn công nghiệp
  const keyPair = crypto.generateKeyPairSync('ed25519');
  privateKey = keyPair.privateKey;
  publicKey = keyPair.publicKey;

  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const newHmac = crypto.randomBytes(32).toString('hex');
  hmacSecret = newHmac;

  try {
    fs.writeFileSync(
      KEY_FILE,
      JSON.stringify(
        {
          algorithm: 'Ed25519',
          created_at: new Date().toISOString(),
          publicKeyPem,
          privateKeyPem: privPem,
          hmacSecret: newHmac
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    console.log('⚡ [CRYPTO] Đã sinh cặp khóa ký bất đối xứng Ed25519 bảo mật!');
  } catch (err) {
    console.error('[CRYPTO_SAVE_ERR] Không thể ghi file key:', err.message);
  }
}

// Khởi tạo ngay khi nạp module
initKeys();

// Chuyển object thành chuỗi JSON chuẩn hóa (Canonical JSON) theo thứ tự alphabet của key
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Ký dữ liệu bằng Private Key của Server
 * Client chỉ cần giữ Public Key để xác thực -> Client KHÔNG THỂ giả mạo response!
 */
function signData(payloadObj) {
  const canonicalData = canonicalStringify(payloadObj);
  const dataBuf = Buffer.from(canonicalData, 'utf8');

  // 1. Chữ ký Ed25519 bất đối xứng
  const ed25519Sig = crypto.sign(null, dataBuf, privateKey).toString('hex');

  // 2. Chữ ký HMAC phụ trợ
  const hmacSig = crypto.createHmac('sha256', hmacSecret).update(dataBuf).digest('hex');

  return {
    signature: ed25519Sig,
    hmac_signature: hmacSig
  };
}

/**
 * Xác minh chữ ký Ed25519
 */
function verifySignature(payloadObj, signatureHex) {
  try {
    const canonicalData = canonicalStringify(payloadObj);
    const dataBuf = Buffer.from(canonicalData, 'utf8');
    const sigBuf = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, dataBuf, publicKey, sigBuf);
  } catch (err) {
    return false;
  }
}

function getPublicKeyPem() {
  return publicKeyPem;
}

module.exports = {
  signData,
  verifySignature,
  getPublicKeyPem,
  canonicalStringify
};
