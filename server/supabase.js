import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseEnabled() {
  return Boolean(url && key);
}

let client = null;

export function getSupabase() {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase non configuré. Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'fenacoju-uploads';
