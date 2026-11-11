/**
 * Pemindai konten judi online / spam.
 * Jalankan: npm run security:scan
 *
 * Skrip ini membaca database dan mencocokkan kata kunci promosi judi pada
 * berita, pengaturan sekolah, dan pesan masuk. Berguna untuk mendeteksi
 * injeksi konten setelah situs online.
 */
const db = require('../config/database');

const KEYWORDS = [
  'slot', 'gacor', 'maxwin', 'judol', 'judi', 'casino', 'kasino', 'poker',
  'togel', 'pragmatic', 'sbobet', 'freebet', 'zeus', 'olympus',
  'mahjong ways', 'hoki slot', 'agen slot', 'bandar judi', 'rtp slot',
  'deposit pulsa', 'situs slot', 'link alternatif', 'bonus new member',
  'jackpot', 'scatter', 'pg soft', 'joker123', 'toto'
];

function findMatches(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  return KEYWORDS.filter((word) => lower.includes(word));
}

const findings = [];

async function scanTable(table, columns, label) {
  const rows = await db.prepare(`SELECT * FROM ${table}`).all();
  for (const row of rows) {
    for (const col of columns) {
      const hits = findMatches(row[col]);
      if (hits.length > 0) {
        findings.push({ label, id: row.id, column: col, keywords: hits });
      }
    }
  }
}

async function main() {
console.log('🔍 Memindai konten judi online / spam...\n');

await scanTable('posts', ['title', 'excerpt', 'content', 'slug'], 'Berita');
await scanTable('settings', ['value'], 'Pengaturan');
await scanTable('events', ['title', 'description'], 'Agenda');
await scanTable('messages', ['name', 'subject', 'message'], 'Pesan Masuk');
await scanTable('teachers', ['name', 'position'], 'Guru');
await scanTable('achievements', ['title', 'description'], 'Prestasi');

if (findings.length === 0) {
  console.log('✅ Tidak ditemukan kata kunci judi/spam pada konten.');
} else {
  console.log(`⚠️  Ditemukan ${findings.length} indikasi konten judi/spam:\n`);
  for (const f of findings) {
    console.log(`- [${f.label}] id=${f.id} kolom=${f.column} → ${f.keywords.join(', ')}`);
  }
  console.log('\nSegera periksa konten tersebut di panel admin, lalu ganti password admin.');
  process.exitCode = 1;
}
}

main().catch((err) => {
  console.error('Gagal memindai konten:', err);
  process.exitCode = 1;
});
