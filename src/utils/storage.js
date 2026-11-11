/**
 * Penyimpanan file unggahan.
 *
 * - Jika BLOB_READ_WRITE_TOKEN tersedia (Vercel Blob aktif) -> file disimpan di Vercel Blob
 *   dan URL yang disimpan ke database berupa https://....public.blob.vercel-storage.com/...
 * - Jika tidak (lokal / VPS)                                -> file disimpan di public/uploads/
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');

function uniqueName(subfolder, ext) {
  return `${subfolder}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

function isBlobUrl(value) {
  try {
    const { hostname, protocol } = new URL(value);
    return protocol === 'https:' && hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/**
 * Menyimpan file dari multer (memoryStorage) dan mengembalikan URL publiknya.
 */
async function saveUpload(file, subfolder) {
  const ext = file.safeExt || path.extname(file.originalname).toLowerCase();
  const name = uniqueName(subfolder, ext);

  if (useBlob) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${subfolder}/${name}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      addRandomSuffix: false
    });
    return blob.url;
  }

  if (process.env.VERCEL) {
    throw new Error('Penyimpanan file belum dikonfigurasi: hubungkan Vercel Blob ke proyek (BLOB_READ_WRITE_TOKEN).');
  }

  const dir = path.join(UPLOADS_ROOT, subfolder);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, name), file.buffer);
  return `/uploads/${subfolder}/${name}`;
}

/**
 * Menghapus file unggahan (lokal di public/uploads atau di Vercel Blob).
 * Path lain (mis. /images/logo-sekolah.svg atau URL Unsplash) diabaikan.
 */
async function deleteUpload(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  try {
    if (isBlobUrl(fileUrl)) {
      if (!useBlob) return;
      const { del } = require('@vercel/blob');
      await del(fileUrl);
      return;
    }

    if (!fileUrl.startsWith('/uploads/')) return;
    const fullPath = path.resolve(process.cwd(), 'public', fileUrl.replace(/^[\\/]+/, ''));
    if (!fullPath.startsWith(UPLOADS_ROOT + path.sep)) return; // anti path traversal
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch (err) {
    console.error('Gagal menghapus file unggahan:', err.message);
  }
}

module.exports = { saveUpload, deleteUpload, isBlobUrl, useBlob };
