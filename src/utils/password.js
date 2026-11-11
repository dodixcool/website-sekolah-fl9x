const WEAK_PASSWORDS = new Set([
  'admin123', 'editor123', 'password', 'password123', '12345678', '123456789',
  'qwerty123', 'adminadmin', 'sman12denpasar', 'sekolah123'
]);

/**
 * Memvalidasi kekuatan kata sandi.
 * @returns {string|null} pesan kesalahan, atau null jika valid
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Kata sandi minimal 8 karakter.';
  }
  if (password.length > 128) {
    return 'Kata sandi maksimal 128 karakter.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Kata sandi harus memuat huruf dan angka.';
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'Kata sandi terlalu mudah ditebak. Gunakan kombinasi yang lain.';
  }
  return null;
}

function isWeakPassword(password) {
  return WEAK_PASSWORDS.has(String(password || '').toLowerCase());
}

module.exports = { validatePassword, isWeakPassword, WEAK_PASSWORDS };
