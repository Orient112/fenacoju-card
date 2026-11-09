import { useEffect, useState } from 'react';
import { fetchGradeExamDetail, gradeExamSubmission } from '../api';

export default function GradeExamGradingPanel({ examId, onGraded, showToast }) {
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [draftScores, setDraftScores] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGradeExamDetail(examId);
      setExam(data.exam);
      setSubmissions(data.submissions || []);
      const next = {};
      for (const s of data.submissions || []) {
        const map = {};
        for (const q of data.exam?.questions || []) {
          const existing = (s.scores || []).find((x) => String(x.question_id) === String(q.id));
          map[q.id] = existing?.points ?? '';
        }
        next[s.id] = map;
      }
      setDraftScores(next);
    } catch (err) {
      showToast?.(err.message || 'Chargement impossible', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const setScore = (submissionId, questionId, value) => {
    setDraftScores((prev) => ({
      ...prev,
      [submissionId]: {
        ...(prev[submissionId] || {}),
        [questionId]: value,
      },
    }));
  };

  const handleGrade = async (submission, reussi) => {
    setBusyId(submission.id);
    try {
      const scores = (exam.questions || []).map((q) => ({
        question_id: q.id,
        points: draftScores[submission.id]?.[q.id],
      }));
      await gradeExamSubmission(examId, submission.id, { scores, reussi });
      showToast?.(
        reussi
          ? `Ceinture validée : ${submission.judoka_prenom} ${submission.judoka_nom} → ${submission.grade_to}`
          : `Résultat enregistré (non réussi) : ${submission.judoka_prenom} ${submission.judoka_nom}`
      );
      await load();
      onGraded?.();
    } catch (err) {
      showToast?.(err.message || 'Notation impossible', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="form-hint">Chargement des réponses…</p>;
  if (!exam) return <p className="form-hint">Examen introuvable.</p>;

  const submittedIds = new Set(submissions.map((s) => String(s.judoka_id)));
  const pendingAthletes = (exam.athletes || []).filter((a) => !submittedIds.has(String(a.judoka_id)));

  return (
    <div className="grade-exam-grading">
      <p className="form-hint">
        Instructeur : {exam.instructeur_nom}
        {' · '}
        Statut : {exam.statut === 'closed' ? 'Fermé (tous ont répondu)' : 'Ouvert'}
        {' · '}
        {submissions.length}/{(exam.athletes || []).length} réponses
      </p>

      {pendingAthletes.length > 0 && (
        <p className="form-hint">
          En attente de confirmation :{' '}
          {pendingAthletes.map((a) => `${a.judoka_prenom} ${a.judoka_nom}`).join(', ')}
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="form-hint">Aucune réponse reçue pour le moment.</p>
      ) : (
        <ul className="transfer-list">
          {submissions.map((s) => (
            <li key={s.id} className="transfer-row grade-exam-submission-row">
              <div className="grade-exam-submission-body">
                <strong>
                  {s.judoka_prenom} {s.judoka_nom}
                  {s.judoka_numero_carte ? ` · ID ${s.judoka_numero_carte}` : ''}
                </strong>
                <small>
                  {s.grade_from} → {s.grade_to}
                  {s.submitted_at ? ` · ${new Date(s.submitted_at).toLocaleString('fr-FR')}` : ''}
                  {s.reussi === true ? ' · Réussi' : ''}
                  {s.reussi === false ? ' · Non réussi' : ''}
                  {s.total_score != null ? ` · ${s.total_score}/${s.total_max}` : ''}
                </small>

                {(exam.questions || []).map((q, index) => {
                  const answer = (s.answers || []).find((a) => String(a.question_id) === String(q.id));
                  return (
                    <div key={q.id} className="grade-exam-answer-block">
                      <p className="exam-question-prompt">
                        Q{index + 1}. {q.text}
                      </p>
                      <p className="form-hint">Réponse : {answer?.answer || '—'}</p>
                      <label className="form-field exam-question-points">
                        <span>Note / {q.max_points} pts</span>
                        <input
                          type="number"
                          min="0"
                          max={q.max_points}
                          step="0.5"
                          value={draftScores[s.id]?.[q.id] ?? ''}
                          onChange={(e) => setScore(s.id, q.id, e.target.value)}
                          disabled={s.reussi === true}
                        />
                      </label>
                    </div>
                  );
                })}

                {s.reussi == null && (
                  <div className="transfer-row-actions">
                    <button
                      type="button"
                      className="btn btn-demande-grade btn-sm"
                      disabled={busyId === s.id}
                      onClick={() => handleGrade(s, true)}
                    >
                      Valider ceinture
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId === s.id}
                      onClick={() => handleGrade(s, false)}
                    >
                      Non réussi
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
