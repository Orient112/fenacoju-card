import 'dotenv/config';
import { getSupabase, isSupabaseEnabled, STORAGE_BUCKET } from '../server/supabase.js';

async function main() {
  if (!isSupabaseEnabled()) {
    console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquantes dans .env');
    process.exit(1);
  }

  const supabase = getSupabase();
  console.log(`Connexion à ${process.env.SUPABASE_URL}...\n`);

  const tables = ['users', 'judokas', 'messages', 'sessions'];
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ ${table}: ${error.message} (exécutez supabase/schema.sql ?)`);
    } else {
      console.log(`✅ ${table}: ${count ?? 0} ligne(s)`);
    }
  }

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.log(`❌ Storage: ${bucketError.message}`);
  } else {
    const bucket = buckets?.find((b) => b.id === STORAGE_BUCKET);
    console.log(bucket ? `✅ Bucket "${STORAGE_BUCKET}" trouvé` : `❌ Bucket "${STORAGE_BUCKET}" absent`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
