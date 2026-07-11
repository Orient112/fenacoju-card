import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase, isSupabaseEnabled } from '../server/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

async function migrateTable(table, fileName, transform = (r) => r) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`⏭  ${table}: fichier absent`);
    return;
  }

  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!rows.length) {
    console.log(`⏭  ${table}: vide`);
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from(table).upsert(rows.map(transform), { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✅ ${table}: ${rows.length} enregistrement(s)`);
}

async function main() {
  if (!isSupabaseEnabled()) {
    console.error('Configurez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env');
    process.exit(1);
  }

  console.log('Migration JSON → Supabase...\n');
  await migrateTable('users', 'users.json');
  await migrateTable('sessions', 'sessions.json');
  await migrateTable('judokas', 'judokas.json');
  await migrateTable('messages', 'messages.json');
  console.log('\nMigration terminée.');
}

main().catch((err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
