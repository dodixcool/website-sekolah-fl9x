const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const db = require('../config/database');

// Toleransi 1 langkah (30 detik) untuk perbedaan jam perangkat.
authenticator.options = { window: 1 };

const ISSUER = 'SMA Negeri 12 Denpasar';
const BACKUP_CODE_COUNT = 8;
// Tanpa karakter ambigu (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateSecret() {
  return authenticator.generateSecret();
}

function otpauthUrl(label, secret) {
  return authenticator.keyuri(label, ISSUER, secret);
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token: String(token).replace(/\s/g, ''), secret });
  } catch (err) {
    return false;
  }
}

function createBackupCode() {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// Mengganti seluruh kode cadangan user. Mengembalikan kode dalam bentuk teks
// (hanya ditampilkan sekali kepada user), database menyimpan hash bcrypt.
async function replaceBackupCodes(userId) {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, createBackupCode);

  // Dijalankan atomik (batch) agar kode lama & baru tidak tercampur
  await db.batch([
    { sql: 'DELETE FROM user_backup_codes WHERE user_id = ?', args: [userId] },
    ...codes.map((code) => ({
      sql: 'INSERT INTO user_backup_codes (user_id, code_hash) VALUES (?, ?)',
      args: [userId, bcrypt.hashSync(normalizeCode(code), 10)]
    }))
  ]);

  return codes;
}

async function verifyBackupCode(userId, code) {
  const normalized = normalizeCode(code);
  if (normalized.length !== 8) return false;

  const rows = await db.prepare(
    'SELECT id, code_hash FROM user_backup_codes WHERE user_id = ? AND used_at IS NULL'
  ).all(userId);

  for (const row of rows) {
    if (bcrypt.compareSync(normalized, row.code_hash)) {
      // Tandai terpakai hanya jika belum dipakai (mencegah pemakaian ganda bersamaan)
      const result = await db.prepare(
        "UPDATE user_backup_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL"
      ).run(row.id);
      return result.changes > 0;
    }
  }
  return false;
}

async function countUnusedBackupCodes(userId) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM user_backup_codes WHERE user_id = ? AND used_at IS NULL'
  ).get(userId);
  return row ? row.total : 0;
}

async function clearTwoFactor(userId) {
  await db.batch([
    {
      sql: "UPDATE users SET totp_secret = NULL, totp_enabled = 0, updated_at = datetime('now') WHERE id = ?",
      args: [userId]
    },
    { sql: 'DELETE FROM user_backup_codes WHERE user_id = ?', args: [userId] }
  ]);
}

module.exports = {
  generateSecret,
  otpauthUrl,
  verifyToken,
  replaceBackupCodes,
  verifyBackupCode,
  countUnusedBackupCodes,
  clearTwoFactor,
  normalizeCode
};
