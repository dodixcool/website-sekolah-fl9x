const db = require('../config/database');
const slugify = require('slugify');
const bcrypt = require('bcryptjs');
const path = require('path');
const { invalidateSettingsCache } = require('../middleware/locals');
const { sanitizeRichText, sanitizePlainText, sanitizeUrl, sanitizeMapsEmbedUrl } = require('../utils/sanitize');
const { validatePassword } = require('../utils/password');
const { deleteUpload, isBlobUrl } = require('../utils/storage');

// File unggahan disimpan/dihapus lewat src/utils/storage.js (lokal atau Vercel Blob)

const adminController = {
  // 1. Dashboard
  async dashboard(req, res) {
    try {
      const postCount = (await db.prepare('SELECT COUNT(*) as count FROM posts').get()).count;
      const teacherCount = (await db.prepare('SELECT COUNT(*) as count FROM teachers').get()).count;
      const achievementCount = (await db.prepare('SELECT COUNT(*) as count FROM achievements').get()).count;
      const downloadCount = (await db.prepare('SELECT COUNT(*) as count FROM downloads').get()).count;
      const galleryCount = (await db.prepare('SELECT COUNT(*) as count FROM galleries').get()).count;
      const unreadMessagesCount = (await db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_read = 0').get()).count;

      const recentPosts = await db.prepare(`
        SELECT p.*, c.name as category_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.created_at DESC
        LIMIT 5
      `).all();

      const recentMessages = await db.prepare(`
        SELECT * FROM messages
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      const upcomingEvents = await db.prepare(`
        SELECT * FROM events
        ORDER BY start_date ASC
        LIMIT 4
      `).all();

      res.render('admin/dashboard', {
        title: 'Dashboard Admin - SMA Negeri 12 Denpasar',
        layout: 'layouts/admin',
        stats: {
          posts: postCount,
          teachers: teacherCount,
          achievements: achievementCount,
          downloads: downloadCount,
          galleries: galleryCount,
          unreadMessages: unreadMessagesCount
        },
        recentPosts,
        recentMessages,
        upcomingEvents
      });
    } catch (err) {
      console.error('Error in admin dashboard:', err);
      res.status(500).send('Error loading dashboard');
    }
  },

  // ----------------------------------------------------
  // 2. Berita & Pengumuman (Posts)
  // ----------------------------------------------------
  async listPosts(req, res) {
    try {
      const posts = await db.prepare(`
        SELECT p.*, c.name as category_name, u.name as author_name
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.author_id = u.id
        ORDER BY p.published_at DESC
      `).all();

      res.render('admin/posts/index', {
        title: 'Kelola Berita & Pengumuman',
        layout: 'layouts/admin',
        posts
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat daftar berita');
    }
  },

  async showCreatePost(req, res) {
    const categories = await db.prepare("SELECT * FROM categories WHERE type = 'post'").all();
    res.render('admin/posts/create', {
      title: 'Tulis Berita / Pengumuman Baru',
      layout: 'layouts/admin',
      categories,
      post: null
    });
  },

  async createPost(req, res) {
    try {
      const { title, category_id, excerpt, content, status, is_featured } = req.body;
      const safeTitle = sanitizePlainText(title).trim();
      const baseSlug = slugify(safeTitle, { lower: true, strict: true });
      const uniqueSuffix = Date.now().toString().slice(-4);
      const slug = `${baseSlug}-${uniqueSuffix}`;
      
      let thumbnail = '/images/default-news.jpg';
      if (req.file) {
        thumbnail = req.file.publicUrl;
      }

      await db.prepare(`
        INSERT INTO posts (title, slug, category_id, excerpt, content, thumbnail, status, is_featured, author_id, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        safeTitle,
        slug,
        category_id ? parseInt(category_id) : null,
        excerpt ? sanitizePlainText(excerpt).trim() : null,
        sanitizeRichText(content),
        thumbnail,
        status || 'published',
        is_featured ? 1 : 0,
        req.session.user.id
      );

      res.redirect('/admin/posts?success=' + encodeURIComponent('Berita baru berhasil diterbitkan!'));
    } catch (err) {
      console.error('Error create post:', err);
      res.redirect('/admin/posts/create?error=' + encodeURIComponent('Gagal menyimpan berita: ' + err.message));
    }
  },

  async showEditPost(req, res) {
    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.redirect('/admin/posts?error=Berita tidak ditemukan');
    const categories = await db.prepare("SELECT * FROM categories WHERE type = 'post'").all();

    res.render('admin/posts/edit', {
      title: 'Edit Berita: ' + post.title,
      layout: 'layouts/admin',
      post,
      categories
    });
  },

  async updatePost(req, res) {
    try {
      const id = req.params.id;
      const current = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
      if (!current) return res.redirect('/admin/posts?error=Berita tidak ditemukan');

      const { title, category_id, excerpt, content, status, is_featured } = req.body;
      let thumbnail = current.thumbnail;

      if (req.file) {
        thumbnail = req.file.publicUrl;
        await deleteUpload(current.thumbnail);
      }

      await db.prepare(`
        UPDATE posts
        SET title = ?, category_id = ?, excerpt = ?, content = ?, thumbnail = ?, status = ?, is_featured = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        sanitizePlainText(title).trim(),
        category_id ? parseInt(category_id) : null,
        excerpt ? sanitizePlainText(excerpt).trim() : null,
        sanitizeRichText(content),
        thumbnail,
        status || 'published',
        is_featured ? 1 : 0,
        id
      );

      res.redirect('/admin/posts?success=' + encodeURIComponent('Berita berhasil diperbarui!'));
    } catch (err) {
      console.error('Error update post:', err);
      res.redirect('/admin/posts?error=' + encodeURIComponent('Gagal memperbarui berita: ' + err.message));
    }
  },

  async deletePost(req, res) {
    try {
      const id = req.params.id;
      const post = await db.prepare('SELECT thumbnail FROM posts WHERE id = ?').get(id);
      if (post) {
        await deleteUpload(post.thumbnail);
        await db.prepare('DELETE FROM posts WHERE id = ?').run(id);
      }
      res.redirect('/admin/posts?success=' + encodeURIComponent('Berita berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/posts?error=' + encodeURIComponent('Gagal menghapus berita: ' + err.message));
    }
  },

  // ----------------------------------------------------
  // 3. Agenda Sekolah (Events)
  // ----------------------------------------------------
  async listEvents(req, res) {
    const events = await db.prepare('SELECT * FROM events ORDER BY start_date DESC').all();
    res.render('admin/events/index', {
      title: 'Kelola Agenda Kegiatan',
      layout: 'layouts/admin',
      events
    });
  },

  async showCreateEvent(req, res) {
    res.render('admin/events/create', {
      title: 'Tambah Agenda Baru',
      layout: 'layouts/admin',
      event: null
    });
  },

  async createEvent(req, res) {
    try {
      const { title, description, location, start_date, end_date, time_info, organizer } = req.body;
      const slug = slugify(title, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);

      await db.prepare(`
        INSERT INTO events (title, slug, description, location, start_date, end_date, time_info, organizer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sanitizePlainText(title).trim(), slug, sanitizePlainText(description), sanitizePlainText(location) || 'SMA Negeri 12 Denpasar', start_date, end_date || null, sanitizePlainText(time_info), sanitizePlainText(organizer) || 'Panitia');

      res.redirect('/admin/events?success=' + encodeURIComponent('Agenda baru berhasil ditambahkan!'));
    } catch (err) {
      res.redirect('/admin/events?error=' + encodeURIComponent(err.message));
    }
  },

  async showEditEvent(req, res) {
    const event = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.redirect('/admin/events?error=Agenda tidak ditemukan');
    res.render('admin/events/edit', {
      title: 'Edit Agenda Kegiatan',
      layout: 'layouts/admin',
      event
    });
  },

  async updateEvent(req, res) {
    try {
      const { title, description, location, start_date, end_date, time_info, organizer, is_active } = req.body;
      await db.prepare(`
        UPDATE events
        SET title = ?, description = ?, location = ?, start_date = ?, end_date = ?, time_info = ?, organizer = ?, is_active = ?
        WHERE id = ?
      `).run(sanitizePlainText(title).trim(), sanitizePlainText(description), sanitizePlainText(location), start_date, end_date || null, sanitizePlainText(time_info), sanitizePlainText(organizer), is_active ? 1 : 0, req.params.id);

      res.redirect('/admin/events?success=' + encodeURIComponent('Agenda kegiatan berhasil diperbarui!'));
    } catch (err) {
      res.redirect('/admin/events?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteEvent(req, res) {
    try {
      await db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
      res.redirect('/admin/events?success=' + encodeURIComponent('Agenda berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/events?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 4. Guru & Tenaga Kependidikan
  // ----------------------------------------------------
  async listTeachers(req, res) {
    const teachers = await db.prepare('SELECT * FROM teachers ORDER BY order_index ASC, name ASC').all();
    res.render('admin/teachers/index', {
      title: 'Kelola Guru & Karyawan',
      layout: 'layouts/admin',
      teachers
    });
  },

  async showCreateTeacher(req, res) {
    res.render('admin/teachers/create', {
      title: 'Tambah Guru / Staf Baru',
      layout: 'layouts/admin',
      teacher: null
    });
  },

  async createTeacher(req, res) {
    try {
      const { name, nip, role_type, subject, position, education, email, order_index } = req.body;
      let photo = '/images/default-teacher.png';
      if (req.file) {
        photo = req.file.publicUrl;
      }

      await db.prepare(`
        INSERT INTO teachers (name, nip, role_type, subject, position, education, photo, email, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name.trim(), nip ? nip.trim() : null, role_type, subject, position, education, photo, email, parseInt(order_index) || 0);

      res.redirect('/admin/teachers?success=' + encodeURIComponent('Data guru/staf berhasil ditambahkan!'));
    } catch (err) {
      res.redirect('/admin/teachers?error=' + encodeURIComponent(err.message));
    }
  },

  async showEditTeacher(req, res) {
    const teacher = await db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
    if (!teacher) return res.redirect('/admin/teachers?error=Data tidak ditemukan');
    res.render('admin/teachers/edit', {
      title: 'Edit Guru: ' + teacher.name,
      layout: 'layouts/admin',
      teacher
    });
  },

  async updateTeacher(req, res) {
    try {
      const id = req.params.id;
      const current = await db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
      if (!current) return res.redirect('/admin/teachers?error=Data tidak ditemukan');

      const { name, nip, role_type, subject, position, education, email, order_index, is_active } = req.body;
      let photo = current.photo;

      if (req.file) {
        photo = req.file.publicUrl;
        await deleteUpload(current.photo);
      }

      await db.prepare(`
        UPDATE teachers
        SET name = ?, nip = ?, role_type = ?, subject = ?, position = ?, education = ?, photo = ?, email = ?, order_index = ?, is_active = ?
        WHERE id = ?
      `).run(name.trim(), nip ? nip.trim() : null, role_type, subject, position, education, photo, email, parseInt(order_index) || 0, is_active ? 1 : 0, id);

      res.redirect('/admin/teachers?success=' + encodeURIComponent('Data guru/staf berhasil diperbarui!'));
    } catch (err) {
      res.redirect('/admin/teachers?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteTeacher(req, res) {
    try {
      const id = req.params.id;
      const t = await db.prepare('SELECT photo FROM teachers WHERE id = ?').get(id);
      if (t) {
        await deleteUpload(t.photo);
        await db.prepare('DELETE FROM teachers WHERE id = ?').run(id);
      }
      res.redirect('/admin/teachers?success=' + encodeURIComponent('Data guru/staf berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/teachers?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 5. Prestasi Siswa (Achievements)
  // ----------------------------------------------------
  async listAchievements(req, res) {
    const achievements = await db.prepare('SELECT * FROM achievements ORDER BY year DESC, id DESC').all();
    res.render('admin/achievements/index', {
      title: 'Kelola Prestasi Siswa & Sekolah',
      layout: 'layouts/admin',
      achievements
    });
  },

  async showCreateAchievement(req, res) {
    res.render('admin/achievements/create', {
      title: 'Tambah Prestasi Baru',
      layout: 'layouts/admin',
      achievement: null
    });
  },

  async createAchievement(req, res) {
    try {
      const { title, student_name, rank, level, category, year, organizer, description } = req.body;
      let photo = null;
      if (req.file) {
        photo = req.file.publicUrl;
      }

      await db.prepare(`
        INSERT INTO achievements (title, student_name, rank, level, category, year, organizer, photo, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(title.trim(), student_name.trim(), rank, level, category, parseInt(year) || new Date().getFullYear(), organizer, photo, description);

      res.redirect('/admin/achievements?success=' + encodeURIComponent('Prestasi baru berhasil dicatat!'));
    } catch (err) {
      res.redirect('/admin/achievements?error=' + encodeURIComponent(err.message));
    }
  },

  async showEditAchievement(req, res) {
    const achievement = await db.prepare('SELECT * FROM achievements WHERE id = ?').get(req.params.id);
    if (!achievement) return res.redirect('/admin/achievements?error=Prestasi tidak ditemukan');
    res.render('admin/achievements/edit', {
      title: 'Edit Prestasi',
      layout: 'layouts/admin',
      achievement
    });
  },

  async updateAchievement(req, res) {
    try {
      const id = req.params.id;
      const current = await db.prepare('SELECT * FROM achievements WHERE id = ?').get(id);
      if (!current) return res.redirect('/admin/achievements?error=Data tidak ditemukan');

      const { title, student_name, rank, level, category, year, organizer, description } = req.body;
      let photo = current.photo;

      if (req.file) {
        photo = req.file.publicUrl;
        await deleteUpload(current.photo);
      }

      await db.prepare(`
        UPDATE achievements
        SET title = ?, student_name = ?, rank = ?, level = ?, category = ?, year = ?, organizer = ?, photo = ?, description = ?
        WHERE id = ?
      `).run(title.trim(), student_name.trim(), rank, level, category, parseInt(year), organizer, photo, description, id);

      res.redirect('/admin/achievements?success=' + encodeURIComponent('Prestasi berhasil diperbarui!'));
    } catch (err) {
      res.redirect('/admin/achievements?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteAchievement(req, res) {
    try {
      const id = req.params.id;
      const a = await db.prepare('SELECT photo FROM achievements WHERE id = ?').get(id);
      if (a) {
        await deleteUpload(a.photo);
        await db.prepare('DELETE FROM achievements WHERE id = ?').run(id);
      }
      res.redirect('/admin/achievements?success=' + encodeURIComponent('Prestasi berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/achievements?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 6. Ekstrakurikuler (Extracurriculars)
  // ----------------------------------------------------
  async listExtracurriculars(req, res) {
    const extracurriculars = await db.prepare('SELECT * FROM extracurriculars ORDER BY id ASC').all();
    res.render('admin/extracurriculars/index', {
      title: 'Kelola Ekstrakurikuler',
      layout: 'layouts/admin',
      extracurriculars
    });
  },

  async showCreateExtra(req, res) {
    res.render('admin/extracurriculars/create', {
      title: 'Tambah Ekstrakurikuler Baru',
      layout: 'layouts/admin',
      extra: null
    });
  },

  async createExtra(req, res) {
    try {
      const { name, category, mentor, schedule, location, description } = req.body;
      const slug = slugify(name, { lower: true, strict: true });
      let photo = null;
      if (req.file) {
        photo = req.file.publicUrl;
      }

      await db.prepare(`
        INSERT INTO extracurriculars (name, slug, category, mentor, schedule, location, description, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name.trim(), slug, category, mentor, schedule, location, description, photo);

      res.redirect('/admin/extracurriculars?success=' + encodeURIComponent('Ekstrakurikuler berhasil ditambahkan!'));
    } catch (err) {
      res.redirect('/admin/extracurriculars?error=' + encodeURIComponent(err.message));
    }
  },

  async showEditExtra(req, res) {
    const extra = await db.prepare('SELECT * FROM extracurriculars WHERE id = ?').get(req.params.id);
    if (!extra) return res.redirect('/admin/extracurriculars?error=Data tidak ditemukan');
    res.render('admin/extracurriculars/edit', {
      title: 'Edit Ekstrakurikuler: ' + extra.name,
      layout: 'layouts/admin',
      extra
    });
  },

  async updateExtra(req, res) {
    try {
      const id = req.params.id;
      const current = await db.prepare('SELECT * FROM extracurriculars WHERE id = ?').get(id);
      const { name, category, mentor, schedule, location, description } = req.body;
      let photo = current.photo;

      if (req.file) {
        photo = req.file.publicUrl;
        await deleteUpload(current.photo);
      }

      await db.prepare(`
        UPDATE extracurriculars
        SET name = ?, category = ?, mentor = ?, schedule = ?, location = ?, description = ?, photo = ?
        WHERE id = ?
      `).run(name.trim(), category, mentor, schedule, location, description, photo, id);

      res.redirect('/admin/extracurriculars?success=' + encodeURIComponent('Ekstrakurikuler berhasil diperbarui!'));
    } catch (err) {
      res.redirect('/admin/extracurriculars?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteExtra(req, res) {
    try {
      const id = req.params.id;
      const e = await db.prepare('SELECT photo FROM extracurriculars WHERE id = ?').get(id);
      if (e) {
        await deleteUpload(e.photo);
        await db.prepare('DELETE FROM extracurriculars WHERE id = ?').run(id);
      }
      res.redirect('/admin/extracurriculars?success=' + encodeURIComponent('Ekstrakurikuler berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/extracurriculars?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 7. Galeri Foto & Video
  // ----------------------------------------------------
  async listGallery(req, res) {
    const items = await db.prepare('SELECT * FROM galleries ORDER BY id DESC').all();
    res.render('admin/gallery/index', {
      title: 'Kelola Galeri Media',
      layout: 'layouts/admin',
      items
    });
  },

  async createGallery(req, res) {
    try {
      const { title, album, type, external_url, caption } = req.body;
      let media_url = external_url ? sanitizeUrl(external_url, '') : '';

      if (req.file) {
        media_url = req.file.publicUrl;
      }

      if (!media_url) {
        return res.redirect('/admin/gallery?error=' + encodeURIComponent('Unggah foto atau masukkan tautan media yang valid (http/https).'));
      }

      await db.prepare(`
        INSERT INTO galleries (title, album, type, media_url, caption)
        VALUES (?, ?, ?, ?, ?)
      `).run(sanitizePlainText(title).trim(), sanitizePlainText(album) || 'Kegiatan Sekolah', type || 'photo', media_url, sanitizePlainText(caption));

      res.redirect('/admin/gallery?success=' + encodeURIComponent('Media berhasil ditambahkan ke galeri!'));
    } catch (err) {
      res.redirect('/admin/gallery?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteGallery(req, res) {
    try {
      const id = req.params.id;
      const g = await db.prepare('SELECT media_url FROM galleries WHERE id = ?').get(id);
      if (g) {
        await deleteUpload(g.media_url);
        await db.prepare('DELETE FROM galleries WHERE id = ?').run(id);
      }
      res.redirect('/admin/gallery?success=' + encodeURIComponent('Media galeri berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/gallery?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 8. Dokumen Unduhan (Downloads)
  // ----------------------------------------------------
  async listDownloads(req, res) {
    const downloads = await db.prepare('SELECT * FROM downloads ORDER BY id DESC').all();
    res.render('admin/downloads/index', {
      title: 'Kelola Dokumen Unduhan',
      layout: 'layouts/admin',
      downloads
    });
  },

  async createDownload(req, res) {
    try {
      const { title, category } = req.body;
      if (!req.file) {
        return res.redirect('/admin/downloads?error=File dokumen wajib diunggah.');
      }

      const file_name = req.file.originalname;
      const file_path = req.file.publicUrl;
      const ext = path.extname(file_name).replace('.', '').toUpperCase();
      const file_size = (req.file.size / (1024 * 1024)).toFixed(1) + ' MB';

      await db.prepare(`
        INSERT INTO downloads (title, category, file_name, file_path, file_size, file_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(title.trim(), category || 'Dokumen', file_name, file_path, file_size, ext);

      res.redirect('/admin/downloads?success=' + encodeURIComponent('Dokumen unduhan berhasil diunggah!'));
    } catch (err) {
      res.redirect('/admin/downloads?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteDownload(req, res) {
    try {
      const id = req.params.id;
      const d = await db.prepare('SELECT file_path FROM downloads WHERE id = ?').get(id);
      if (d) {
        await deleteUpload(d.file_path);
        await db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
      }
      res.redirect('/admin/downloads?success=' + encodeURIComponent('Dokumen berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/downloads?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 9. Pesan Masuk / Buku Tamu (Messages)
  // ----------------------------------------------------
  async listMessages(req, res) {
    const messages = await db.prepare('SELECT * FROM messages ORDER BY is_read ASC, created_at DESC').all();
    res.render('admin/messages/index', {
      title: 'Pesan & Aspirasi Masuk',
      layout: 'layouts/admin',
      messages
    });
  },

  async viewMessage(req, res) {
    const message = await db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
    if (!message) return res.redirect('/admin/messages?error=Pesan tidak ditemukan');

    // Tandai sudah dibaca
    if (message.is_read === 0) {
      await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(message.id);
    }

    res.render('admin/messages/view', {
      title: 'Detail Pesan Masuk',
      layout: 'layouts/admin',
      message
    });
  },

  async deleteMessage(req, res) {
    try {
      await db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
      res.redirect('/admin/messages?success=' + encodeURIComponent('Pesan berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/messages?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 10. Slider Hero Beranda (Sliders)
  // ----------------------------------------------------
  async listSliders(req, res) {
    const sliders = await db.prepare('SELECT * FROM sliders ORDER BY order_index ASC').all();
    res.render('admin/sliders/index', {
      title: 'Kelola Slider Beranda',
      layout: 'layouts/admin',
      sliders
    });
  },

  async createSlider(req, res) {
    try {
      const { title, subtitle, button_text, button_url, order_index, is_active, external_url } = req.body;
      let image_url = external_url ? sanitizeUrl(external_url, '') : '';

      if (req.file) {
        image_url = req.file.publicUrl;
      }

      if (!image_url) {
        return res.redirect('/admin/sliders?error=' + encodeURIComponent('Silakan unggah gambar slider atau masukkan URL gambar yang valid.'));
      }

      await db.prepare(`
        INSERT INTO sliders (title, subtitle, image_url, button_text, button_url, order_index, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        sanitizePlainText(title).trim(),
        sanitizePlainText(subtitle),
        image_url,
        sanitizePlainText(button_text) || 'Pelajari Selengkapnya',
        sanitizeUrl(button_url, '#'),
        parseInt(order_index) || 0,
        is_active ? 1 : 0
      );

      res.redirect('/admin/sliders?success=' + encodeURIComponent('Slider baru berhasil ditambahkan!'));
    } catch (err) {
      res.redirect('/admin/sliders?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteSlider(req, res) {
    try {
      const id = req.params.id;
      const s = await db.prepare('SELECT image_url FROM sliders WHERE id = ?').get(id);
      if (s) {
        await deleteUpload(s.image_url);
        await db.prepare('DELETE FROM sliders WHERE id = ?').run(id);
      }
      res.redirect('/admin/sliders?success=' + encodeURIComponent('Slider berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/sliders?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 11. Pengaturan Identitas Sekolah (Settings)
  // ----------------------------------------------------
  async showSettings(req, res) {
    const rows = await db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    const ppdb = await db.prepare('SELECT * FROM ppdb_info ORDER BY id DESC LIMIT 1').get() || {};

    res.render('admin/settings/index', {
      title: 'Pengaturan Identitas & Profil Sekolah',
      layout: 'layouts/admin',
      settings,
      ppdb
    });
  },

  async updateSettings(req, res) {
    try {
      const fields = [
        'school_name', 'school_alias', 'school_npsn', 'school_tagline',
        'address', 'phone', 'email', 'whatsapp', 'maps_embed',
        'facebook', 'instagram', 'youtube', 'tiktok',
        'principal_name', 'principal_nip', 'principal_speech',
        'history', 'vision', 'mission', 'accreditation',
        'stats_students', 'stats_teachers', 'stats_staff', 'stats_achievements',
        'curriculum_name'
      ];

      const upsert = await db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);

      // Field yang boleh memuat HTML (visi/misi, sambutan, sejarah) disanitasi dengan allowlist.
      // Sisanya diperlakukan sebagai teks biasa agar tidak bisa dipakai menyisipkan skrip/iframe.
      const RICH_TEXT_FIELDS = new Set([
        'history', 'principal_speech', 'vision', 'mission',
        'ppdb_description', 'ppdb_requirements', 'ppdb_flow_steps'
      ]);
      const URL_FIELDS = new Set(['facebook', 'instagram', 'youtube', 'tiktok']);

      for (const key of fields) {
        if (req.body[key] !== undefined) {
          let value;
          if (key === 'maps_embed') {
            value = sanitizeMapsEmbedUrl(req.body[key]);
          } else if (URL_FIELDS.has(key)) {
            value = req.body[key].trim() ? sanitizeUrl(req.body[key], '') : '';
          } else if (RICH_TEXT_FIELDS.has(key)) {
            value = sanitizeRichText(req.body[key]);
          } else {
            value = sanitizePlainText(req.body[key]);
          }
          await upsert.run(key, value);
        }
      }

      // Handle uploads jika ada (logo atau foto kepsek)
      if (req.files) {
        if (req.files.logo && req.files.logo[0]) {
          const oldLogo = await db.prepare("SELECT value FROM settings WHERE key = 'logo_url'").get();
          if (oldLogo && oldLogo.value && (oldLogo.value.startsWith('/uploads/settings/') || isBlobUrl(oldLogo.value))) {
            await deleteUpload(oldLogo.value);
          }
          await upsert.run('logo_url', req.files.logo[0].publicUrl);
        }
        if (req.files.principal_photo && req.files.principal_photo[0]) {
          const oldPhoto = await db.prepare("SELECT value FROM settings WHERE key = 'principal_photo'").get();
          if (oldPhoto && oldPhoto.value && (oldPhoto.value.startsWith('/uploads/settings/') || isBlobUrl(oldPhoto.value))) {
            await deleteUpload(oldPhoto.value);
          }
          await upsert.run('principal_photo', req.files.principal_photo[0].publicUrl);
        }
      }

      // Update PPDB info jika disertakan
      if (req.body.ppdb_academic_year) {
        await db.prepare(`
          UPDATE ppdb_info
          SET academic_year = ?, status = ?, title = ?, description = ?, registration_url = ?, requirements = ?, flow_steps = ?, contact_person = ?, updated_at = datetime('now')
          WHERE id = (SELECT id FROM ppdb_info ORDER BY id DESC LIMIT 1)
        `).run(
          sanitizePlainText(req.body.ppdb_academic_year),
          sanitizePlainText(req.body.ppdb_status) || 'Segera',
          sanitizePlainText(req.body.ppdb_title) || 'PPDB SMA Negeri 12 Denpasar',
          sanitizeRichText(req.body.ppdb_description),
          sanitizeUrl(req.body.ppdb_registration_url, 'https://smabali.siap-ppdb.com'),
          sanitizeRichText(req.body.ppdb_requirements),
          sanitizeRichText(req.body.ppdb_flow_steps),
          sanitizePlainText(req.body.ppdb_contact_person)
        );
      }

      invalidateSettingsCache();
      res.redirect('/admin/settings?success=' + encodeURIComponent('Pengaturan identitas sekolah berhasil diperbarui!'));
    } catch (err) {
      console.error('Error updating settings:', err);
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  },

  // ----------------------------------------------------
  // 12. Manajemen Pengguna (Users) - Super Admin
  // ----------------------------------------------------
  async listUsers(req, res) {
    const users = await db.prepare('SELECT id, name, username, email, role, avatar, created_at FROM users ORDER BY id ASC').all();
    res.render('admin/users/index', {
      title: 'Manajemen Pengguna Admin',
      layout: 'layouts/admin',
      users
    });
  },

  async createUser(req, res) {
    try {
      const { name, username, email, password, role } = req.body;
      if (!name || !username || !email || !password) {
        return res.redirect('/admin/users?error=Semua kolom wajib diisi.');
      }

      const existing = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
      if (existing) {
        return res.redirect('/admin/users?error=Username atau email sudah digunakan pengguna lain.');
      }

      const policyError = validatePassword(password);
      if (policyError) {
        return res.redirect('/admin/users?error=' + encodeURIComponent(policyError));
      }

      const hashedPassword = bcrypt.hashSync(password, 12);

      const validRoles = ['editor', 'superadmin'];
      const safeRole = validRoles.includes(role) ? role : 'editor';

      // Pengguna baru wajib mengganti kata sandi pada login pertama.
      await db.prepare(`
        INSERT INTO users (name, username, email, password, role, must_change_password)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(sanitizePlainText(name).trim(), sanitizePlainText(username).trim(), sanitizePlainText(email).trim(), hashedPassword, safeRole);

      res.redirect('/admin/users?success=' + encodeURIComponent('Pengguna baru berhasil didaftarkan!'));
    } catch (err) {
      res.redirect('/admin/users?error=' + encodeURIComponent(err.message));
    }
  },

  async updateUser(req, res) {
    try {
      const id = req.params.id;
      const { name, email, role, password } = req.body;
      const validRoles = ['editor', 'superadmin'];
      const safeRole = validRoles.includes(role) ? role : 'editor';

      if (password && password.trim().length > 0) {
        const policyError = validatePassword(password.trim());
        if (policyError) {
          return res.redirect('/admin/users?error=' + encodeURIComponent(policyError));
        }

        const hashedPassword = bcrypt.hashSync(password.trim(), 12);
        // Kata sandi yang diatur admin bersifat sementara: pengguna wajib menggantinya saat login.
        await db.prepare(`
          UPDATE users
          SET name = ?, email = ?, role = ?, password = ?, must_change_password = 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(sanitizePlainText(name).trim(), sanitizePlainText(email).trim(), safeRole, hashedPassword, id);
      } else {
        await db.prepare('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?').run(sanitizePlainText(name).trim(), sanitizePlainText(email).trim(), safeRole, id);
      }

      res.redirect('/admin/users?success=' + encodeURIComponent('Data pengguna berhasil diperbarui!'));
    } catch (err) {
      res.redirect('/admin/users?error=' + encodeURIComponent(err.message));
    }
  },

  async deleteUser(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (id === req.session.user.id) {
        return res.redirect('/admin/users?error=Anda tidak dapat menghapus akun Anda sendiri.');
      }
      // Hapus data turunan secara eksplisit (koneksi remote Turso tidak selalu menegakkan ON DELETE CASCADE)
      await db.batch([
        { sql: 'DELETE FROM user_backup_codes WHERE user_id = ?', args: [id] },
        { sql: 'DELETE FROM password_resets WHERE user_id = ?', args: [id] },
        { sql: 'DELETE FROM users WHERE id = ?', args: [id] }
      ]);
      res.redirect('/admin/users?success=' + encodeURIComponent('Pengguna berhasil dihapus.'));
    } catch (err) {
      res.redirect('/admin/users?error=' + encodeURIComponent(err.message));
    }
  }
};

module.exports = adminController;
