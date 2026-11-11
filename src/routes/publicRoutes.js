const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { DatabaseRateLimitStore } = require('../utils/dbStores');
const publicController = require('../controllers/publicController');

// Batasi pengiriman formulir kontak untuk mencegah spam massal
const contactLimiter = rateLimit({
  store: new DatabaseRateLimitStore('contact:'),
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  message: 'Terlalu banyak pesan dikirim dari jaringan Anda. Silakan coba lagi setelah 1 jam.',
  standardHeaders: true,
  legacyHeaders: false
});

// 1. Beranda
router.get('/', publicController.home);

// 2. Profil Sekolah
router.get('/profil', publicController.profile);

// 3. Akademik & Kurikulum
router.get('/akademik', publicController.academics);

// 4. Guru & Tenaga Kependidikan
router.get('/guru', publicController.teachers);

// 5. Kesiswaan, Ekstrakurikuler, Prestasi
router.get('/kesiswaan', publicController.studentAffairs);

// 6. Berita, Pengumuman & Artikel
router.get('/berita', publicController.newsList);
router.get('/berita/:slug', publicController.newsDetail);

// 7. Galeri Foto & Video
router.get('/galeri', publicController.gallery);

// 8. PPDB
router.get('/ppdb', publicController.ppdb);

// 9. Dokumen Unduhan
router.get('/unduhan', publicController.downloads);
router.get('/unduhan/:id/file', publicController.downloadFile);

// 10. Kontak & Buku Tamu
router.get('/kontak', publicController.contact);
router.post('/kontak/kirim', contactLimiter, publicController.sendMessage);

// SEO: Sitemap
router.get('/sitemap.xml', publicController.sitemap);

module.exports = router;
