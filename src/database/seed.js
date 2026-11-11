const bcrypt = require('bcryptjs');
const db = require('../config/database');
const runMigration = require('./migrate');

async function seedDatabase() {
  console.log('ðŸŒ± Menjalankan Seeder Data SMA Negeri 12 Denpasar...');

  // Jalankan migrasi dulu agar tabel selalu siap
  await runMigration();

  // 1. Seed Pengguna (Super Admin & Editor)
  const salt = bcrypt.genSaltSync(10);
  const adminPassword = bcrypt.hashSync('admin123', salt);
  const editorPassword = bcrypt.hashSync('editor123', salt);

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, name, username, email, password, role, avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  await insertUser.run(
    1,
    'Administrator Utama',
    'admin',
    'admin@sman12denpasar.sch.id',
    adminPassword,
    'superadmin',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'
  );

  await insertUser.run(
    2,
    'Staf Humas & Publikasi',
    'editor',
    'humas@sman12denpasar.sch.id',
    editorPassword,
    'editor',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80'
  );

  console.log('âœ… User admin (admin / admin123) & editor (editor / editor123) berhasil dibuat.');

  // 2. Seed Pengaturan Sekolah
  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  const settingsData = [
    ['school_name', 'SMA Negeri 12 Denpasar', 'Nama Resmi Sekolah'],
    ['school_alias', 'SMANDAS', 'Nama Singkatan Sekolah'],
    ['school_npsn', '69992012', 'Nomor Pokok Sekolah Nasional'],
    ['school_tagline', 'Unggul dalam Prestasi, Luhur Berbudi, Berakar Budaya, Berdaya Saing Global', 'Motto Sekolah'],
    ['address', 'Jl. Trengguli No. 12, Kel. Penatih, Kec. Denpasar Timur, Kota Denpasar, Bali 80238', 'Alamat Lengkap'],
    ['phone', '(0361) 462912', 'Nomor Telepon'],
    ['email', 'info@sman12denpasar.sch.id', 'Email Resmi'],
    ['whatsapp', '081238991212', 'Nomor WhatsApp Informasi'],
    ['maps_embed', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15777.30064560731!2d115.235!3d-8.625!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2dd23f81e36f98ef%3A0x7d06e2e5e4d!2sDenpasar%20Timur%2C%20Kota%20Denpasar%2C%20Bali!5e0!3m2!1sid!2sid!4v1700000000000', 'Embed Google Maps'],
    ['facebook', 'https://facebook.com/sman12denpasar', 'Halaman Facebook'],
    ['instagram', 'https://instagram.com/sman12denpasar', 'Akun Instagram'],
    ['youtube', 'https://youtube.com/@sman12denpasarofficial', 'Kanal YouTube'],
    ['tiktok', 'https://tiktok.com/@sman12denpasar', 'Akun TikTok'],
    ['logo_url', '/images/logo-sekolah.svg', 'Logo Utama Sekolah'],
    ['principal_name', 'I Wayan Suardana, S.Pd., M.Pd.', 'Nama Kepala Sekolah'],
    ['principal_nip', '19690817 199412 1 002', 'NIP Kepala Sekolah'],
    ['principal_photo', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80', 'Foto Kepala Sekolah'],
    ['principal_speech', `<p class="mb-4"><strong>Om Swastyastu, Salam Sejahtera untuk kita semua, Rahayu.</strong></p>
<p class="mb-4">Puji syukur kita panjatkan ke hadapan Ida Sang Hyang Widhi Wasa / Tuhan Yang Maha Esa, atas limpahan rahmat dan karunia-Nya, website resmi SMA Negeri 12 Denpasar ini dapat hadir sebagai jendela informasi, wadah transparansi, dan jembatan komunikasi antara sekolah, peserta didik, orang tua, alumni, dan masyarakat luas.</p>
<p class="mb-4">Di era transformasi digital dan implementasi Kurikulum Merdeka, SMA Negeri 12 Denpasar berkomitmen membekali para siswa tidak hanya dengan kecerdasan intelektual, tetapi juga ketangguhan karakter Profil Pelajar Pancasila yang menjunjung tinggi kearifan lokal Bali berbasis <em>Tri Hita Karana</em>.</p>
<p>Mari bersama-sama kita wujudkan ekosistem pendidikan yang inklusif, kolaboratif, dan inovatif demi menyongsong Generasi Emas Indonesia.</p>
<p class="mt-4"><strong>Om Shanti Shanti Shanti Om.</strong></p>`, 'Sambutan Kepala Sekolah'],
    ['history', `<p class="mb-3">SMA Negeri 12 Denpasar didirikan sebagai wujud komitmen Pemerintah Provinsi Bali dan Kota Denpasar dalam memperluas akses pendidikan berkualitas, khususnya bagi masyarakat di kawasan Denpasar Timur dan sekitarnya.</p>
<p class="mb-3">Dengan fasilitas pembelajaran modern, laboratorium sains terpadu, sarana kesenian Bali, dan perpustakaan digital, sekolah ini berkembang pesat menjadi institusi kebanggaan yang mencetak generasi berprestasi di tingkat regional maupun nasional.</p>
<p>Kombinasi nilai-nilai luhur kearifan budaya lokal Bali dengan teknologi mutakhir menjadikan SMA Negeri 12 Denpasar sekolah masa depan yang humanis dan berkarakter kuat.</p>`, 'Sejarah Singkat'],
    ['vision', 'Terwujudnya Insan Pembelajar yang Beriman dan Bertaqwa, Berkarakter Profil Pelajar Pancasila, Unggul dalam Prestasi, Berbudaya Luhur, dan Berwawasan Lingkungan Global.', 'Visi Sekolah'],
    ['mission', `1. Menumbuhkembangkan keimanan, ketaqwaan, dan budi pekerti luhur berasaskan falsafah Tri Hita Karana.
2. Melaksanakan pembelajaran berpusat pada siswa (student-centered) yang kreatif, kritis, dan berbasis teknologi informasi.
3. Mengembangkan potensi bakat akademik dan non-akademik siswa secara optimal melalui ekstrakurikuler terarah.
4. Melestarikan dan mengaktualisasikan seni serta budaya tradisi Bali dalam kehidupan bermasyarakat global.
5. Mewujudkan lingkungan sekolah ramah anak, hijau, bersih, dan berwawasan pelestarian lingkungan hidup (Adiwiyata).`, 'Misi Sekolah'],
    ['accreditation', 'Terakreditasi A (Unggul) - Nilai 96 oleh BAN-S/M', 'Status Akreditasi'],
    ['stats_students', '1084', 'Jumlah Siswa Aktif'],
    ['stats_teachers', '68', 'Jumlah Guru'],
    ['stats_staff', '22', 'Tenaga Kependidikan'],
    ['stats_achievements', '156', 'Prestasi Terdata'],
    ['curriculum_name', 'Kurikulum Merdeka Mandiri Berbagi', 'Kurikulum yang Diterapkan']
  ];

  for (const item of settingsData) {
    await insertSetting.run(item[0], item[1], item[2]);
  }
  console.log('âœ… Pengaturan identitas dan profil sekolah berhasil di-seed.');

  // 3. Seed Hero Sliders
  await db.exec('DELETE FROM sliders');
  const insertSlider = db.prepare(`
    INSERT INTO sliders (title, subtitle, image_url, button_text, button_url, order_index, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  await insertSlider.run(
    'Selamat Datang di SMA Negeri 12 Denpasar',
    'Membina Generasi Unggul, Berbudi Pekerti Luhur, Berakar Budaya Bali, dan Berdaya Saing Global.',
    'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600&auto=format&fit=crop&q=80',
    'Jelajahi Profil Sekolah',
    '/profil',
    1,
    1
  );

  await insertSlider.run(
    'Penerimaan Peserta Didik Baru (PPDB) 2026/2027',
    'Informasi resmi jalur pendaftaran, persyaratan, petunjuk teknis, dan jadwal lengkap PPDB.',
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1600&auto=format&fit=crop&q=80',
    'Info Lengkap PPDB',
    '/ppdb',
    2,
    1
  );

  await insertSlider.run(
    'Prestasi & Kreativitas Generasi Smandas',
    'Mendukung setiap minat, bakat sains, teknologi, olahraga, dan seni tari tabuh tradisi Bali.',
    'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1600&auto=format&fit=crop&q=80',
    'Lihat Prestasi Siswa',
    '/kesiswaan#prestasi',
    3,
    1
  );

  // 4. Seed Kategori
  await db.exec('DELETE FROM categories');
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, slug, type, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  await insertCategory.run(1, 'Berita Utama', 'berita-utama', 'post', 'Warta informasi terkini dan kegiatan penting sekolah');
  await insertCategory.run(2, 'Pengumuman', 'pengumuman', 'post', 'Pemberitahuan resmi akademik dan administrasi sekolah');
  await insertCategory.run(3, 'Prestasi & Apresiasi', 'prestasi-apresiasi', 'post', 'Kabar kejuaraan dan pencapaian civitas akademika');
  await insertCategory.run(4, 'Karya & Opini Siswa', 'karya-opini-siswa', 'post', 'Artikel, cerpen, esai, dan karya tulis siswa');
  await insertCategory.run(5, 'Dokumen Kurikulum', 'dokumen-kurikulum', 'download', 'Silabus, capaian pembelajaran, panduan belajar');
  await insertCategory.run(6, 'Formulir Administrasi', 'formulir-administrasi', 'download', 'Formulir izin, mutasi, surat keterangan');

  // 5. Seed Berita & Artikel
  await db.exec('DELETE FROM posts');
  const insertPost = db.prepare(`
    INSERT INTO posts (title, slug, category_id, excerpt, content, thumbnail, status, views, is_featured, author_id, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertPost.run(
    'Siswa SMA Negeri 12 Denpasar Raih Medali Emas Olimpiade Sains Nasional 2026',
    'siswa-sman-12-denpasar-raih-medali-emas-osn-2026',
    3,
    'Prestasi membanggakan kembali diukir oleh kontingen sains SMA Negeri 12 Denpasar dalam ajang Olimpiade Sains Nasional (OSN) bidang Kebumian tingkat Nasional.',
    `<p>Keluarga besar SMA Negeri 12 Denpasar kembali bersyukur dan berbangga atas torehan prestasi emas yang diraih oleh I Putu Arya Pratama, siswa kelas XI MIPA 1 dalam ajang Olimpiade Sains Nasional (OSN) 2026 bidang Kebumian.</p>
<p class="mt-3">Setelah melewati serangkaian seleksi berjenjang dari tingkat Kota Denpasar, Provinsi Bali, hingga babak final yang diselenggarakan di Jakarta, Putu Arya sukses mengungguli peserta dari 38 provinsi di Indonesia.</p>
<blockquote class="p-4 my-4 border-s-4 border-amber-500 bg-amber-50 dark:bg-slate-800 italic">"Keberhasilan ini merupakan buah dari disiplin belajar, bimbingan intensif tim pembina OSN sekolah, serta doa restu orang tua dan bapak ibu guru," ujar Kepala Sekolah.</blockquote>
<p>Semoga prestasi ini menjadi motivasi bagi seluruh rekan-rekan siswa lainnya untuk terus mengasah potensi diri dan mengharumkan nama sekolah tercinta.</p>`,
    'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=800&auto=format&fit=crop&q=80',
    'published',
    428,
    1,
    1,
    '2026-10-24 08:30:00'
  );

  await insertPost.run(
    'Peringatan Rahina Saraswati dan Piodalan Padmasana Sekolah Penuh Khidmat',
    'peringatan-rahina-saraswati-piodalan-padmasana-penuh-khidmat',
    1,
    'Civitas akademika SMA Negeri 12 Denpasar merayakan Rahina Saraswati sebagai hari turunnya ilmu pengetahuan suci dengan upacara persembahyangan bersama.',
    `<p>Pada hari Saniscara Umanis Watugunung, seluruh guru, tenaga kependidikan, dan siswa yang beragama Hindu melaksanakan persembahyangan bersama memperingati Hari Suci Saraswati di Padmasana SMA Negeri 12 Denpasar.</p>
<p class="mt-3">Kegiatan diawali dengan pembuatan banten dan penjor secara gotong royong oleh OSIS dan sekaa teruna sekolah, dilanjutkan dengan lantunan kekawin, pementasan Tari Rejang Dewa oleh siswi ekstrakurikuler tari, dan diakhiri dengan Dharma Wacana mengenai makna ilmu pengetahuan bagi kehidupan.</p>
<p class="mt-3">Melalui perayaan ini, diharapkan seluruh siswa senantiasa haus akan ilmu yang bermanfaat dan menggunakan kecerdasan untuk kebajikan sesama.</p>`,
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&auto=format&fit=crop&q=80',
    'published',
    312,
    1,
    2,
    '2026-10-12 10:00:00'
  );

  await insertPost.run(
    'Jadwal Penilaian Akhir Semester (PAS) Ganjil Tahun Ajaran 2026/2027',
    'jadwal-penilaian-akhir-semester-ganjil-2026-2027',
    2,
    'Diberitahukan kepada seluruh siswa kelas X, XI, dan XII bahwa pelaksanaan PAS Ganjil akan dimulai pada tanggal 1 Desember 2026 berbasis Computer Based Test (CBT).',
    `<p>Menindaklanjuti kalender akademik Dinas Pendidikan Kepemudaan dan Olahraga Provinsi Bali, diumumkan kepada seluruh civitas akademika ketentuan pelaksanaan Penilaian Akhir Semester (PAS) Ganjil Tahun Ajaran 2026/2027 sebagai berikut:</p>
<ul class="list-disc ps-6 my-3 space-y-1">
  <li>Pelaksanaan ujian: 1 s.d. 9 Desember 2026.</li>
  <li>Metode ujian: Computer Based Test (CBT) melalui portal resmi sekolah menggunakan gawai masing-masing siswa di ruang kelas.</li>
  <li>Syarat mengikuti: Kehadiran tatap muka minimal 85% dan telah menyelesaikan seluruh tugas proyek P5.</li>
  <li>Pengecekan akun CBT dapat dilakukan melalui wali kelas masing-masing mulai 25 November 2026.</li>
</ul>
<p>Diharapkan para siswa mempersiapkan diri dengan menjaga kesehatan dan belajar dengan tekun.</p>`,
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
    'published',
    589,
    0,
    1,
    '2026-11-01 14:00:00'
  );

  await insertPost.run(
    'Gelar Karya P5: Kolaborasi Pengolahan Sampah Organik dan Kearifan Lokal',
    'gelar-karya-p5-kolaborasi-pengolahan-sampah-organik-kearifan-lokal',
    1,
    'Siswa kelas X mempersembahkan pameran proyek P5 bertema Gaya Hidup Berkelanjutan dan Kearifan Lokal Bali dengan produk inovasi ramah lingkungan.',
    `<p>Halaman utama SMA Negeri 12 Denpasar tampak semarak dipenuhi anjungan pameran Gelar Karya Proyek Penguatan Profil Pelajar Pancasila (P5). Para siswa kelas X memamerkan karya inovatif mereka yang berfokus pada pengolahan sampah organik berbasis biopori dan ekoenzim, serta kerajinan anyaman bambu khas Denpasar Timur.</p>
<p class="mt-3">Kegiatan ini dibuka secara resmi oleh Pengawas Pembina SMA Disdikpora Provinsi Bali dan dihadiri oleh perwakilan komite sekolah serta para orang tua siswa.</p>`,
    'https://images.unsplash.com/photo-1511629091441-ee46146481b6?w=800&auto=format&fit=crop&q=80',
    'published',
    240,
    0,
    2,
    '2026-10-05 09:15:00'
  );

  await insertPost.run(
    'Ekstrakurikuler Robotika SMAN 12 Sabet Gelar Juara di Bali Robotic Championship',
    'ekstrakurikuler-robotika-sman-12-sabet-juara-bali-robotic-championship',
    3,
    'Tim Robotika Smandas berhasil meraih Juara 1 kategori Line Follower Microcontroller dan Best Design dalam kejuaraan robotika se-Bali Nusra.',
    `<p>Komitmen SMA Negeri 12 Denpasar dalam mewadahi inovasi sains dan kecerdasan artifisial kembali membuahkan hasil manis. Tim IT & Robotika Smandas sukses membawa pulang piala bergilir Bali Robotic Championship 2026.</p>
<p class="mt-3">Robot rancangan siswa mampu melewati rintangan dinamis dengan catatan waktu tercepat dan tingkat presisi lintasan tertinggi di antara 42 tim universitas dan sekolah menengah yang berpartisipasi.</p>`,
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&auto=format&fit=crop&q=80',
    'published',
    195,
    0,
    1,
    '2026-09-20 16:20:00'
  );

  await insertPost.run(
    'Sosialisasi Seleksi Masuk Perguruan Tinggi Negeri (SNBP & SNBT 2027) untuk Kelas XII',
    'sosialisasi-seleksi-masuk-ptn-snbp-snbt-kelas-xii',
    2,
    'Bimbingan Konseling (BK) mengadakan pendampingan karir dan pemetaan minat jurusan bersama perwakilan perguruan tinggi negeri terkemuka.',
    `<p>Guru Bimbingan dan Konseling (BK) bekerjasama dengan Forum Komunikasi Alumni SMAN 12 Denpasar menggelar seminar intensif "Merajut Asa Menuju Kampus Impian" yang diikuti oleh seluruh siswa kelas XII beserta perwakilan orang tua di Aula Widya Sabha.</p>`,
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80',
    'published',
    380,
    0,
    1,
    '2026-09-08 11:00:00'
  );

  // 6. Seed Agenda (Events)
  await db.exec('DELETE FROM events');
  const insertEvent = db.prepare(`
    INSERT INTO events (title, slug, description, location, start_date, end_date, time_info, organizer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertEvent.run(
    'Penilaian Akhir Semester (PAS) Ganjil 2026/2027',
    'pas-ganjil-2026-2027',
    'Evaluasi pembelajaran semester ganjil seluruh mata pelajaran berbasis CBT online.',
    'Ruang Kelas & Lab Komputer',
    '2026-12-01',
    '2026-12-09',
    '07.30 - 12.30 WITA',
    'Kurikulum & Panitia Ujian'
  );

  await insertEvent.run(
    'Pentas Seni & Budaya Akhir Tahun (Smandas Art Fest)',
    'smandas-art-fest-2026',
    'Pergelaran tari tradisional, teater monolog, musik akustik, dan pameran seni rupa karya siswa.',
    'Panggung Terbuka SMA Negeri 12 Denpasar',
    '2026-12-16',
    '2026-12-17',
    '08.00 - 15.00 WITA',
    'OSIS & Sanggar Seni'
  );

  await insertEvent.run(
    'Workshop Implementasi AI dalam Pembelajaran Berdiferensiasi Guru',
    'workshop-ai-guru-2026',
    'Pelatihan peningkatan kompetensi guru dalam memanfaatkan teknologi digital dan AI etis.',
    'Aula Gedung Widya Mandara',
    '2026-11-20',
    '2026-11-21',
    '09.00 - 14.30 WITA',
    'Komite Pembelajar Sekolah'
  );

  await insertEvent.run(
    'Donor Darah Sukarela & Bakti Sosial Kemanusiaan',
    'donor-darah-pmi-smandas',
    'Aksi sosial bekerjasama dengan PMI Cabang Kota Denpasar terbuka untuk guru, siswa 17+, dan warga sekitar.',
    'Gedung Olahraga (GOR) Smandas',
    '2026-11-28',
    '2026-11-28',
    '08.30 - 12.00 WITA',
    'PMR Wira SMAN 12'
  );

  // 7. Seed Guru & Tenaga Kependidikan
  await db.exec('DELETE FROM teachers');
  const insertTeacher = db.prepare(`
    INSERT INTO teachers (name, nip, role_type, subject, position, education, photo, email, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertTeacher.run(
    'I Wayan Suardana, S.Pd., M.Pd.',
    '19690817 199412 1 002',
    'kepala_sekolah',
    'Matematika',
    'Kepala Sekolah',
    'S2 Manajemen Pendidikan Universitas Pendidikan Ganesha',
    'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
    'kepsek@sman12denpasar.sch.id',
    1
  );

  await insertTeacher.run(
    'Ni Made Ayu Astuti, S.Pd., M.Hum.',
    '19750410 199903 2 004',
    'guru',
    'Bahasa Indonesia',
    'Wakasek Bidang Kurikulum',
    'S2 Linguistik Terapan Universitas Udayana',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
    'made.astuti@sman12denpasar.sch.id',
    2
  );

  await insertTeacher.run(
    'I Gusti Ngurah Bagus Dananjaya, S.Pd.',
    '19820315 200801 1 012',
    'guru',
    'Pendidikan Jasmani & Olahraga',
    'Wakasek Bidang Kesiswaan',
    'S1 Kepelatihan Olahraga Universitas Udayana',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    'ngurah.dananjaya@sman12denpasar.sch.id',
    3
  );

  await insertTeacher.run(
    'Dra. Ni Ketut Wardani, M.Si.',
    '19671120 199303 2 005',
    'guru',
    'Biologi',
    'Wakasek Bidang Sarana & Prasarana',
    'S2 Biologi Universitas Pendidikan Ganesha',
    'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=400&auto=format&fit=crop&q=80',
    'ketut.wardani@sman12denpasar.sch.id',
    4
  );

  await insertTeacher.run(
    'I Kadek Sudarma, S.Kom., M.Cs.',
    '19870912 201101 1 009',
    'guru',
    'Informatika & Komputer',
    'Wakasek Hubungan Masyarakat (Humas)',
    'S2 Ilmu Komputer Universitas Gadjah Mada',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
    'kadek.sudarma@sman12denpasar.sch.id',
    5
  );

  await insertTeacher.run(
    'Ida Bagus Made Windu, S.Pd.B.',
    '19840214 200902 1 006',
    'guru',
    'Bahasa Bali & Sastra Daerah',
    'Koordinator Seni & Budaya',
    'S1 Pendidikan Bahasa Bali Universitas Dwijendra',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
    'ib.windu@sman12denpasar.sch.id',
    6
  );

  await insertTeacher.run(
    'Ni Luh Putu Sintya Dewi, S.Pd.',
    '19920805 201802 2 003',
    'guru',
    'Bahasa Inggris',
    'Pembina English Club & Debat',
    'S1 Pendidikan Bahasa Inggris Universitas Pendidikan Ganesha',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    'sintya.dewi@sman12denpasar.sch.id',
    7
  );

  await insertTeacher.run(
    'I Nyoman Arya Wiguna, S.Si., M.Pd.',
    '19850118 201001 1 015',
    'guru',
    'Fisika & Riset Sains',
    'Koordinator Pembina OSN',
    'S2 Fisika Universitas Udayana',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
    'arya.wiguna@sman12denpasar.sch.id',
    8
  );

  await insertTeacher.run(
    'Ni Kadek Suartini, S.E.',
    '19860625 201402 2 001',
    'staff',
    '-',
    'Kepala Tata Usaha (KTU)',
    'S1 Ekonomi Manajemen Universitas Warmadewa',
    'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=400&auto=format&fit=crop&q=80',
    'kadek.suartini@sman12denpasar.sch.id',
    9
  );

  // 8. Seed Prestasi Siswa
  await db.exec('DELETE FROM achievements');
  const insertAchievement = db.prepare(`
    INSERT INTO achievements (title, student_name, rank, level, category, year, organizer, photo, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertAchievement.run(
    'Medali Emas Olimpiade Sains Nasional (OSN) Bidang Kebumian',
    'I Putu Arya Pratama (XI MIPA 1)',
    'Juara 1 (Medali Emas)',
    'Nasional',
    'Akademik',
    2026,
    'Kemendikbudristek & BPTI',
    'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=80',
    'Meraih medali emas setelah unggul dalam ujian teori geologi, meteorologi, dan observasi praktikum lapangan nasional.'
  );

  await insertAchievement.run(
    'Juara 1 Lomba Tari Janger Tingkat Remaja Pesta Kesenian Bali (PKB)',
    'Sekaa Tari Gita Smandas (Tim Siswi)',
    'Juara 1',
    'Provinsi',
    'Seni Budaya',
    2026,
    'Dinas Kebudayaan Provinsi Bali',
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&auto=format&fit=crop&q=80',
    'Menampilkan harmoni gerak tari tradisi Bali yang lincah dengan dinamika tabuh gamelan berkarakter klasik.'
  );

  await insertAchievement.run(
    'Medali Emas Kejuaraan Karate Porprov Bali Kategori Kumite -61 Kg',
    'Ni Komang Ayu Triana (XII MIPA 3)',
    'Juara 1 (Medali Emas)',
    'Provinsi',
    'Olahraga',
    2025,
    'KONI Provinsi Bali',
    'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=600&auto=format&fit=crop&q=80',
    'Menorehkan prestasi gemilang di cabang olahraga bela diri karate mewakili kontingen Kota Denpasar.'
  );

  await insertAchievement.run(
    'Juara 2 Nasional Lomba Karya Tulis Ilmiah Lingkungan Hidup Remaja',
    'Tim KIR Lestari (Kadek Dian & Gede Aditya)',
    'Juara 2',
    'Nasional',
    'Teknologi',
    2025,
    'Institut Teknologi Bandung (ITB)',
    'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=600&auto=format&fit=crop&q=80',
    'Riset inovasi bioplastik terurai ramah lingkungan berbahan dasar limbah kulit buah naga lokal Bali.'
  );

  // 9. Seed Ekstrakurikuler
  await db.exec('DELETE FROM extracurriculars');
  const insertExtra = db.prepare(`
    INSERT INTO extracurriculars (name, slug, category, mentor, schedule, location, description, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertExtra.run(
    'Tari Tradisi Bali & Tabuh (Sekaa Gong)',
    'tari-bali-tabuh',
    'Seni & Budaya Bali',
    'Ida Bagus Made Windu, S.Pd.B.',
    'Senin & Kamis (15.30 - 17.30 WITA)',
    'Bale Kesenian Widya Sabha',
    'Mewadahi pelestarian tari-tarian klasik Bali (Tari Pendet, Rejang, Baris, Oleg Tamulilingan) serta keterampilan menabuh gamelan Gong Kebyar.',
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&auto=format&fit=crop&q=80'
  );

  await insertExtra.run(
    'Robotika, Coding & Artificial Intelligence',
    'robotika-coding-ai',
    'Sains & Teknologi',
    'I Kadek Sudarma, S.Kom., M.Cs.',
    'Selasa & Jumat (15.30 - 17.00 WITA)',
    'Lab Komputer & IoT Smandas',
    'Mempelajari pemrograman microcontroller Arduino, IoT sensor pintar, robot line follower, pembuatan web, dan pengenalan kecerdasan buatan.',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&auto=format&fit=crop&q=80'
  );

  await insertExtra.run(
    'Pramuka (Gugus Depan Denpasar Timur)',
    'pramuka-smandas',
    'Kepanduan & Karakter',
    'I Wayan Sukerta, S.Pd.',
    'Rabu (15.30 - 17.00 WITA)',
    'Lapangan Upacara Sekolah',
    'Pendidikan kepramukaan penegak yang menanamkan kedisiplinan, kemandirian, cinta alam bebas, pionering, dan kepemimpinan berjiwa Dasa Darma.',
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80'
  );

  await insertExtra.run(
    'Palang Merah Remaja (PMR Wira) & KSPAN',
    'pmr-wira-kspan',
    'Kemanusiaan & Kesehatan',
    'Ni Luh Putu Ariani, S.Kep.',
    'Kamis (15.30 - 17.00 WITA)',
    'Ruang UKS & Aula',
    'Pelatihan pertolongan pertama pada kecelakaan (PPGD), kesiapsiagaan bencana gempa, donor darah, dan kampanye remaja sehat bebas narkoba & HIV/AIDS.',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop&q=80'
  );

  await insertExtra.run(
    'Bola Basket Smandas Warriors',
    'bola-basket-smandas',
    'Olahraga Prestasi',
    'Coach I Made Dwi Mahendra',
    'Selasa & Sabtu (16.00 - 18.00 WITA)',
    'Lapangan Basket Outdoor Smandas',
    'Pembinaan fisik, strategi tim, dan teknik fundamental bola basket yang aktif berlaga di kompetisi DBL Bali Series dan kejuaraan antar-pelajar.',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&auto=format&fit=crop&q=80'
  );

  await insertExtra.run(
    'English Debate & MUN Club',
    'english-debate-club',
    'Bahasa & Komunikasi',
    'Ni Luh Putu Sintya Dewi, S.Pd.',
    'Rabu (15.30 - 17.00 WITA)',
    'Ruang Multimedia Bahasa',
    'Mengasah kemampuan public speaking, critical thinking, debat bahasa Inggris format Asian Parliamentary, dan simulasi diplomasi Model United Nations.',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80'
  );

  // 10. Seed Galeri
  await db.exec('DELETE FROM galleries');
  const insertGallery = db.prepare(`
    INSERT INTO galleries (title, album, type, media_url, caption)
    VALUES (?, ?, ?, ?, ?)
  `);

  await insertGallery.run('Gedung Sekolah & Gerbang Candi Bentar', 'Sarana Prasarana', 'photo', 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&auto=format&fit=crop&q=80', 'Nuansa arsitektur khas Bali berpadu dengan kenyamanan ruang belajar modern.');
  await insertGallery.run('Laboratorium Sains Terpadu', 'Sarana Prasarana', 'photo', 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800&auto=format&fit=crop&q=80', 'Fasilitas praktikum fisika, kimia, dan biologi lengkap berstandar nasional.');
  await insertGallery.run('Perpustakaan Digital Widya Graha', 'Sarana Prasarana', 'photo', 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800&auto=format&fit=crop&q=80', 'Ruang baca berpendingin dengan ribuan koleksi buku fisik dan e-book digital.');
  await insertGallery.run('Upacara Peringatan Hari Pendidikan Nasional', 'Kegiatan Sekolah', 'photo', 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80', 'Seluruh guru dan siswa mengenakan pakaian adat kebesaran khas Bali.');
  await insertGallery.run('Pentas Tari Kebangsaan Siswa Siswi', 'Kesenian', 'photo', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&auto=format&fit=crop&q=80', 'Harmoni gerak indah penari siswi dalam pembukaan pameran seni.');
  await insertGallery.run('Pertandingan Final Liga Futsal Sekolah', 'Olahraga', 'photo', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=80', 'Semangat sportivitas dan kebersamaan antar angkatan.');

  // 11. Seed Dokumen Unduhan
  await db.exec('DELETE FROM downloads');
  const insertDownload = db.prepare(`
    INSERT INTO downloads (title, category, file_name, file_path, file_size, file_type, download_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  await insertDownload.run('Kalender Pendidikan Provinsi Bali Tahun 2026/2027', 'Kalender Pendidikan', 'kaldik-bali-2026-2027.pdf', '/uploads/documents/kaldik-bali-2026-2027.pdf', '2.4 MB', 'PDF', 142);
  await insertDownload.run('Buku Panduan & Tata Tertib Siswa SMA Negeri 12 Denpasar', 'Panduan', 'panduan-tatib-siswa-sman12.pdf', '/uploads/documents/panduan-tatib-siswa-sman12.pdf', '1.8 MB', 'PDF', 285);
  await insertDownload.run('Formulir Permohonan Mutasi / Pindah Masuk Siswa', 'Formulir', 'formulir-mutasi-siswa.docx', '/uploads/documents/formulir-mutasi-siswa.docx', '350 KB', 'DOCX', 94);
  await insertDownload.run('Capaian Pembelajaran (CP) Kurikulum Merdeka Fase E & F', 'Kurikulum', 'capaian-pembelajaran-kurikulum-merdeka.pdf', '/uploads/documents/capaian-pembelajaran-kurikulum-merdeka.pdf', '4.1 MB', 'PDF', 210);
  await insertDownload.run('Formulir Pendaftaran Ulang Siswa Baru Jalur PPDB', 'Formulir', 'formulir-daftar-ulang-ppdb.pdf', '/uploads/documents/formulir-daftar-ulang-ppdb.pdf', '520 KB', 'PDF', 380);

  // 12. Seed PPDB Info
  await db.exec('DELETE FROM ppdb_info');
  const insertPpdb = db.prepare(`
    INSERT INTO ppdb_info (academic_year, status, title, description, registration_url, start_date, end_date, announcement_date, requirements, flow_steps, contact_person)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertPpdb.run(
    '2026/2027',
    'Buka',
    'Penerimaan Peserta Didik Baru (PPDB) SMA Negeri 12 Denpasar TA 2026/2027',
    'Pelaksanaan PPDB Tahun Pelajaran 2026/2027 dilaksanakan secara daring (online) sesuai dengan petunjuk teknis Dinas Pendidikan Kepemudaan dan Olahraga Provinsi Bali dengan asas Objektif, Transparan, dan Akuntabel.',
    'https://smabali.siap-ppdb.com',
    '2026-06-15',
    '2026-06-25',
    '2026-07-02',
    `1. Ijazah atau Surat Keterangan Lulus (SKL) dari SMP/MTs sederajat.
2. Akta Kelahiran dan Kartu Keluarga (KK) yang diterbitkan paling lambat 1 tahun sebelum pendaftaran.
3. Surat Pernyataan Tanggung Jawab Mutlak (SPTJM) orang tua/wali bermaterai Rp 10.000.
4. Nilai Rapor semester 1 s.d. 5 yang telah dilegalisasi sekolah asal.
5. Piagam / Sertifikat Kejuaraan asli bagi pendaftar jalur Prestasi (akademik/non-akademik/seni budaya Bali).
6. Kartu KIP / PKH / KPS bagi pendaftar jalur Afirmasi.`,
    `Langkah 1: Calon peserta didik membuat akun dan verifikasi berkas di portal resmi Disdikpora Provinsi Bali.
Langkah 2: Memilih jalur pendaftaran (Zonasi, Afirmasi, Prestasi, atau Perpindahan Tugas).
Langkah 3: Memilih SMA Negeri 12 Denpasar sebagai sekolah pilihan utama.
Langkah 4: Mengunggah scan dokumen persyaratan asli berformat PDF/JPG.
Langkah 5: Memantau status pemeringkatan harian secara transparan online.
Langkah 6: Pengumuman hasil seleksi final dan daftar ulang di sekolah.`,
    'Humas PPDB SMAN 12: 0812-3899-1212 (WhatsApp) / Telp: (0361) 462912'
  );

  // 13. Seed Pesan Masuk Contoh (Messages)
  await db.exec('DELETE FROM messages');
  const insertMessage = db.prepare(`
    INSERT INTO messages (name, email, phone, subject, message, is_read)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  await insertMessage.run(
    'I Made Sukadana',
    'sukadana.bali@gmail.com',
    '081338112233',
    'Pertanyaan Mengenai Persyaratan Jalur Prestasi PPDB',
    'Selamat siang admin, mohon info apakah sertifikat Juara 1 Tingkat Kabupaten untuk lomba Seni Lukis dapat digunakan pada jalur prestasi seni budaya? Terima kasih.',
    0
  );

  await insertMessage.run(
    'Ni Luh Ketut Sulastri',
    'sulastri.denpasar@yahoo.com',
    '087860123456',
    'Permohonan Kunjungan Studi Banding OSIS SMA',
    'Yth. Kepala SMA Negeri 12 Denpasar, kami dari pengurus OSIS SMAN di Gianyar bermaksud mengajukan permohonan kunjungan studi tiru program Adiwiyata dan P5 di sekolah Bapak/Ibu.',
    1
  );

  console.log('ðŸŽ‰ Seeder selesai dijalankan! Seluruh data SMA Negeri 12 Denpasar berhasil disimpan.');
}

if (require.main === module) {
  seedDatabase().catch((err) => {
    console.error('Gagal menjalankan seeder:', err);
    process.exit(1);
  });
}

module.exports = seedDatabase;