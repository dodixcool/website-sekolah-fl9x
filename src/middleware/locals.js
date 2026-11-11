const db = require('../config/database');

// Cache settings in-memory to prevent reading DB on every single static request
let cachedSettings = null;
let lastCacheTime = 0;
const CACHE_DURATION = 10000; // 10 detik

async function getSchoolSettings() {
  const now = Date.now();
  if (cachedSettings && now - lastCacheTime < CACHE_DURATION) {
    return cachedSettings;
  }

  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  cachedSettings = settings;
  lastCacheTime = now;
  return settings;
}

// Helper untuk reset cache ketika admin mengubah pengaturan
function invalidateSettingsCache() {
  cachedSettings = null;
}

async function localsMiddleware(req, res, next) {
  res.locals.school = {};
  try {
    res.locals.school = await getSchoolSettings();
  } catch (err) {
    console.error('Gagal memuat pengaturan sekolah:', err.message);
    return next(err);
  }
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.successMsg = req.query.success || null;
  res.locals.errorMsg = req.query.error || null;

  // Format tanggal Indonesia helper
  res.locals.formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  res.locals.formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Helper potong teks
  res.locals.truncate = (text, maxLength = 120) => {
    if (!text) return '';
    // Hapus tag HTML
    const clean = text.replace(/<[^>]*>/g, '');
    if (clean.length <= maxLength) return clean;
    return clean.substring(0, maxLength) + '...';
  };

  next();
}

module.exports = {
  localsMiddleware,
  invalidateSettingsCache
};
