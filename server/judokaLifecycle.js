import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const eventsPath = path.join(dataDir, 'judoka_events.json');
const gradeHistoryPath = path.join(dataDir, 'judoka_grade_history.json');
const transfersPath = path.join(dataDir, 'judoka_transfers.json');

function ensureJson(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2));
}
ensureJson(eventsPath);
ensureJson(gradeHistoryPath);
ensureJson(transfersPath);

function readJson(filePath) {
  ensureJson(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export const GRADES_ORDER = [
  'Blanche',
  'Blanche-Jaune',
  'Jaune',
  'Jaune-Orange',
  'Orange',
  'Orange-Verte',
  'Verte',
  'Verte-Bleue',
  'Bleue',
  'Bleue-Marron',
  'Marron',
  'Noire 1er Dan',
  'Noire 2ème Dan',
  'Noire 3ème Dan',
  'Noire 4ème Dan',
  'Noire 5ème Dan',
];

export function isBlackBeltGrade(grade) {
  return String(grade || '').toLowerCase().startsWith('noire');
}

export function isClubAllowedGrade(grade) {
  const g = String(grade || '').trim();
  if (!g || isBlackBeltGrade(g)) return false;
  return GRADES_ORDER.includes(g);
}

export function actorLabel(user) {
  if (!user) return '';
  if (user.nom_club) return user.nom_club;
  if (user.nom_organisation) return user.nom_organisation;
  const name = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return name || user.email || user.username || user.fonction || user.type || '';
}

export async function addJudokaEvent({
  judoka_id,
  type,
  titre,
  detail = '',
  meta = {},
  created_by = null,
  created_by_name = '',
}) {
  const row = {
    id: uuidv4(),
    judoka_id,
    type,
    titre,
    detail,
    meta,
    created_by,
    created_by_name,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_events').insert(row).select('*').maybeSingle();
      if (error) throw error;
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_events fallback JSON:', err.message);
    }
  }

  const list = readJson(eventsPath);
  list.unshift(row);
  writeJson(eventsPath, list);
  return row;
}

export async function getJudokaEvents(judokaId) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_events')
        .select('*')
        .eq('judoka_id', judokaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(eventsPath)
    .filter((e) => e.judoka_id === judokaId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function addGradeHistory(entry) {
  const row = {
    id: uuidv4(),
    judoka_id: entry.judoka_id,
    grade_from: entry.grade_from || '',
    grade_to: entry.grade_to,
    instructeur_id: entry.instructeur_id || null,
    instructeur_nom: entry.instructeur_nom || '',
    points: entry.points == null || entry.points === '' ? null : Number(entry.points),
    note: entry.note || '',
    changed_by: entry.changed_by || null,
    changed_by_name: entry.changed_by_name || '',
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_grade_history').insert(row).select('*').maybeSingle();
      if (error) throw error;
      await addJudokaEvent({
        judoka_id: row.judoka_id,
        type: 'grade',
        titre: `Passation de grade : ${row.grade_from || '—'} → ${row.grade_to}`,
        detail: [
          row.instructeur_nom ? `Instructeur : ${row.instructeur_nom}` : null,
          row.points != null ? `Points : ${row.points}` : null,
          row.note || null,
        ].filter(Boolean).join(' · '),
        meta: {
          grade_from: row.grade_from,
          grade_to: row.grade_to,
          instructeur_nom: row.instructeur_nom,
          points: row.points,
        },
        created_by: row.changed_by,
        created_by_name: row.changed_by_name,
      });
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_grade_history fallback JSON:', err.message);
    }
  }

  const list = readJson(gradeHistoryPath);
  list.unshift(row);
  writeJson(gradeHistoryPath, list);
  await addJudokaEvent({
    judoka_id: row.judoka_id,
    type: 'grade',
    titre: `Passation de grade : ${row.grade_from || '—'} → ${row.grade_to}`,
    detail: [
      row.instructeur_nom ? `Instructeur : ${row.instructeur_nom}` : null,
      row.points != null ? `Points : ${row.points}` : null,
      row.note || null,
    ].filter(Boolean).join(' · '),
    meta: {
      grade_from: row.grade_from,
      grade_to: row.grade_to,
      instructeur_nom: row.instructeur_nom,
      points: row.points,
    },
    created_by: row.changed_by,
    created_by_name: row.changed_by_name,
  });
  return row;
}

export async function getGradeHistory({ judokaId = null, blackOnly = false } = {}) {
  let list = [];
  if (isSupabaseEnabled()) {
    try {
      let q = getSupabase().from('judoka_grade_history').select('*').order('created_at', { ascending: false });
      if (judokaId) q = q.eq('judoka_id', judokaId);
      const { data, error } = await q;
      if (error) throw error;
      list = data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      list = readJson(gradeHistoryPath);
    }
  } else {
    list = readJson(gradeHistoryPath);
  }
  if (judokaId) list = list.filter((r) => r.judoka_id === judokaId);
  if (blackOnly) list = list.filter((r) => isBlackBeltGrade(r.grade_to));
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function createTransfer({
  judoka_id,
  club_from,
  club_to,
  motif = '',
  requested_by = null,
  requested_by_name = '',
}) {
  const from = String(club_from || '').trim();
  const to = String(club_to || '').trim();
  if (!from || !to) throw new Error('Clubs d\'origine et de destination obligatoires');
  if (from.toLowerCase() === to.toLowerCase()) throw new Error('Le club de destination doit être différent');

  const row = {
    id: uuidv4(),
    judoka_id,
    club_from: from,
    club_to: to,
    statut: 'pending_ligue',
    requested_by,
    requested_by_name,
    ligue_validated_by: null,
    ligue_validated_by_name: '',
    federation_validated_by: null,
    federation_validated_by_name: '',
    motif: String(motif || '').trim(),
    created_at: new Date().toISOString(),
    ligue_validated_at: null,
    federation_validated_at: null,
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_transfers').insert(row).select('*').maybeSingle();
      if (error) throw error;
      await addJudokaEvent({
        judoka_id,
        type: 'transfert',
        titre: `Demande de transfert : ${from} → ${to}`,
        detail: row.motif || 'En attente de validation Ligue',
        meta: { transfer_id: row.id, statut: row.statut, club_from: from, club_to: to },
        created_by: requested_by,
        created_by_name: requested_by_name,
      });
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_transfers fallback JSON:', err.message);
    }
  }

  const list = readJson(transfersPath);
  list.unshift(row);
  writeJson(transfersPath, list);
  await addJudokaEvent({
    judoka_id,
    type: 'transfert',
    titre: `Demande de transfert : ${from} → ${to}`,
    detail: row.motif || 'En attente de validation Ligue',
    meta: { transfer_id: row.id, statut: row.statut, club_from: from, club_to: to },
    created_by: requested_by,
    created_by_name: requested_by_name,
  });
  return row;
}

export async function getTransfers({ judokaId = null, statut = null } = {}) {
  let list = [];
  if (isSupabaseEnabled()) {
    try {
      let q = getSupabase().from('judoka_transfers').select('*').order('created_at', { ascending: false });
      if (judokaId) q = q.eq('judoka_id', judokaId);
      if (statut) q = q.eq('statut', statut);
      const { data, error } = await q;
      if (error) throw error;
      list = data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      list = readJson(transfersPath);
    }
  } else {
    list = readJson(transfersPath);
  }
  if (judokaId) list = list.filter((t) => t.judoka_id === judokaId);
  if (statut) list = list.filter((t) => t.statut === statut);
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getTransferById(id) {
  const all = await getTransfers();
  return all.find((t) => t.id === id) || null;
}

async function saveTransfer(updated) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_transfers')
        .update(updated)
        .eq('id', updated.id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  const list = readJson(transfersPath);
  const idx = list.findIndex((t) => t.id === updated.id);
  if (idx === -1) throw new Error('Transfert introuvable');
  list[idx] = updated;
  writeJson(transfersPath, list);
  return updated;
}

export async function validateTransferByLigue(id, user) {
  const transfer = await getTransferById(id);
  if (!transfer) throw new Error('Transfert introuvable');
  if (transfer.statut !== 'pending_ligue') throw new Error('Ce transfert n\'attend pas la validation Ligue');
  const updated = {
    ...transfer,
    statut: 'pending_federation',
    ligue_validated_by: user?.id || null,
    ligue_validated_by_name: actorLabel(user),
    ligue_validated_at: new Date().toISOString(),
  };
  const saved = await saveTransfer(updated);
  await addJudokaEvent({
    judoka_id: transfer.judoka_id,
    type: 'transfert',
    titre: `Transfert validé par la Ligue : ${transfer.club_from} → ${transfer.club_to}`,
    detail: 'En attente de confirmation Fédération (Secrétaire Général / Coordon)',
    meta: { transfer_id: id, statut: 'pending_federation' },
    created_by: user?.id || null,
    created_by_name: actorLabel(user),
  });
  return saved;
}

export async function confirmTransferByFederation(id, user, { applyClubChange }) {
  const transfer = await getTransferById(id);
  if (!transfer) throw new Error('Transfert introuvable');
  if (transfer.statut !== 'pending_federation') {
    throw new Error('Ce transfert n\'attend pas la confirmation Fédération');
  }
  if (typeof applyClubChange === 'function') {
    await applyClubChange(transfer);
  }
  const updated = {
    ...transfer,
    statut: 'accepte',
    federation_validated_by: user?.id || null,
    federation_validated_by_name: actorLabel(user),
    federation_validated_at: new Date().toISOString(),
  };
  const saved = await saveTransfer(updated);
  await addJudokaEvent({
    judoka_id: transfer.judoka_id,
    type: 'transfert',
    titre: `Transfert confirmé : ${transfer.club_from} → ${transfer.club_to}`,
    detail: 'Transfert effectif',
    meta: { transfer_id: id, statut: 'accepte', club_from: transfer.club_from, club_to: transfer.club_to },
    created_by: user?.id || null,
    created_by_name: actorLabel(user),
  });
  return saved;
}

export async function rejectTransfer(id, user, reason = '') {
  const transfer = await getTransferById(id);
  if (!transfer) throw new Error('Transfert introuvable');
  if (!['pending_ligue', 'pending_federation'].includes(transfer.statut)) {
    throw new Error('Ce transfert ne peut plus être rejeté');
  }
  const updated = {
    ...transfer,
    statut: 'rejete',
    motif: reason || transfer.motif,
    federation_validated_by: transfer.statut === 'pending_federation' ? (user?.id || null) : transfer.federation_validated_by,
    federation_validated_by_name: transfer.statut === 'pending_federation'
      ? actorLabel(user)
      : transfer.federation_validated_by_name,
    ligue_validated_by: transfer.statut === 'pending_ligue' ? (user?.id || null) : transfer.ligue_validated_by,
    ligue_validated_by_name: transfer.statut === 'pending_ligue'
      ? actorLabel(user)
      : transfer.ligue_validated_by_name,
  };
  const saved = await saveTransfer(updated);
  await addJudokaEvent({
    judoka_id: transfer.judoka_id,
    type: 'transfert',
    titre: `Transfert rejeté : ${transfer.club_from} → ${transfer.club_to}`,
    detail: reason || 'Demande rejetée',
    meta: { transfer_id: id, statut: 'rejete' },
    created_by: user?.id || null,
    created_by_name: actorLabel(user),
  });
  return saved;
}
