import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';
import {
  actorLabel,
  addGradeHistory,
  approveGradeRequest,
  getGradeRequestById,
  rejectGradeRequest,
} from './judokaLifecycle.js';
import { getFederationById } from './federations.js';

const examsPath = path.join(dataDir, 'judoka_grade_exams.json');
const submissionsPath = path.join(dataDir, 'judoka_grade_exam_submissions.json');

function ensureJson(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2));
}
ensureJson(examsPath);
ensureJson(submissionsPath);

function readJson(filePath) {
  ensureJson(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function makeToken() {
  return `GX-${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

function normalizeQuestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((q, i) => ({
      id: String(q.id || `q${i + 1}`),
      text: String(q.text || '').trim(),
      max_points: Math.max(0, Number(q.max_points) || 0),
    }))
    .filter((q) => q.text);
}

export async function createGradeExam({
  instructeur_nom,
  questions,
  athletes = [],
  request_ids = [],
  federation_id = null,
  created_by = null,
  created_by_name = '',
}) {
  const instructeur = String(instructeur_nom || '').trim();
  if (!instructeur) throw new Error('Le nom de l\'instructeur est obligatoire');
  const qs = normalizeQuestions(questions);
  if (qs.length === 0) throw new Error('Ajoutez au moins une question d\'examen');
  if (!Array.isArray(athletes) || athletes.length === 0) {
    throw new Error('Sélectionnez au moins un athlète');
  }

  const row = {
    id: uuidv4(),
    token: makeToken(),
    instructeur_nom: instructeur,
    questions: qs,
    request_ids: request_ids.map(String),
    athletes: athletes.map((a) => ({
      request_id: a.request_id,
      judoka_id: a.judoka_id,
      judoka_numero_carte: String(a.judoka_numero_carte || '').trim(),
      judoka_nom: a.judoka_nom || '',
      judoka_prenom: a.judoka_prenom || '',
      grade_from: a.grade_from || '',
      grade_to: a.grade_to || '',
      club: a.club || '',
    })),
    statut: 'open',
    federation_id: federation_id || null,
    created_by,
    created_by_name: created_by_name || '',
    created_at: new Date().toISOString(),
    closed_at: null,
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_grade_exams').insert(row).select('*').maybeSingle();
      if (error) throw error;
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_grade_exams fallback JSON:', err.message);
    }
  }

  const list = readJson(examsPath);
  list.unshift(row);
  writeJson(examsPath, list);
  return row;
}

export async function getGradeExamById(id) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_grade_exams').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(examsPath).find((e) => e.id === id) || null;
}

export async function getGradeExamByToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_grade_exams').select('*').eq('token', t).maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(examsPath).find((e) => e.token === t) || null;
}

export async function listGradeExams({ federationId = null } = {}) {
  let list = [];
  if (isSupabaseEnabled()) {
    try {
      let q = getSupabase().from('judoka_grade_exams').select('*').order('created_at', { ascending: false });
      if (federationId) q = q.eq('federation_id', federationId);
      const { data, error } = await q;
      if (error) throw error;
      list = data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      list = readJson(examsPath);
    }
  } else {
    list = readJson(examsPath);
  }
  if (federationId) list = list.filter((e) => !e.federation_id || e.federation_id === federationId);
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function saveExam(updated) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_grade_exams')
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
  const list = readJson(examsPath);
  const idx = list.findIndex((e) => e.id === updated.id);
  if (idx === -1) throw new Error('Examen introuvable');
  list[idx] = updated;
  writeJson(examsPath, list);
  return updated;
}

export async function getExamSubmissions(examId) {
  let list = [];
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_grade_exam_submissions')
        .select('*')
        .eq('exam_id', examId)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      list = data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      list = readJson(submissionsPath).filter((s) => s.exam_id === examId);
    }
  } else {
    list = readJson(submissionsPath).filter((s) => s.exam_id === examId);
  }
  return list.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

async function maybeCloseExam(exam) {
  const submissions = await getExamSubmissions(exam.id);
  const athleteIds = new Set((exam.athletes || []).map((a) => String(a.judoka_id)));
  const submittedIds = new Set(submissions.map((s) => String(s.judoka_id)));
  const allDone = athleteIds.size > 0 && [...athleteIds].every((id) => submittedIds.has(id));
  if (allDone && exam.statut !== 'closed') {
    return saveExam({
      ...exam,
      statut: 'closed',
      closed_at: new Date().toISOString(),
    });
  }
  return exam;
}

export async function publicExamLookup(token, numeroCarte) {
  const exam = await getGradeExamByToken(token);
  if (!exam) throw new Error('Lien de test introuvable');
  if (exam.statut === 'closed') {
    throw new Error('Ce lien de test n\'est plus accessible : tous les athlètes ont confirmé leur examen');
  }
  const card = String(numeroCarte || '').trim().toLowerCase();
  if (!card) throw new Error('Saisissez votre ID unique (n° de carte)');
  const athlete = (exam.athletes || []).find((a) =>
    String(a.judoka_numero_carte || '').trim().toLowerCase() === card
  );
  if (!athlete) throw new Error('ID non reconnu pour cet examen');

  const submissions = await getExamSubmissions(exam.id);
  const already = submissions.find((s) => String(s.judoka_id) === String(athlete.judoka_id));
  if (already) {
    throw new Error('Vous avez déjà confirmé cet examen');
  }

  let federation_nom_profil = 'Fight Management';
  if (exam.federation_id) {
    try {
      const fed = await getFederationById(exam.federation_id);
      federation_nom_profil = String(fed?.nom_profil || fed?.nom || '').trim() || 'Fight Management';
    } catch {
      federation_nom_profil = 'Fight Management';
    }
  }

  return {
    exam: {
      id: exam.id,
      token: exam.token,
      instructeur_nom: exam.instructeur_nom,
      questions: exam.questions,
      statut: exam.statut,
      federation_nom_profil,
    },
    athlete,
  };
}

export async function publicExamSubmit(token, { numero_carte, answers }) {
  const exam = await getGradeExamByToken(token);
  if (!exam) throw new Error('Lien de test introuvable');
  if (exam.statut === 'closed') {
    throw new Error('Ce lien de test n\'est plus accessible');
  }
  const card = String(numero_carte || '').trim().toLowerCase();
  const athlete = (exam.athletes || []).find((a) =>
    String(a.judoka_numero_carte || '').trim().toLowerCase() === card
  );
  if (!athlete) throw new Error('ID non reconnu pour cet examen');

  const existing = (await getExamSubmissions(exam.id))
    .find((s) => String(s.judoka_id) === String(athlete.judoka_id));
  if (existing) throw new Error('Vous avez déjà confirmé cet examen');

  const qs = exam.questions || [];
  const answerMap = new Map((Array.isArray(answers) ? answers : []).map((a) => [String(a.question_id), String(a.answer || '').trim()]));
  const normalized = qs.map((q) => {
    const answer = answerMap.get(String(q.id)) || '';
    if (!answer) throw new Error(`Répondez à toutes les questions (${q.text})`);
    return { question_id: q.id, answer };
  });

  const row = {
    id: uuidv4(),
    exam_id: exam.id,
    request_id: athlete.request_id || null,
    judoka_id: athlete.judoka_id,
    judoka_numero_carte: athlete.judoka_numero_carte || '',
    judoka_nom: athlete.judoka_nom || '',
    judoka_prenom: athlete.judoka_prenom || '',
    grade_from: athlete.grade_from || '',
    grade_to: athlete.grade_to || '',
    answers: normalized,
    scores: [],
    total_score: null,
    total_max: qs.reduce((sum, q) => sum + (Number(q.max_points) || 0), 0),
    reussi: null,
    submitted_at: new Date().toISOString(),
    graded_at: null,
    graded_by: null,
    graded_by_name: '',
  };

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('judoka_grade_exam_submissions').insert(row).select('*').maybeSingle();
      if (error) throw error;
      await maybeCloseExam(exam);
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_grade_exam_submissions fallback JSON:', err.message);
    }
  }

  const list = readJson(submissionsPath);
  list.unshift(row);
  writeJson(submissionsPath, list);
  await maybeCloseExam(exam);
  return row;
}

export async function gradeExamSubmission(
  examId,
  submissionId,
  { scores, reussi, note = '' },
  user,
  { applyGradeChange } = {}
) {
  const exam = await getGradeExamById(examId);
  if (!exam) throw new Error('Examen introuvable');
  const submissions = await getExamSubmissions(examId);
  const submission = submissions.find((s) => String(s.id) === String(submissionId));
  if (!submission) throw new Error('Réponses introuvables');
  if (submission.reussi === true || submission.reussi === false) {
    throw new Error('Cette copie a déjà été traitée');
  }

  const qs = exam.questions || [];
  const scoreMap = new Map((Array.isArray(scores) ? scores : []).map((s) => [String(s.question_id), Number(s.points)]));
  const normalizedScores = qs.map((q) => {
    const max = Math.max(0, Number(q.max_points) || 0);
    let points = scoreMap.has(String(q.id)) ? Number(scoreMap.get(String(q.id))) : 0;
    if (Number.isNaN(points)) points = 0;
    points = Math.max(0, Math.min(max, points));
    return { question_id: q.id, points, max_points: max };
  });
  const totalScore = normalizedScores.reduce((sum, s) => sum + s.points, 0);
  const totalMax = normalizedScores.reduce((sum, s) => sum + s.max_points, 0);
  const passed = reussi === true || reussi === '1' || reussi === 1;
  const graderNote = String(note || '').trim();
  const scoreNote = `Examen ceinture noire · ${totalScore}/${totalMax}`;
  const finalNote = [scoreNote, graderNote].filter(Boolean).join(' · ');

  // Payload strict : ne jamais renvoyer des champs UI (ex. exam) vers Supabase
  const patch = {
    scores: normalizedScores,
    total_score: totalScore,
    total_max: totalMax,
    reussi: passed,
    graded_at: new Date().toISOString(),
    graded_by: user?.id || null,
    graded_by_name: actorLabel(user),
  };

  let updated = { ...submission, ...patch };
  delete updated.exam;

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('judoka_grade_exam_submissions')
        .update(patch)
        .eq('id', submission.id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) updated = data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('judoka_grade_exam_submissions grade fallback JSON:', err.message);
      const list = readJson(submissionsPath);
      const idx = list.findIndex((s) => String(s.id) === String(submission.id));
      if (idx === -1) {
        // Soumission déjà en Supabase mais table/colonne partielle : on continue avec le patch mémoire
        updated = { ...submission, ...patch };
        delete updated.exam;
      } else {
        list[idx] = { ...list[idx], ...patch };
        writeJson(submissionsPath, list);
        updated = list[idx];
      }
    }
  } else {
    const list = readJson(submissionsPath);
    const idx = list.findIndex((s) => String(s.id) === String(submission.id));
    if (idx === -1) throw new Error('Réponses introuvables');
    list[idx] = { ...list[idx], ...patch };
    writeJson(submissionsPath, list);
    updated = list[idx];
  }

  if (submission.request_id) {
    const request = await getGradeRequestById(submission.request_id);
    if (request && request.statut === 'pending') {
      if (passed) {
        await approveGradeRequest(submission.request_id, user, {
          instructeur_nom: exam.instructeur_nom,
          points: totalScore,
          note: finalNote,
          applyGradeChange,
        });
      } else {
        await rejectGradeRequest(
          submission.request_id,
          user,
          graderNote || 'Échec à l\'examen ceinture noire'
        );
        await addGradeHistory({
          judoka_id: submission.judoka_id,
          grade_from: submission.grade_from,
          grade_to: submission.grade_to,
          reussi: false,
          instructeur_nom: exam.instructeur_nom,
          points: totalScore,
          note: finalNote || 'Échec à l\'examen - ceinture inchangée',
          changed_by: user?.id || null,
          changed_by_name: actorLabel(user),
        });
      }
    }
  }

  return updated;
}

export async function listGradeExamSubmissionsWithExam({ federationId = null } = {}) {
  const exams = await listGradeExams({ federationId });
  const out = [];
  for (const exam of exams) {
    const submissions = await getExamSubmissions(exam.id);
    for (const submission of submissions) {
      out.push({
        ...submission,
        exam: {
          id: exam.id,
          token: exam.token,
          instructeur_nom: exam.instructeur_nom,
          questions: exam.questions,
          statut: exam.statut,
          created_at: exam.created_at,
        },
      });
    }
  }
  return out.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

export async function publicExamSummary(exam) {
  if (!exam) return null;
  let federation_nom_profil = 'Fight Management';
  if (exam.federation_id) {
    try {
      const fed = await getFederationById(exam.federation_id);
      federation_nom_profil = String(fed?.nom_profil || fed?.nom || '').trim() || 'Fight Management';
    } catch {
      federation_nom_profil = 'Fight Management';
    }
  }
  return {
    token: exam.token,
    statut: exam.statut,
    instructeur_nom: exam.instructeur_nom,
    questions_count: (exam.questions || []).length,
    athletes_count: (exam.athletes || []).length,
    closed: exam.statut === 'closed',
    federation_nom_profil,
  };
}
