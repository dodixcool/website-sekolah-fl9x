/**
 * Penyimpanan session & rate limit di database.
 *
 * Di Vercel (serverless) setiap permintaan bisa dilayani oleh instance berbeda,
 * sehingga session dan hitungan percobaan login TIDAK boleh disimpan di memori.
 * Keduanya disimpan di tabel `sessions` dan `rate_limits` (Turso / SQLite).
 */
const session = require('express-session');
const db = require('../config/database');

const DEFAULT_TTL = 1000 * 60 * 60 * 24; // 24 jam

class DatabaseSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || DEFAULT_TTL;
  }

  expiresFor(sess) {
    if (sess && sess.cookie && sess.cookie.expires) {
      return new Date(sess.cookie.expires).getTime();
    }
    return Date.now() + this.ttl;
  }

  get(sid, cb) {
    db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid)
      .then((row) => {
        if (!row) return cb(null, null);
        if (Number(row.expires) < Date.now()) {
          return this.destroy(sid, () => cb(null, null));
        }
        return cb(null, JSON.parse(row.sess));
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    db.prepare(`
      INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `).run(sid, JSON.stringify(sess), this.expiresFor(sess))
      .then(() => {
        // Bersihkan session kedaluwarsa sesekali (±2% permintaan)
        if (Math.random() < 0.02) {
          db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()).catch(() => {});
        }
        if (cb) cb(null);
      })
      .catch((err) => cb && cb(err));
  }

  touch(sid, sess, cb) {
    db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(this.expiresFor(sess), sid)
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  destroy(sid, cb) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid)
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }
}

/**
 * Store untuk express-rate-limit (v7/v8). Satu instance per limiter (prefix unik).
 */
class DatabaseRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localKeys = false; // hitungan dibagi antar instance
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const now = Date.now();
    const row = await db.prepare(`
      INSERT INTO rate_limits (key, hits, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
      RETURNING hits, reset_at
    `).get(this.prefix + key, now + this.windowMs, now, now);

    if (Math.random() < 0.02) {
      db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now).catch(() => {});
    }

    return { totalHits: Number(row.hits), resetTime: new Date(Number(row.reset_at)) };
  }

  async decrement(key) {
    await db.prepare('UPDATE rate_limits SET hits = MAX(hits - 1, 0) WHERE key = ?').run(this.prefix + key);
  }

  async resetKey(key) {
    await db.prepare('DELETE FROM rate_limits WHERE key = ?').run(this.prefix + key);
  }
}

module.exports = { DatabaseSessionStore, DatabaseRateLimitStore };
