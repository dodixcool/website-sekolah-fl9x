/**
 * Koneksi database berbasis libSQL (kompatibel SQLite).
 *
 * - Lokal  : memakai file SQLite biasa (DATABASE_PATH, default ./data/database.sqlite)
 * - Vercel : memakai Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
 *
 * API dibuat mirip better-sqlite3 agar kode controller tetap mudah dibaca,
 * namun seluruh method bersifat ASYNC sehingga wajib dipanggil dengan `await`:
 *
 *   const row  = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
 *   const rows = await db.prepare('SELECT * FROM posts').all();
 *   const info = await db.prepare('DELETE FROM posts WHERE id = ?').run(id);
 *
 * Semua query tetap memakai parameter (?) sehingga aman dari SQL Injection.
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const remoteUrl = process.env.TURSO_DATABASE_URL;
let url = remoteUrl;
let isLocalFile = false;

if (!url) {
  // Jika di Vercel belum ada TURSO_DATABASE_URL, gunakan file database lokal bawaan
  const dbPath = process.env.DATABASE_PATH || './data/database.sqlite';
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
  url = 'file:' + resolvedPath.replace(/\\/g, '/');
  isLocalFile = true;
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

// Konversi argumen agar setara better-sqlite3 (undefined -> NULL, boolean -> 0/1)
function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function normalizeArgs(args) {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
    const named = {};
    for (const [key, value] of Object.entries(args[0])) named[key] = normalizeValue(value);
    return named;
  }
  const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return flat.map(normalizeValue);
}

function toObjects(rs) {
  return rs.rows.map((row) => {
    const obj = {};
    rs.columns.forEach((col, i) => {
      const v = row[i];
      obj[col] = typeof v === 'bigint' ? Number(v) : v;
    });
    return obj;
  });
}

// ---------------------------------------------------------
// Inisialisasi skema (sekali per proses / cold start)
// ---------------------------------------------------------
async function columnNames(table) {
  const rs = await client.execute(`PRAGMA table_info(${table})`);
  return toObjects(rs).map((c) => c.name);
}

async function initialize() {
  if (isLocalFile) {
    try {
      await client.execute('PRAGMA journal_mode = WAL');
    } catch (err) {
      await client.execute('PRAGMA journal_mode = DELETE');
    }
  }
  try {
    await client.execute('PRAGMA foreign_keys = ON');
  } catch (err) {
    // sebagian koneksi remote mengabaikan PRAGMA ini
  }

  // Migrasi skema ringan jika diizinkan (pada read-only fs Vercel, jangan biarkan melempar crash fatal)
  try {
    const hasUsers = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (hasUsers.rows.length > 0) {
      const columns = await columnNames('users');
      if (!columns.includes('totp_secret')) await client.execute('ALTER TABLE users ADD COLUMN totp_secret TEXT');
      if (!columns.includes('totp_enabled')) await client.execute('ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0');
      if (!columns.includes('must_change_password')) await client.execute('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0');
    }

    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS user_backup_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        hits INTEGER NOT NULL DEFAULT 0,
        reset_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
    `);
  } catch (schemaErr) {
    console.warn('Inisialisasi skema dilewati/gagal (mungkin sistem file read-only):', schemaErr.message);
  }
}

let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = initialize().catch((err) => {
      readyPromise = null; // coba lagi pada permintaan berikutnya
      console.error('Gagal menyiapkan skema database:', err.message);
      throw err;
    });
  }
  return readyPromise;
}

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  async all(...args) {
    await ready();
    const rs = await client.execute({ sql: this.sql, args: normalizeArgs(args) });
    return toObjects(rs);
  }

  async get(...args) {
    const rows = await this.all(...args);
    return rows[0];
  }

  async run(...args) {
    await ready();
    const rs = await client.execute({ sql: this.sql, args: normalizeArgs(args) });
    return {
      changes: rs.rowsAffected,
      lastInsertRowid: rs.lastInsertRowid !== undefined ? Number(rs.lastInsertRowid) : undefined
    };
  }
}

const db = {
  client,
  isRemote: !isLocalFile,
  ready,

  prepare(sql) {
    return new Statement(sql);
  },

  // Menjalankan beberapa perintah SQL sekaligus (mis. schema.sql)
  async exec(sql) {
    await ready();
    return client.executeMultiple(sql);
  },

  // Menjalankan beberapa query secara atomik (pengganti db.transaction)
  // statements: [{ sql, args: [...] }, ...]
  async batch(statements) {
    await ready();
    return client.batch(
      statements.map((s) => ({ sql: s.sql, args: normalizeArgs(s.args || []) })),
      'write'
    );
  }
};

module.exports = db;
