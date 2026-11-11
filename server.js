require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');
const helmet = require('helmet');
const cors = require('cors');

const publicRoutes = require('./src/routes/publicRoutes');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const { localsMiddleware } = require('./src/middleware/locals');
const { runSecurityAudit } = require('./src/utils/security-check');
const { DatabaseSessionStore } = require('./src/utils/dbStores');

const app = express();
const PORT = process.env.PORT || 3000;

// Wajib saat berjalan di balik reverse proxy (cPanel/Passenger, Nginx, Cloudflare).
// Tanpa ini express-rate-limit menolak login karena header X-Forwarded-For,
// dan cookie session "secure" tidak terdeteksi sebagai HTTPS.
app.set('trust proxy', 1);

// Keamanan Dasar dengan Helmet
// CSP membatasi sumber skrip/gambar sehingga injeksi skrip dari domain asing (mis. iklan judi) ikut diblokir.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // dibutuhkan Tailwind CDN & skrip inline bawaan tema
          'https://cdn.tailwindcss.com',
          'https://cdn.quilljs.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.quilljs.com'
        ],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'], // Unsplash, logo, dan gambar unggahan
        connectSrc: ["'self'", 'https://cdn.tailwindcss.com'],
        frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false, // agar embed Google Maps tetap tampil
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 15552000, includeSubDomains: true }
      : false
  })
);

app.use(cors());
app.use(methodOverride('_method'));

// Proteksi CSRF berbasis Origin/Referer.
// Menolak POST/PUT/DELETE dari situs lain, sehingga admin yang sedang login
// tidak bisa dibujuk mengeksekusi aksi (mis. menerbitkan berita judi) dari tab lain.
//
// Catatan: sebagian browser/preview mengirim "Origin: null" (iframe sandbox,
// mode privasi, atau ekstensi). Nilai null diperlakukan sebagai "tidak tersedia",
// dan perlindungan tetap dijaga oleh cookie SameSite=Lax.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostMatches(value, host) {
  if (!value || value === 'null') return false;
  try {
    return new URL(value).host === host;
  } catch (err) {
    return false;
  }
}

app.use((req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const host = req.get('host');
  const origin = req.get('origin');
  const referer = req.get('referer');

  // 1. Origin atau Referer cocok dengan host aplikasi -> izinkan
  if (hostMatches(origin, host) || hostMatches(referer, host)) return next();

  // 2. Ada Origin/Referer nyata dari domain lain -> tolak
  const hasForeignSource =
    (origin && origin !== 'null') || (referer && referer !== 'null');

  if (hasForeignSource) {
    console.warn(`[SECURITY] Permintaan ${req.method} ${req.originalUrl} ditolak (origin: ${origin || referer}) dari IP ${req.ip}`);
    return res.status(403).send('Permintaan ditolak: origin tidak sah.');
  }

  // 3. Tidak ada Origin/Referer (klien non-browser atau preview sandbox).
  //    Cookie SameSite=Lax sudah mencegah permintaan lintas situs.
  return next();
});

// Body Parser (dibatasi 250kb untuk mencegah serangan DoS payload besar)
app.use(express.urlencoded({ extended: true, limit: '250kb' }));
app.use(express.json({ limit: '250kb' }));

// Session Management (Disimpan di database agar persistent di Vercel Serverless)
app.use(
  session({
    store: new DatabaseSessionStore(),
    name: 'smandas.sid',
    secret: process.env.SESSION_SECRET || 'sman12_denpasar_bali_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 jam
      httpOnly: true,
      sameSite: 'lax', // mencegah cookie dipakai pada permintaan lintas situs
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Template Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Global Locals Middleware (injeksi data sekolah, info user, date helper, alerts)
app.use(localsMiddleware);

// Route Definitions
app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('pages/error', {
    title: 'Halaman Tidak Ditemukan - 404',
    status: 404,
    message: 'Maaf, halaman yang Anda cari tidak dapat ditemukan atau telah dipindahkan.'
  });
});

// 500 Handler
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).render('pages/error', {
    title: 'Terjadi Kesalahan Server - 500',
    status: 500,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Terjadi gangguan internal pada server. Silakan coba kembali nanti.'
  });
});

// Jalankan Server (hanya listen langsung jika tidak dijalankan sebagai serverless function di Vercel)
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    const isSocket = typeof PORT === 'string' && isNaN(Number(PORT));
    if (!isSocket) {
      console.log(`====================================================`);
      console.log(`🚀 SMA NEGERI 12 DENPASAR - WEBSITE RESMI AKTIF`);
      console.log(`📡 URL Lokal    : http://localhost:${PORT}`);
      console.log(`🔐 Panel Admin  : http://localhost:${PORT}/auth/login`);
      console.log(`🛡️  Keamanan      : aktifkan 2FA di menu Keamanan Akun`);
      console.log(`====================================================`);
    } else {
      console.log('🚀 SMA NEGERI 12 DENPASAR aktif melalui Passenger socket.');
    }

    runSecurityAudit();
  });

  server.on('error', (err) => {
    console.error('Gagal menjalankan server:', err.message);
    process.exit(1);
  });
}

module.exports = app;
