const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminController = require('../controllers/adminController');
const { requireAuth, enforcePasswordChange, requireSuperAdmin } = require('../middleware/auth');
const {
  uploadPost,
  uploadTeacher,
  uploadSlider,
  uploadGallery,
  uploadAchievement,
  uploadExtracurricular,
  uploadDocument,
  uploadSettings
} = require('../middleware/upload');

// Proteksi seluruh route admin
router.use(requireAuth);
router.use(enforcePasswordChange);

// Dashboard
router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', adminController.dashboard);

// 1. Berita & Pengumuman
router.get('/posts', adminController.listPosts);
router.get('/posts/create', adminController.showCreatePost);
router.post('/posts', uploadPost.single('thumbnail'), adminController.createPost);
router.get('/posts/:id/edit', adminController.showEditPost);
router.post('/posts/:id', uploadPost.single('thumbnail'), adminController.updatePost);
router.post('/posts/:id/delete', adminController.deletePost);

// 2. Agenda Kegiatan
router.get('/events', adminController.listEvents);
router.get('/events/create', adminController.showCreateEvent);
router.post('/events', adminController.createEvent);
router.get('/events/:id/edit', adminController.showEditEvent);
router.post('/events/:id', adminController.updateEvent);
router.post('/events/:id/delete', adminController.deleteEvent);

// 3. Guru & Karyawan
router.get('/teachers', adminController.listTeachers);
router.get('/teachers/create', adminController.showCreateTeacher);
router.post('/teachers', uploadTeacher.single('photo'), adminController.createTeacher);
router.get('/teachers/:id/edit', adminController.showEditTeacher);
router.post('/teachers/:id', uploadTeacher.single('photo'), adminController.updateTeacher);
router.post('/teachers/:id/delete', adminController.deleteTeacher);

// 4. Prestasi
router.get('/achievements', adminController.listAchievements);
router.get('/achievements/create', adminController.showCreateAchievement);
router.post('/achievements', uploadAchievement.single('photo'), adminController.createAchievement);
router.get('/achievements/:id/edit', adminController.showEditAchievement);
router.post('/achievements/:id', uploadAchievement.single('photo'), adminController.updateAchievement);
router.post('/achievements/:id/delete', adminController.deleteAchievement);

// 5. Ekstrakurikuler
router.get('/extracurriculars', adminController.listExtracurriculars);
router.get('/extracurriculars/create', adminController.showCreateExtra);
router.post('/extracurriculars', uploadExtracurricular.single('photo'), adminController.createExtra);
router.get('/extracurriculars/:id/edit', adminController.showEditExtra);
router.post('/extracurriculars/:id', uploadExtracurricular.single('photo'), adminController.updateExtra);
router.post('/extracurriculars/:id/delete', adminController.deleteExtra);

// 6. Galeri Media
router.get('/gallery', adminController.listGallery);
router.post('/gallery', uploadGallery.single('media_file'), adminController.createGallery);
router.post('/gallery/:id/delete', adminController.deleteGallery);

// 7. Dokumen Unduhan
router.get('/downloads', adminController.listDownloads);
router.post('/downloads', uploadDocument.single('document_file'), adminController.createDownload);
router.post('/downloads/:id/delete', adminController.deleteDownload);

// 8. Pesan Masuk / Buku Tamu
router.get('/messages', adminController.listMessages);
router.get('/messages/:id', adminController.viewMessage);
router.post('/messages/:id/delete', adminController.deleteMessage);

// 9. Slider Beranda
router.get('/sliders', adminController.listSliders);
router.post('/sliders', uploadSlider.single('image_file'), adminController.createSlider);
router.post('/sliders/:id/delete', adminController.deleteSlider);

// 10. Pengaturan Identitas Sekolah
router.get('/settings', adminController.showSettings);
router.post('/settings', uploadSettings, adminController.updateSettings);

// 11. Manajemen Pengguna (Khusus Super Admin)
router.get('/users', requireSuperAdmin, adminController.listUsers);
router.post('/users', requireSuperAdmin, adminController.createUser);
router.post('/users/:id', requireSuperAdmin, adminController.updateUser);
router.post('/users/:id/delete', requireSuperAdmin, adminController.deleteUser);

// Penanganan error upload (format ditolak, ukuran melebihi batas, dsb.)
// Redirect kembali ke halaman asal dengan pesan yang ramah, bukan halaman 500.
router.use((err, req, res, next) => {
  if (!err) return next();

  const isUploadError =
    err.name === 'MulterError' ||
    /Format (gambar|dokumen|file)|Isi file tidak sesuai|Ukuran file|Penyimpanan file/i.test(err.message || '');

  if (!isUploadError) return next(err);

  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'Ukuran file melebihi batas yang diizinkan.'
    : err.message;

  console.warn(`[UPLOAD] Ditolak: ${message} (IP ${req.ip})`);

  const base = req.get('referer') || '/admin/dashboard';
  const separator = base.includes('?') ? '&' : '?';
  return res.redirect(base + separator + 'error=' + encodeURIComponent(message));
});

module.exports = router;
