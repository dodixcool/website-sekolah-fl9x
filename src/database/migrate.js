const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigration() {
  console.log('⚡ Menjalankan migrasi skema database...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Eksekusi skrip SQL
  await db.exec(schemaSql);
  console.log('✅ Migrasi skema database berhasil selesai!');
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error('❌ Gagal menjalankan migrasi:', err);
    process.exit(1);
  });
}

module.exports = runMigration;
