const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter, resetLimiter, twoFactorLimiter, sensitiveLimiter, requireAuth, enforcePasswordChange, redirectIfAuth } = require('../middleware/auth');

router.get('/login', redirectIfAuth, authController.showLogin);
router.post('/login', redirectIfAuth, loginLimiter, authController.processLogin);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// Fitur Lupa Password & Reset Password
router.get('/forgot-password', redirectIfAuth, authController.showForgotPassword);
router.post('/forgot-password', redirectIfAuth, resetLimiter, authController.processForgotPassword);
router.get('/reset-password', redirectIfAuth, authController.showResetPassword);
router.post('/reset-password', redirectIfAuth, resetLimiter, authController.processResetPassword);

// Verifikasi dua faktor (langkah kedua login)
router.get('/two-factor', authController.showTwoFactor);
router.post('/two-factor', twoFactorLimiter, authController.verifyTwoFactor);

// Ganti kata sandi (wajib saat masih memakai sandi default)
router.get('/change-password', requireAuth, authController.showChangePassword);
router.post('/change-password', requireAuth, sensitiveLimiter, authController.processChangePassword);

// Keamanan akun: aktifkan / nonaktifkan 2FA & kode cadangan
router.get('/security', requireAuth, enforcePasswordChange, authController.showSecurity);
router.post('/security/enable', requireAuth, enforcePasswordChange, sensitiveLimiter, authController.enableTwoFactor);
router.post('/security/disable', requireAuth, enforcePasswordChange, sensitiveLimiter, authController.disableTwoFactor);
router.post('/security/backup-codes', requireAuth, enforcePasswordChange, sensitiveLimiter, authController.regenerateBackupCodes);

module.exports = router;
