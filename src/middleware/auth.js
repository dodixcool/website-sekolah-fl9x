const rateLimit = require('express-rate-limit');
const { DatabaseRateLimitStore } = require('../utils/dbStores');

// Hitungan percobaan disimpan di database agar tetap berlaku di Vercel (serverless).

// Middleware untuk membatasi percobaan login (Brute-Force Protection)
const loginLimiter = rateLimit({
  store: new DatabaseRateLimitStore('login:'),
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // Maksimal 10 percobaan per IP
  message: 'Terlalu banyak percobaan login gagal dari IP Anda. Silakan coba lagi setelah 15 menit.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware khusus permintaan reset password (mencegah spam & brute force token)
const resetLimiter = rateLimit({
  store: new DatabaseRateLimitStore('reset:'),
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5, // Maksimal 5 permintaan per IP per jam
  message: 'Terlalu banyak permintaan pemulihan kata sandi. Silakan coba lagi setelah 1 jam.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Verifikasi 2FA: batasi tebakan kode
const twoFactorLimiter = rateLimit({
  store: new DatabaseRateLimitStore('2fa:'),
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Terlalu banyak percobaan verifikasi. Silakan coba lagi setelah 15 menit.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Aksi sensitif akun (ganti sandi, aktif/nonaktif 2FA, kode cadangan)
const sensitiveLimiter = rateLimit({
  store: new DatabaseRateLimitStore('sensitive:'),
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Terlalu banyak aksi keamanan akun. Silakan coba lagi setelah 1 jam.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware memastikan user sudah login
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login?error=' + encodeURIComponent('Silakan login terlebih dahulu untuk mengakses panel admin.'));
}

// Paksa penggantian kata sandi default sebelum mengakses panel admin
function enforcePasswordChange(req, res, next) {
  if (req.session && req.session.user && req.session.user.mustChangePassword) {
    if (req.path.startsWith('/auth/change-password') || req.path.startsWith('/auth/logout')) {
      return next();
    }
    return res.redirect('/auth/change-password?error=' + encodeURIComponent('Anda wajib mengganti kata sandi default sebelum melanjutkan.'));
  }
  return next();
}

// Middleware khusus untuk Super Admin (hanya Super Admin yang bisa mengelola akun user lain dan reset data)
function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') {
    return next();
  }
  return res.status(403).render('pages/error', {
    title: 'Akses Ditolak',
    status: 403,
    message: 'Anda tidak memiliki hak akses (Super Admin diperlukan) untuk halaman ini.'
  });
}

// Middleware jika sudah login, tidak boleh buka halaman login lagi
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/admin/dashboard');
  }
  next();
}

module.exports = {
  loginLimiter,
  resetLimiter,
  twoFactorLimiter,
  sensitiveLimiter,
  requireAuth,
  enforcePasswordChange,
  requireSuperAdmin,
  redirectIfAuth
};
