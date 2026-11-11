const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../config/database');
const twofactor = require('../utils/twofactor');
const { validatePassword, isWeakPassword } = require('../utils/password');

// Perbandingan constant-time agar master key tidak bisa ditebak lewat timing attack
function safeCompare(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Hanya izinkan redirect internal (mencegah open redirect)
function safeInternalPath(value) {
  if (typeof value !== 'string') return '/admin/dashboard';
  if (!value.startsWith('/') || value.startsWith('//')) return '/admin/dashboard';
  return value;
}

function buildSessionUser(user, mustChangePassword) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    mustChangePassword: Boolean(mustChangePassword),
    twoFactorEnabled: Boolean(user.totp_enabled)
  };
}

// Membuat session baru (regenerasi ID) lalu menyimpan data user.
function establishSession(req, user, options, done) {
  const { mustChangePassword = false } = options || {};

  req.session.regenerate((regenErr) => {
    if (regenErr) return done(regenErr);

    req.session.user = buildSessionUser(user, mustChangePassword);
    req.session.save((saveErr) => done(saveErr));
  });
}

const authController = {
  // Halaman Login Admin
  async showLogin(req, res) {
    res.render('admin/login', {
      title: 'Login Panel Admin - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
      layout: false
    });
  },

  // Proses Autentikasi Login
  async processLogin(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('Username dan password wajib diisi.'));
    }

    try {
      const user = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.trim(), username.trim());

      // Pesan seragam: tidak membocorkan apakah username terdaftar
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.redirect('/auth/login?error=' + encodeURIComponent('Username atau password yang Anda masukkan salah.'));
      }

      const redirectUrl = safeInternalPath(req.session.returnTo);
      // Wajib ganti sandi jika ditandai sistem ATAU masih memakai sandi default yang diketahui publik
      const mustChangePassword = Boolean(user.must_change_password) || isWeakPassword(password);

      // Jika 2FA aktif, sesi penuh belum diberikan. Simpan status sementara dulu.
      if (user.totp_enabled) {
        return req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error('Error regenerasi session:', regenErr);
            return res.redirect('/auth/login?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
          }

          req.session.pending2fa = {
            userId: user.id,
            returnTo: redirectUrl,
            mustChangePassword
          };

          return req.session.save((saveErr) => {
            if (saveErr) {
              console.error('Error menyimpan session:', saveErr);
              return res.redirect('/auth/login?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
            }
            return res.redirect('/auth/two-factor?success=' + encodeURIComponent('Masukkan kode 6 digit dari aplikasi authenticator Anda.'));
          });
        });
      }

      return establishSession(req, user, { mustChangePassword }, async (sessionErr) => {
        if (sessionErr) {
          console.error('Error membuat session:', sessionErr);
          return res.redirect('/auth/login?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
        }

        if (mustChangePassword) {
          try {
            await db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(user.id);
          } catch (dbErr) {
            console.error('Gagal menandai wajib ganti sandi:', dbErr);
          }
          return res.redirect('/auth/change-password?error=' + encodeURIComponent('Demi keamanan, ganti kata sandi Anda sebelum melanjutkan.'));
        }

        return res.redirect(redirectUrl + '?success=' + encodeURIComponent('Selamat datang kembali, ' + user.name + '!'));
      });
    } catch (err) {
      console.error('Error saat login:', err);
      return res.redirect('/auth/login?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
    }
  },

  // Logout
  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error logout:', err);
      }
      res.redirect('/auth/login?success=' + encodeURIComponent('Anda telah berhasil keluar dari sistem.'));
    });
  },

  // ----------------------------------------------------
  // FITUR LUPA & RESET PASSWORD ADMIN
  // ----------------------------------------------------

  // Tampilkan Halaman Lupa Password
  async showForgotPassword(req, res) {
    res.render('admin/forgot-password', {
      title: 'Lupa Kata Sandi - Panel Admin ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
      layout: false,
      resetData: null
    });
  },

  // Proses Permintaan Reset Password
  async processForgotPassword(req, res) {
    const { identity, recovery_key } = req.body;
    const masterKey = process.env.RECOVERY_MASTER_KEY;

    // Pesan generik: tidak membocorkan apakah akun terdaftar atau tidak
    const genericMessage =
      'Permintaan pemulihan telah dicatat. Tautan reset tidak ditampilkan di halaman ini demi keamanan; ' +
      'operator server sekolah dapat mengambilnya dari log server. Hubungi pengelola hosting/admin sekolah.';

    try {
      // 1. Jalur darurat: wajib Master Recovery Key dari environment (tanpa nilai default)
      if (recovery_key && recovery_key.trim().length > 0) {
        if (!masterKey || masterKey.trim().length < 16) {
          return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Fitur pemulihan darurat belum dikonfigurasi di server.'));
        }

        if (!safeCompare(recovery_key.trim(), masterKey.trim())) {
          console.warn(`[SECURITY] Percobaan master key gagal dari IP ${req.ip}`);
          return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Kunci pemulihan darurat tidak valid.'));
        }

        // Cari user yang dituju (jika ada identity, cari user tsb; jika kosong, default ke superadmin)
        let targetUser = null;
        if (identity && identity.trim().length > 0) {
          targetUser = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identity.trim(), identity.trim());
        }
        if (!targetUser) {
          targetUser = await db.prepare("SELECT * FROM users WHERE role = 'superadmin' LIMIT 1").get();
        }

        if (!targetUser) {
          return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Akun administrator tidak ditemukan.'));
        }

        const token = crypto.randomBytes(32).toString('hex');

        await db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(targetUser.id);
        await db.prepare(`
          INSERT INTO password_resets (user_id, token, token_code, expires_at)
          VALUES (?, ?, ?, datetime('now', '+30 minutes'))
        `).run(targetUser.id, token, crypto.randomInt(100000, 1000000).toString());

        console.warn(`[SECURITY] Reset darurat untuk "${targetUser.username}" dari IP ${req.ip}`);

        // Pemulihan darurat juga mematikan 2FA agar admin tidak terkunci
        // jika perangkat authenticator-nya hilang.
        await twofactor.clearTwoFactor(targetUser.id);

        return res.redirect(`/auth/reset-password?token=${token}&success=` + encodeURIComponent('Kunci pemulihan terverifikasi. Silakan tentukan kata sandi baru.'));
      }

      // 2. Tanpa master key: token TIDAK PERNAH ditampilkan di halaman.
      if (!identity || identity.trim().length === 0) {
        return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Masukkan username, email terdaftar, atau Kunci Pemulihan Darurat.'));
      }

      const user = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identity.trim(), identity.trim());

      // Respons selalu sama, baik akun ada maupun tidak (mencegah user enumeration)
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');

        await db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
        await db.prepare(`
          INSERT INTO password_resets (user_id, token, token_code, expires_at)
          VALUES (?, ?, ?, datetime('now', '+30 minutes'))
        `).run(user.id, token, crypto.randomInt(100000, 1000000).toString());

        console.warn(
          `[SECURITY] Permintaan reset untuk "${user.username}" dari IP ${req.ip}. ` +
          `Tautan berlaku 30 menit: /auth/reset-password?token=${token}`
        );
      }

      return res.redirect('/auth/forgot-password?success=' + encodeURIComponent(genericMessage));
    } catch (err) {
      console.error('Error saat lupa password:', err);
      return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
    }
  },

  // Halaman Buat Kata Sandi Baru
  async showResetPassword(req, res) {
    const token = req.query.token || req.body.token;

    if (!token) {
      return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Token pemulihan tidak ditemukan. Silakan ajukan reset kata sandi terlebih dahulu.'));
    }

    try {
      const resetRecord = await db.prepare(`
        SELECT pr.*, u.name, u.username, u.email
        FROM password_resets pr
        JOIN users u ON pr.user_id = u.id
        WHERE pr.token = ? AND pr.expires_at > datetime('now')
      `).get(token.trim());

      if (!resetRecord) {
        return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Tautan pemulihan kata sandi tidak valid atau telah kedaluwarsa (lebih dari 30 menit). Silakan ajukan ulang.'));
      }

      res.render('admin/reset-password', {
        title: 'Buat Kata Sandi Baru - Panel Admin',
        layout: false,
        token: resetRecord.token,
        userName: resetRecord.name,
        userEmail: resetRecord.email,
        username: resetRecord.username
      });
    } catch (err) {
      console.error('Error show reset password:', err);
      res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
    }
  },

  // Proses Simpan Kata Sandi Baru
  async processResetPassword(req, res) {
    const { token, new_password, confirm_password } = req.body;

    if (!token) {
      return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Sesi reset tidak sah.'));
    }

    if (!new_password || !confirm_password) {
      return res.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent('Mohon isi kata sandi baru dan konfirmasi kata sandi.'));
    }

    const policyError = validatePassword(new_password);
    if (policyError) {
      return res.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent(policyError));
    }

    if (new_password !== confirm_password) {
      return res.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent('Konfirmasi kata sandi tidak cocok! Pastikan keduanya sama persis.'));
    }

    try {
      const resetRecord = await db.prepare(`
        SELECT pr.*, u.name
        FROM password_resets pr
        JOIN users u ON pr.user_id = u.id
        WHERE pr.token = ? AND pr.expires_at > datetime('now')
      `).get(token.trim());

      if (!resetRecord) {
        return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Tautan pemulihan telah kedaluwarsa. Silakan ajukan ulang.'));
      }

      // Hash password baru
      const salt = bcrypt.genSaltSync(12);
      const hashedPassword = bcrypt.hashSync(new_password.trim(), salt);

      // Update password user & bersihkan flag must_change_password
      await db.prepare(`
        UPDATE users
        SET password = ?, must_change_password = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(hashedPassword, resetRecord.user_id);

      // Hapus token pemulihan yang telah dipakai
      await db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(resetRecord.user_id);

      return res.redirect('/auth/login?success=' + encodeURIComponent(`Kata sandi akun ${resetRecord.name} berhasil diperbarui! Silakan masuk dengan kata sandi baru Anda.`));
    } catch (err) {
      console.error('Error saat reset password:', err);
      return res.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent('Gagal memperbarui kata sandi. Silakan coba lagi.'));
    }
  },

  // ----------------------------------------------------
  // KEAMANAN AKUN: WAJIB GANTI SANDI & 2FA (TOTP)
  // ----------------------------------------------------

  async showChangePassword(req, res) {
    res.render('admin/change-password', {
      title: 'Ganti Kata Sandi - Panel Admin',
      layout: false,
      forced: Boolean(req.session.user && req.session.user.mustChangePassword)
    });
  },

  async processChangePassword(req, res) {
    const { current_password, new_password, confirm_password } = req.body;
    const sessionUser = req.session.user;
    const fail = (message) => res.redirect('/auth/change-password?error=' + encodeURIComponent(message));

    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(sessionUser.id);
      if (!user) {
        return req.session.destroy(() => res.redirect('/auth/login?error=' + encodeURIComponent('Sesi tidak valid. Silakan login kembali.')));
      }

      if (!current_password || !bcrypt.compareSync(current_password, user.password)) {
        return fail('Kata sandi saat ini salah.');
      }

      const policyError = validatePassword(new_password);
      if (policyError) return fail(policyError);

      if (new_password !== confirm_password) {
        return fail('Konfirmasi kata sandi tidak cocok.');
      }

      if (bcrypt.compareSync(new_password, user.password)) {
        return fail('Kata sandi baru harus berbeda dari kata sandi lama.');
      }

      const hashed = bcrypt.hashSync(new_password, 12);
      await db.prepare(`
        UPDATE users
        SET password = ?, must_change_password = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(hashed, user.id);

      req.session.user.mustChangePassword = false;
      return req.session.save(() => {
        res.redirect('/admin/dashboard?success=' + encodeURIComponent('Kata sandi berhasil diperbarui.'));
      });
    } catch (err) {
      console.error('Error ganti kata sandi:', err);
      return fail('Terjadi kesalahan pada sistem. Silakan coba lagi.');
    }
  },

  // Halaman verifikasi setelah password benar (langkah kedua login)
  async showTwoFactor(req, res) {
    if (!req.session.pending2fa) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('Sesi verifikasi tidak ditemukan. Silakan login kembali.'));
    }

    res.render('admin/two-factor', {
      title: 'Verifikasi Dua Faktor - Panel Admin',
      layout: false
    });
  },

  async verifyTwoFactor(req, res) {
    const pending = req.session.pending2fa;
    if (!pending) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('Sesi verifikasi tidak ditemukan. Silakan login kembali.'));
    }

    const code = (req.body.code || '').trim();
    const fail = (message) => res.redirect('/auth/two-factor?error=' + encodeURIComponent(message));

    if (!code) return fail('Masukkan kode verifikasi.');

    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(pending.userId);
      if (!user || !user.totp_enabled) {
        return res.redirect('/auth/login?error=' + encodeURIComponent('Akun tidak valid. Silakan login kembali.'));
      }

      let isValid = twofactor.verifyToken(code, user.totp_secret);
      if (!isValid) {
        isValid = await twofactor.verifyBackupCode(user.id, code);
      }

      if (!isValid) {
        console.warn(`[SECURITY] Kode 2FA salah untuk "${user.username}" dari IP ${req.ip}`);
        return fail('Kode verifikasi salah atau sudah kedaluwarsa.');
      }

      const { returnTo, mustChangePassword } = pending;

      return establishSession(req, user, { mustChangePassword }, (err) => {
        if (err) {
          console.error('Error membuat session:', err);
          return res.redirect('/auth/login?error=' + encodeURIComponent('Terjadi kesalahan pada sistem.'));
        }

        if (mustChangePassword) {
          return res.redirect('/auth/change-password?error=' + encodeURIComponent('Demi keamanan, ganti kata sandi Anda sebelum melanjutkan.'));
        }

        return res.redirect(safeInternalPath(returnTo) + '?success=' + encodeURIComponent('Verifikasi berhasil. Selamat datang kembali, ' + user.name + '!'));
      });
    } catch (err) {
      console.error('Error verifikasi 2FA:', err);
      return fail('Terjadi kesalahan pada sistem. Silakan coba lagi.');
    }
  },

  // Halaman pengaturan keamanan akun (aktifkan/nonaktifkan 2FA)
  async showSecurity(req, res) {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
    if (!user) {
      return req.session.destroy(() => res.redirect('/auth/login'));
    }

    const newBackupCodes = req.session.newBackupCodes || null;
    delete req.session.newBackupCodes;

    let setupSecret = null;
    let qrDataUrl = null;

    if (!user.totp_enabled) {
      setupSecret = req.session.pendingTotpSecret;
      if (!setupSecret) {
        setupSecret = twofactor.generateSecret();
        req.session.pendingTotpSecret = setupSecret;
      }

      try {
        const url = twofactor.otpauthUrl(user.email || user.username, setupSecret);
        qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      } catch (err) {
        console.error('Gagal membuat QR code:', err);
      }
    }

    res.render('admin/security', {
      title: 'Keamanan Akun & 2FA',
      layout: 'layouts/admin',
      account: user,
      setupSecret,
      qrDataUrl,
      newBackupCodes,
      backupCodesRemaining: await twofactor.countUnusedBackupCodes(user.id)
    });
  },

  async enableTwoFactor(req, res) {
    const fail = (message) => res.redirect('/auth/security?error=' + encodeURIComponent(message));

    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
      const secret = req.session.pendingTotpSecret;
      const code = (req.body.code || '').trim();

      if (!user) return res.redirect('/auth/login');
      if (!secret) return fail('Sesi pengaturan 2FA kedaluwarsa. Muat ulang halaman lalu coba lagi.');
      if (!twofactor.verifyToken(code, secret)) {
        return fail('Kode verifikasi salah. Pastikan jam perangkat Anda akurat, lalu coba lagi.');
      }

      await db.prepare(`
        UPDATE users
        SET totp_secret = ?, totp_enabled = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(secret, user.id);

      const codes = await twofactor.replaceBackupCodes(user.id);

      delete req.session.pendingTotpSecret;
      req.session.newBackupCodes = codes;
      req.session.user.twoFactorEnabled = true;

      return req.session.save(() => {
        res.redirect('/auth/security?success=' + encodeURIComponent('2FA berhasil diaktifkan. Simpan kode cadangan di tempat aman.'));
      });
    } catch (err) {
      console.error('Error mengaktifkan 2FA:', err);
      return fail('Terjadi kesalahan pada sistem. Silakan coba lagi.');
    }
  },

  async disableTwoFactor(req, res) {
    const fail = (message) => res.redirect('/auth/security?error=' + encodeURIComponent(message));

    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
      if (!user) return res.redirect('/auth/login');

      const { password, code } = req.body;

      if (!password || !bcrypt.compareSync(password, user.password)) {
        return fail('Kata sandi salah. 2FA tidak dinonaktifkan.');
      }

      const isValid = twofactor.verifyToken(code, user.totp_secret) || await twofactor.verifyBackupCode(user.id, code);
      if (!isValid) {
        return fail('Kode verifikasi salah. 2FA tidak dinonaktifkan.');
      }

      await twofactor.clearTwoFactor(user.id);
      req.session.user.twoFactorEnabled = false;

      return req.session.save(() => {
        res.redirect('/auth/security?success=' + encodeURIComponent('2FA telah dinonaktifkan.'));
      });
    } catch (err) {
      console.error('Error menonaktifkan 2FA:', err);
      return fail('Terjadi kesalahan pada sistem. Silakan coba lagi.');
    }
  },

  async regenerateBackupCodes(req, res) {
    const fail = (message) => res.redirect('/auth/security?error=' + encodeURIComponent(message));

    try {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
      if (!user) return res.redirect('/auth/login');
      if (!user.totp_enabled) return fail('Aktifkan 2FA terlebih dahulu.');

      if (!req.body.password || !bcrypt.compareSync(req.body.password, user.password)) {
        return fail('Kata sandi salah. Kode cadangan tidak diubah.');
      }

      req.session.newBackupCodes = await twofactor.replaceBackupCodes(user.id);

      return req.session.save(() => {
        res.redirect('/auth/security?success=' + encodeURIComponent('Kode cadangan baru dibuat. Kode lama tidak berlaku lagi.'));
      });
    } catch (err) {
      console.error('Error membuat kode cadangan:', err);
      return fail('Terjadi kesalahan pada sistem. Silakan coba lagi.');
    }
  }
};

module.exports = authController;
