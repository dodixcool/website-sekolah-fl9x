-- ========================================================
-- SKEMA DATABASE WEBSITE RESMI SMA NEGERI 12 DENPASAR
-- SQLite3 (Dapat diadaptasi ke MySQL dengan mudah)
-- ========================================================

-- 1. Pengaturan Identitas Sekolah & Profil
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Pengguna & Autentikasi (Admin, Editor)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('superadmin', 'editor')) DEFAULT 'editor',
    avatar TEXT DEFAULT '/images/default-avatar.png',
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    must_change_password INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2b. Token Pemulihan Password (Lupa Password)
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    token_code TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2c. Kode Cadangan 2FA (Backup Codes)
CREATE TABLE IF NOT EXISTS user_backup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Kategori (Berita, Agenda, Prestasi, Unduhan)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('post', 'download', 'gallery')) DEFAULT 'post',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Berita, Artikel & Pengumuman
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    thumbnail TEXT,
    status TEXT CHECK(status IN ('published', 'draft')) DEFAULT 'published',
    views INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Agenda & Kalender Kegiatan
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    location TEXT DEFAULT 'SMA Negeri 12 Denpasar',
    start_date DATE NOT NULL,
    end_date DATE,
    time_info TEXT,
    organizer TEXT DEFAULT 'Humas & Kesiswaan',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Guru & Tenaga Kependidikan
CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nip TEXT,
    role_type TEXT CHECK(role_type IN ('kepala_sekolah', 'guru', 'staff')) DEFAULT 'guru',
    subject TEXT,
    position TEXT,
    education TEXT,
    photo TEXT DEFAULT '/images/default-teacher.png',
    email TEXT,
    order_index INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Prestasi Siswa & Sekolah
CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    student_name TEXT NOT NULL,
    rank TEXT NOT NULL,
    level TEXT CHECK(level IN ('Kecamatan', 'Kota/Kabupaten', 'Provinsi', 'Nasional', 'Internasional')) DEFAULT 'Kota/Kabupaten',
    category TEXT CHECK(category IN ('Akademik', 'Non-Akademik', 'Seni Budaya', 'Olahraga', 'Teknologi')) DEFAULT 'Akademik',
    year INTEGER NOT NULL,
    organizer TEXT,
    photo TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Ekstrakurikuler & Organisasi Siswa (OSIS, Pramuka, Tari Bali, dll)
CREATE TABLE IF NOT EXISTS extracurriculars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'Seni & Budaya',
    mentor TEXT,
    schedule TEXT,
    location TEXT,
    description TEXT,
    photo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Galeri Foto & Video
CREATE TABLE IF NOT EXISTS galleries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    album TEXT DEFAULT 'Kegiatan Sekolah',
    type TEXT CHECK(type IN ('photo', 'video')) DEFAULT 'photo',
    media_url TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Dokumen Unduhan (Silabus, Formulir, Kalender Pendidikan, Panduan)
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Dokumen',
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size TEXT,
    file_type TEXT DEFAULT 'PDF',
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. PPDB (Penerimaan Peserta Didik Baru)
CREATE TABLE IF NOT EXISTS ppdb_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    status TEXT CHECK(status IN ('Buka', 'Tutup', 'Segera')) DEFAULT 'Segera',
    title TEXT NOT NULL,
    description TEXT,
    registration_url TEXT,
    start_date DATE,
    end_date DATE,
    announcement_date DATE,
    requirements TEXT,
    flow_steps TEXT,
    brochure_path TEXT,
    contact_person TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Pesan Masuk / Kontak (Buku Tamu & Pengaduan)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    reply_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Slider Hero Banner Beranda
CREATE TABLE IF NOT EXISTS sliders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    image_url TEXT NOT NULL,
    button_text TEXT DEFAULT 'Pelajari Selengkapnya',
    button_url TEXT DEFAULT '#',
    order_index INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Session login admin (dibutuhkan saat berjalan serverless, mis. Vercel)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
);

-- 15. Penghitung rate limit bersama (anti brute-force lintas instance serverless)
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
);

-- Indeks untuk performa dan SEO cepat
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_teachers_role ON teachers(role_type);
CREATE INDEX IF NOT EXISTS idx_achievements_year ON achievements(year);
CREATE INDEX IF NOT EXISTS idx_galleries_album ON galleries(album);
