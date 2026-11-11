const db = require('../config/database');

const publicController = {
  // 1. Beranda (Home)
  async home(req, res) {
    try {
      const sliders = await db.prepare('SELECT * FROM sliders WHERE is_active = 1 ORDER BY order_index ASC').all();
      
      const latestNews = await db.prepare(`
        SELECT p.*, c.name as category_name, c.slug as category_slug, u.name as author_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.status = 'published'
        ORDER BY p.published_at DESC
        LIMIT 4
      `).all();

      const featuredNews = await db.prepare(`
        SELECT p.*, c.name as category_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status = 'published' AND p.is_featured = 1
        ORDER BY p.published_at DESC
        LIMIT 1
      `).get();

      const upcomingEvents = await db.prepare(`
        SELECT * FROM events
        WHERE is_active = 1 AND start_date >= date('now', '-7 days')
        ORDER BY start_date ASC
        LIMIT 3
      `).all();

      const topAchievements = await db.prepare(`
        SELECT * FROM achievements
        ORDER BY year DESC, id DESC
        LIMIT 3
      `).all();

      const quickGalleries = await db.prepare(`
        SELECT * FROM galleries
        ORDER BY id DESC
        LIMIT 6
      `).all();

      const ppdb = await db.prepare('SELECT * FROM ppdb_info ORDER BY id DESC LIMIT 1').get();

      res.render('pages/index', {
        title: 'Beranda - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        sliders,
        latestNews,
        featuredNews,
        upcomingEvents,
        topAchievements,
        quickGalleries,
        ppdb
      });
    } catch (err) {
      console.error('Error in home page:', err);
      res.status(500).render('pages/error', {
        title: 'Terjadi Kesalahan',
        status: 500,
        message: 'Gagal memuat halaman beranda.'
      });
    }
  },

  // 2. Profil Sekolah
  async profile(req, res) {
    try {
      const teachersCount = (await db.prepare("SELECT COUNT(*) as count FROM teachers WHERE role_type = 'guru'").get()).count;
      const staffCount = (await db.prepare("SELECT COUNT(*) as count FROM teachers WHERE role_type = 'staff'").get()).count;
      
      res.render('pages/profil', {
        title: 'Profil Sekolah - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        teachersCount,
        staffCount
      });
    } catch (err) {
      console.error('Error in profile page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 3. Akademik
  async academics(req, res) {
    try {
      const curriculumDocs = await db.prepare("SELECT * FROM downloads WHERE category = 'Kurikulum' OR category = 'Kalender Pendidikan' ORDER BY id DESC").all();
      
      res.render('pages/akademik', {
        title: 'Akademik & Kurikulum - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        curriculumDocs
      });
    } catch (err) {
      console.error('Error in academics page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 4. Guru & Tenaga Kependidikan
  async teachers(req, res) {
    try {
      const roleFilter = req.query.role || 'all';
      let sql = 'SELECT * FROM teachers WHERE is_active = 1 ';
      const params = [];

      if (roleFilter === 'guru') {
        sql += "AND role_type = 'guru' ";
      } else if (roleFilter === 'staff') {
        sql += "AND role_type = 'staff' ";
      }

      sql += 'ORDER BY order_index ASC, name ASC';
      const teachers = await db.prepare(sql).all(...params);

      res.render('pages/guru', {
        title: 'Guru & Tenaga Kependidikan - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        teachers,
        activeRole: roleFilter
      });
    } catch (err) {
      console.error('Error in teachers page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 5. Kesiswaan (Ekstrakurikuler, OSIS, Prestasi)
  async studentAffairs(req, res) {
    try {
      const extracurriculars = await db.prepare('SELECT * FROM extracurriculars ORDER BY id ASC').all();
      const achievements = await db.prepare('SELECT * FROM achievements ORDER BY year DESC, id DESC').all();

      res.render('pages/kesiswaan', {
        title: 'Kesiswaan & Prestasi - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        extracurriculars,
        achievements
      });
    } catch (err) {
      console.error('Error in student affairs page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 6. Berita & Pengumuman (Daftar, Filter, Pencarian, Pagination)
  async newsList(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 6;
      const offset = (page - 1) * limit;
      const categorySlug = req.query.kategori || '';
      const searchQuery = req.query.q ? req.query.q.trim() : '';

      let countSql = `
        SELECT COUNT(*) as total
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status = 'published'
      `;
      let querySql = `
        SELECT p.*, c.name as category_name, c.slug as category_slug, u.name as author_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.status = 'published'
      `;
      const params = [];

      if (categorySlug) {
        countSql += ' AND c.slug = ?';
        querySql += ' AND c.slug = ?';
        params.push(categorySlug);
      }

      if (searchQuery) {
        countSql += ' AND (p.title LIKE ? OR p.content LIKE ?)';
        querySql += ' AND (p.title LIKE ? OR p.content LIKE ?)';
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
      }

      const totalResult = await db.prepare(countSql).get(...params);
      const totalPosts = totalResult ? totalResult.total : 0;
      const totalPages = Math.ceil(totalPosts / limit) || 1;

      querySql += ' ORDER BY p.published_at DESC LIMIT ? OFFSET ?';
      const posts = await db.prepare(querySql).all(...params, limit, offset);

      // Kategori untuk navigasi filter
      const categories = await db.prepare(`
        SELECT c.*, COUNT(p.id) as post_count
        FROM categories c
        LEFT JOIN posts p ON c.id = p.category_id AND p.status = 'published'
        WHERE c.type = 'post'
        GROUP BY c.id
      `).all();

      const popularPosts = await db.prepare(`
        SELECT title, slug, thumbnail, published_at, views
        FROM posts
        WHERE status = 'published'
        ORDER BY views DESC, published_at DESC
        LIMIT 4
      `).all();

      res.render('pages/berita', {
        title: 'Berita & Pengumuman - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        posts,
        categories,
        popularPosts,
        currentPage: page,
        totalPages,
        totalPosts,
        activeCategory: categorySlug,
        searchQuery
      });
    } catch (err) {
      console.error('Error in news list:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 6b. Berita Detail
  async newsDetail(req, res) {
    try {
      const slug = req.params.slug;
      const post = await db.prepare(`
        SELECT p.*, c.name as category_name, c.slug as category_slug, u.name as author_name, u.avatar as author_avatar
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.slug = ? AND p.status = 'published'
      `).get(slug);

      if (!post) {
        return res.status(404).render('pages/error', {
          title: 'Berita Tidak Ditemukan',
          status: 404,
          message: 'Halaman berita yang Anda cari tidak tersedia atau telah dipindahkan.'
        });
      }

      // Tambahkan hitungan view counter
      await db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);

      // Berita terkait dalam kategori yang sama
      const relatedPosts = await db.prepare(`
        SELECT title, slug, thumbnail, published_at
        FROM posts
        WHERE category_id = ? AND id != ? AND status = 'published'
        ORDER BY published_at DESC
        LIMIT 3
      `).all(post.category_id, post.id);

      // Kategori sidebar
      const categories = await db.prepare(`
        SELECT c.*, COUNT(p.id) as post_count
        FROM categories c
        LEFT JOIN posts p ON c.id = p.category_id AND p.status = 'published'
        WHERE c.type = 'post'
        GROUP BY c.id
      `).all();

      res.render('pages/berita-detail', {
        title: post.title + ' - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        post,
        relatedPosts,
        categories
      });
    } catch (err) {
      console.error('Error in news detail:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 7. Galeri Foto & Video
  async gallery(req, res) {
    try {
      const activeAlbum = req.query.album || 'all';
      let sql = 'SELECT * FROM galleries ';
      const params = [];

      if (activeAlbum !== 'all') {
        sql += 'WHERE album = ? ';
        params.push(activeAlbum);
      }

      sql += 'ORDER BY id DESC';
      const items = await db.prepare(sql).all(...params);

      // Daftar album unik
      const albums = (await db.prepare('SELECT DISTINCT album FROM galleries WHERE album IS NOT NULL').all()).map(a => a.album);

      res.render('pages/galeri', {
        title: 'Galeri Foto & Dokumentasi - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        items,
        albums,
        activeAlbum
      });
    } catch (err) {
      console.error('Error in gallery page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 8. PPDB (Penerimaan Peserta Didik Baru)
  async ppdb(req, res) {
    try {
      const ppdb = await db.prepare('SELECT * FROM ppdb_info ORDER BY id DESC LIMIT 1').get();
      const ppdbNews = await db.prepare(`
        SELECT title, slug, published_at
        FROM posts
        WHERE category_id = 2 OR title LIKE '%PPDB%'
        ORDER BY published_at DESC
        LIMIT 4
      `).all();

      res.render('pages/ppdb', {
        title: 'PPDB Resmi - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        ppdb,
        ppdbNews
      });
    } catch (err) {
      console.error('Error in ppdb page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 9. Dokumen Unduhan
  async downloads(req, res) {
    try {
      const activeCat = req.query.kategori || 'all';
      let sql = 'SELECT * FROM downloads ';
      const params = [];

      if (activeCat !== 'all') {
        sql += 'WHERE category = ? ';
        params.push(activeCat);
      }

      sql += 'ORDER BY id DESC';
      const downloads = await db.prepare(sql).all(...params);

      const categories = (await db.prepare('SELECT DISTINCT category FROM downloads').all()).map(c => c.category);

      res.render('pages/unduhan', {
        title: 'Pusat Unduhan Dokumen - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar'),
        downloads,
        categories,
        activeCat
      });
    } catch (err) {
      console.error('Error in downloads page:', err);
      res.status(500).render('pages/error', { title: 'Error', status: 500, message: 'Terjadi gangguan pada server. Silakan coba beberapa saat lagi.' });
    }
  },

  // 9b. Download Counter Trigger
  async downloadFile(req, res) {
    try {
      const id = req.params.id;
      const doc = await db.prepare('SELECT * FROM downloads WHERE id = ?').get(id);

      if (!doc) {
        return res.status(404).send('File tidak ditemukan.');
      }

      await db.prepare('UPDATE downloads SET download_count = download_count + 1 WHERE id = ?').run(id);

      // Hanya izinkan redirect ke folder unggahan internal (mencegah open redirect)
      if (typeof doc.file_path !== 'string' || !doc.file_path.startsWith('/uploads/')) {
        return res.status(404).send('File tidak tersedia.');
      }

      res.redirect(doc.file_path);
    } catch (err) {
      console.error('Error downloading file:', err);
      res.status(500).send('Gagal mengunduh file.');
    }
  },

  // 10. Kontak
  async contact(req, res) {
    res.render('pages/kontak', {
      title: 'Hubungi Kami - ' + (res.locals.school.school_name || 'SMA Negeri 12 Denpasar')
    });
  },

  // 10b. Kirim Pesan / Formulir Kontak (Dilengkapi Proteksi Anti-Spam & Anti-Judol)
  async sendMessage(req, res) {
    const { name, email, phone, subject, message, website_url_hp } = req.body;

    // 1. Honeypot check (bot biasanya otomatis mengisi field tersembunyi ini)
    if (website_url_hp && website_url_hp.trim().length > 0) {
      console.warn(`[ANTI-SPAM] Bot honeypot triggered from IP: ${req.ip}`);
      return res.redirect('/kontak?success=' + encodeURIComponent('Pesan berhasil terkirim.'));
    }

    if (!name || !email || !subject || !message) {
      return res.redirect('/kontak?error=' + encodeURIComponent('Mohon lengkapi semua kolom bertanda bintang (*) pada formulir.'));
    }

    // 2. Anti-Judol & Spam Keyword Blacklist Filter
    const spamKeywords = [
      'slot', 'gacor', 'maxwin', 'judol', 'judi', 'casino', 'poker', 'togel',
      'pragmatic', 'sbobet', 'deposit pulsa', 'freebet', 'zeus', 'olympus',
      'mahjong ways', 'hoki slot', 'agen slot', 'bandar judi', 'rtp slot'
    ];
    const combinedContent = `${name} ${subject} ${message}`.toLowerCase();
    const hasSpam = spamKeywords.some(keyword => combinedContent.includes(keyword));

    if (hasSpam) {
      console.warn(`[ANTI-JUDOL] Blocked spam/judol message attempt from IP: ${req.ip}`);
      return res.redirect('/kontak?error=' + encodeURIComponent('Pesan Anda terindikasi spam / promosi terlarang dan ditolak oleh sistem keamanan sekolah.'));
    }

    try {
      await db.prepare(`
        INSERT INTO messages (name, email, phone, subject, message)
        VALUES (?, ?, ?, ?, ?)
      `).run(name.trim(), email.trim(), phone ? phone.trim() : null, subject.trim(), message.trim());

      res.redirect('/kontak?success=' + encodeURIComponent('Terima kasih! Pesan dan aspirasi Anda telah berhasil dikirimkan ke pihak SMA Negeri 12 Denpasar. Tim kami akan segera menindaklanjutinya.'));
    } catch (err) {
      console.error('Error saving message:', err);
      res.redirect('/kontak?error=' + encodeURIComponent('Gagal mengirim pesan. Silakan coba kembali nanti.'));
    }
  },

  // 11. SEO: sitemap.xml
  async sitemap(req, res) {
    try {
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const posts = await db.prepare("SELECT slug, published_at FROM posts WHERE status = 'published'").all();

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      const staticPages = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
        { loc: '/profil', changefreq: 'weekly', priority: '0.8' },
        { loc: '/akademik', changefreq: 'weekly', priority: '0.8' },
        { loc: '/guru', changefreq: 'weekly', priority: '0.7' },
        { loc: '/kesiswaan', changefreq: 'weekly', priority: '0.7' },
        { loc: '/berita', changefreq: 'daily', priority: '0.9' },
        { loc: '/galeri', changefreq: 'weekly', priority: '0.6' },
        { loc: '/ppdb', changefreq: 'daily', priority: '0.9' },
        { loc: '/unduhan', changefreq: 'weekly', priority: '0.6' },
        { loc: '/kontak', changefreq: 'monthly', priority: '0.5' },
      ];

      for (const page of staticPages) {
        xml += `  <url>\n    <loc>${baseUrl}${page.loc}</loc>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
      }

      for (const post of posts) {
        const lastmod = post.published_at ? post.published_at.split(' ')[0] : new Date().toISOString().split('T')[0];
        xml += `  <url>\n    <loc>${baseUrl}/berita/${post.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }

      xml += '</urlset>';

      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (err) {
      console.error('Error generating sitemap:', err);
      res.status(500).send('Error generating sitemap');
    }
  }
};

module.exports = publicController;
