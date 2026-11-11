const multer = require('multer');
const path = require('path');
const { saveUpload } = require('../utils/storage');
const crypto = require('crypto');

// Ekstensi gambar yang diizinkan beserta MIME yang sah.
// SVG sengaja TIDAK diizinkan: SVG dapat memuat JavaScript (stored XSS).
const IMAGE_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

// Ekstensi dokumen yang diizinkan (tanpa file yang bisa dieksekusi server)
const DOCUMENT_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar']);

const DOCUMENT_MIME_EXT = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.rar': '.rar',
  'application/x-rar-compressed': '.rar',
  'application/octet-stream': null // ekstensi mengikuti nama file asli
};

function uniqueName(subfolder, ext) {
  return `${subfolder}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// File ditampung di memori dulu, lalu disimpan oleh persistUploads()
// ke Vercel Blob (produksi) atau public/uploads (lokal). Lihat src/utils/storage.js.
const memoryStorage = multer.memoryStorage();

// Batas body request Vercel Serverless = 4,5 MB, jadi ukuran file dibatasi 4 MB di sana.
const VERCEL_MAX = 4 * 1024 * 1024;
function sizeLimit(bytes) {
  return process.env.VERCEL ? Math.min(bytes, VERCEL_MAX) : bytes;
}

// Middleware: simpan file yang lolos validasi, lalu isi file.publicUrl
function persistUploads(subfolder) {
  return async (req, res, next) => {
    try {
      const files = [];
      if (req.file) files.push(req.file);
      if (req.files) {
        const groups = Array.isArray(req.files) ? [req.files] : Object.values(req.files);
        for (const group of groups) files.push(...group);
      }
      for (const file of files) {
        file.publicUrl = await saveUpload(file, subfolder);
        file.filename = path.basename(file.publicUrl);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Membungkus instance multer: .single(field) mengembalikan [multer, persist]
function createUploader(subfolder, options) {
  const instance = multer({
    storage: memoryStorage,
    limits: { fileSize: sizeLimit(options.fileSize), files: options.files || 1 },
    fileFilter: options.fileFilter
  });
  return {
    single: (field) => [instance.single(field), persistUploads(subfolder)],
    fields: (fields) => [instance.fields(fields), persistUploads(subfolder)]
  };
}

// Filter file gambar: validasi ekstensi + MIME, lalu tentukan ekstensi final dari MIME
const imageFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const safeExt = IMAGE_MIME_EXT[mime];

  if (safeExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    file.safeExt = safeExt;
    return cb(null, true);
  }

  cb(new Error('Format gambar tidak didukung! Hanya diperbolehkan JPG, PNG, WEBP, atau GIF.'));
};

// Filter file dokumen
const documentFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!DOCUMENT_EXT.has(ext)) {
    return cb(new Error('Format dokumen tidak didukung! Hanya diperbolehkan PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, atau RAR.'));
  }

  // Jika MIME dikenali, pastikan konsisten dengan ekstensinya
  const mimeExt = DOCUMENT_MIME_EXT[mime];
  if (mimeExt && mimeExt !== ext) {
    return cb(new Error('Isi file tidak sesuai dengan ekstensinya.'));
  }

  file.safeExt = ext;
  return cb(null, true);
};

// Multer upload instances (memoryStorage + penyimpanan via src/utils/storage.js)
const uploadPost = createUploader('posts', { fileSize: 5 * 1024 * 1024, fileFilter: imageFilter });
const uploadTeacher = createUploader('teachers', { fileSize: 4 * 1024 * 1024, fileFilter: imageFilter });
const uploadSlider = createUploader('sliders', { fileSize: 6 * 1024 * 1024, fileFilter: imageFilter });
const uploadGallery = createUploader('gallery', { fileSize: 8 * 1024 * 1024, fileFilter: imageFilter });
const uploadAchievement = createUploader('achievements', { fileSize: 5 * 1024 * 1024, fileFilter: imageFilter });
const uploadExtracurricular = createUploader('extracurriculars', { fileSize: 5 * 1024 * 1024, fileFilter: imageFilter });
const uploadDocument = createUploader('documents', { fileSize: 20 * 1024 * 1024, fileFilter: documentFilter });

const uploadSettings = createUploader('settings', { fileSize: 6 * 1024 * 1024, files: 2, fileFilter: imageFilter }).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'principal_photo', maxCount: 1 }
]);

module.exports = {
  uploadPost,
  uploadTeacher,
  uploadSlider,
  uploadGallery,
  uploadAchievement,
  uploadExtracurricular,
  uploadDocument,
  uploadSettings
};