import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase, isSupabaseEnabled, STORAGE_BUCKET } from '../server/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');

/** L'admin local utilise un id non-UUID — on le mappe vers un UUID fixe. */
const ADMIN_LEGACY_ID = 'admin-fenacoju-001';
const ADMIN_UUID = '11111111-1111-4111-8111-111111111111';

function mapId(id) {
  if (id === ADMIN_LEGACY_ID) return ADMIN_UUID;
  return id;
}

function getMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

async function uploadLocalFiles(supabase) {
  const urlMap = new Map();

  if (!fs.existsSync(uploadsDir)) {
    console.log('⏭  uploads: dossier absent');
    return urlMap;
  }

  const files = fs.readdirSync(uploadsDir).filter((f) => {
    const p = path.join(uploadsDir, f);
    return fs.statSync(p).isFile();
  });

  if (!files.length) {
    console.log('⏭  uploads: aucun fichier');
    return urlMap;
  }

  for (const file of files) {
    const localPath = path.join(uploadsDir, file);
    const storagePath = `uploads/${file}`;
    const buffer = fs.readFileSync(localPath);

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
      contentType: getMime(file),
      upsert: true,
    });

    if (error) throw new Error(`Upload ${file}: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    urlMap.set(`/uploads/${file}`, data.publicUrl);
    console.log(`📁 ${file} → Storage`);
  }

  return urlMap;
}

function rewriteUrl(url, urlMap) {
  if (!url) return url;
  return urlMap.get(url) || url;
}

function rewriteDocuments(documents, urlMap) {
  if (!documents || typeof documents !== 'object') return {};
  const out = {};
  for (const [key, url] of Object.entries(documents)) {
    out[key] = rewriteUrl(url, urlMap);
  }
  return out;
}

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
    console.error('\n❌ Supabase non configuré.');
    console.error('Créez un fichier .env à la racine avec :');
    console.error('  SUPABASE_URL=https://xxxxx.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ...');
    console.error('  SUPABASE_STORAGE_BUCKET=fenacoju-uploads\n');
    process.exit(1);
  }

  const supabase = getSupabase();

  console.log('Migration locale → Supabase\n');
  console.log(`Projet : ${process.env.SUPABASE_URL}`);
  console.log(`Bucket : ${STORAGE_BUCKET}\n`);

  const urlMap = await uploadLocalFiles(supabase);

  await migrateTable('users', 'users.json', (u) => ({
    id: mapId(u.id),
    type: u.type,
    username: u.username || null,
    email: u.email,
    password: u.password,
    nom: u.nom || null,
    prenom: u.prenom || null,
    fonction: u.fonction || null,
    nom_club: u.nom_club || null,
    ville: u.ville || null,
    responsable: u.responsable || null,
    club: u.club || null,
    grade: u.grade || null,
    telephone: u.telephone || '',
    documents: rewriteDocuments(u.documents, urlMap),
    created_at: u.created_at || new Date().toISOString(),
  }));

  await migrateTable('judokas', 'judokas.json', (j) => ({
    ...j,
    photo: rewriteUrl(j.photo, urlMap),
    categorie: j.categorie || '',
    numero_licence: j.numero_licence || '',
    telephone: j.telephone || '',
    email: j.email || '',
    entraineur_id: j.entraineur_id || '',
    entraineur_nom: j.entraineur_nom || '',
    statut: j.statut || 'actif',
  }));

  await migrateTable('messages', 'messages.json', (m) => ({
    ...m,
    from_id: mapId(m.from_id),
    to_id: mapId(m.to_id),
    subject: m.subject || '',
    read: Boolean(m.read),
  }));

  console.log('⏭  sessions: ignorées (les utilisateurs se reconnecteront)');

  const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: judokaCount } = await supabase.from('judokas').select('*', { count: 'exact', head: true });
  const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });

  console.log('\n── Résumé Supabase ──');
  console.log(`   Utilisateurs : ${userCount ?? '?'}`);
  console.log(`   Judokas      : ${judokaCount ?? '?'}`);
  console.log(`   Messages     : ${msgCount ?? '?'}`);
  console.log(`   Fichiers     : ${urlMap.size}`);
  console.log('\n✅ Migration terminée.');
}

main().catch((err) => {
  console.error('\n❌ Erreur:', err.message);
  process.exit(1);
});
