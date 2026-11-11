const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Akun demo bawaan proyek. Password ini TIDAK boleh dipakai di server publik.
const DEFAULT_CREDENTIALS = {
  admin: 'admin123',
  editor: 'editor123'
};

/**
 * Memeriksa konfigurasi berbahaya saat aplikasi dijalankan.
 * Hanya memberi peringatan (tidak menghentikan server) agar situs tetap bisa
 * diakses, tetapi masalahnya terlihat jelas di log.
 */
async function runSecurityAudit() {
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return warnings;
  }

  const sessionSecret = process.env.SESSION_SECRET || '';
  if (sessionSecret.length < 32 || sessionSecret.includes('secret_key')) {
    warnings.push('SESSION_SECRET masih lemah atau memakai nilai contoh. Ganti dengan string acak minimal 32 karakter.');
  }

  const masterKey = process.env.RECOVERY_MASTER_KEY || '';
  if (masterKey.length < 16 || masterKey.includes('RECOVERY-2026')) {
    warnings.push('RECOVERY_MASTER_KEY masih default/lemah. Ganti dengan kunci rahasia minimal 16 karakter.');
  }

  try {
    const users = await db.prepare("SELECT username, password FROM users WHERE username IN ('admin', 'editor')").all();
    for (const user of users) {
      const defaultPassword = DEFAULT_CREDENTIALS[user.username];
      if (defaultPassword && bcrypt.compareSync(defaultPassword, user.password)) {
        warnings.push(`Password akun "${user.username}" masih default (${defaultPassword}). Segera ganti lewat menu Pengguna.`);
      }
    }
  } catch (err) {
    warnings.push('Tidak dapat memeriksa password akun: ' + err.message);
  }

  if (warnings.length > 0) {
    console.warn('\n================ PERINGATAN KEAMANAN ================');
    warnings.forEach((msg, i) => console.warn(`${i + 1}. ${msg}`));
    console.warn('=====================================================\n');
  } else {
    console.log('✅ Pemeriksaan keamanan dasar: tidak ada masalah yang terdeteksi.');

    // Peringatan lunak: superadmin sebaiknya memakai 2FA
    try {
      const adminsWithout2fa = await db.prepare(
        "SELECT username FROM users WHERE role = 'superadmin' AND (totp_enabled IS NULL OR totp_enabled = 0)"
      ).all();
      if (adminsWithout2fa.length > 0) {
        console.warn(
          'ℹ️  Saran keamanan: superadmin berikut belum mengaktifkan 2FA: ' +
          adminsWithout2fa.map((u) => u.username).join(', ')
        );
      }
    } catch (err) {
      // abaikan jika kolom belum tersedia
    }
  }

  return warnings;
}

module.exports = { runSecurityAudit };
