import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const archivePath = path.join(dataDir, 'judoka_grade_history_archives.json');

function ensureJson(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2));
}
ensureJson(archivePath);

function readJson(filePath) {
  ensureJson(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function archiveGradePassationReset({
  federation_id = null,
  reset_by = null,
  reset_by_name = '',
  exams = [],
  submissions = [],
  grade_history = [],
} = {}) {
  const row = {
    id: uuidv4(),
    federation_id: federation_id || null,
    reset_by,
    reset_by_name: reset_by_name || '',
    created_at: new Date().toISOString(),
    exams: Array.isArray(exams) ? exams : [],
    submissions: Array.isArray(submissions) ? submissions : [],
    grade_history: Array.isArray(grade_history) ? grade_history : [],
    exams_count: Array.isArray(exams) ? exams.length : 0,
    submissions_count: Array.isArray(submissions) ? submissions.length : 0,
    history_count: Array.isArray(grade_history) ? grade_history.length : 0,
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_grade_history_archives')
        .insert(row)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_grade_history_archives fallback JSON:', err.message);
    }
  }

  const list = readJson(archivePath);
  list.unshift(row);
  writeJson(archivePath, list);
  return row;
}

export async function listGradePassationArchives({ federationId = null } = {}) {
  let list = [];
  if (isSupabaseEnabled()) {
    try {
      let q = getSupabase()
        .from('judoka_grade_history_archives')
        .select('*')
        .order('created_at', { ascending: false });
      if (federationId) q = q.eq('federation_id', federationId);
      const { data, error } = await q;
      if (error) throw error;
      list = data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      list = readJson(archivePath);
    }
  } else {
    list = readJson(archivePath);
  }

  if (federationId) {
    const { DEFAULT_JUDO_FEDERATION_ID } = await import('./federations.js');
    list = list.filter((a) =>
      String(a.federation_id || '') === String(federationId)
      || (!a.federation_id && String(federationId) === String(DEFAULT_JUDO_FEDERATION_ID))
    );
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getGradePassationArchiveById(id) {
  if (!id) return null;
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_grade_history_archives')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(archivePath).find((a) => String(a.id) === String(id)) || null;
}
