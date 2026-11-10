import { useMemo, useState } from 'react';
import { gradeExamSubmission } from '../api';

export default function GradeExamAnswersModal({
  exam,
  submission,
  onClose,
  onResolved,
  showToast,
}) {
  const questions = exam?.questions || [];
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState(() => {
    const init = {};
    for (const q of questions) {
      const existing = (submission?.scores || []).find((s) => String(s.question_id) === String(q.id));
      init[q.id] = existing?.points ?? '';
    }
    return init;
  });

  const athleteLabel = useMemo(
    () => `${submission?.judoka_prenom || ''} ${submission?.judoka_nom || ''}`.trim() || 'Athlète',
    [submission]
  );

  const answerFor = (questionId) => {
    const found = (submission?.answers || []).find((a) => String(a.question_id) === String(questionId));
    return found?.answer || '';
  };

  const handleResolve = async (reussi) => {
    if (!exam?.id || !submission?.id || busy) return;
    setBusy(true);
    try {
      const payloadScores = questions.map((q) => ({
        question_id: q.id,
        points: scores[q.id],
      }));
      await gradeExamSubmission(exam.id, submission.id, {
        scores: payloadScores,
        reussi,
        note,
      });
      showToast?.(
        reussi
          ? `Passation réussie : ${athleteLabel} → ${submission.grade_to}`
          : `Test non réussi : ${athleteLabel} conserve ${submission.grade_from}`
      );
      onResolved?.();
      onClose?.();
    } catch (err) {
      showToast?.(err.message || 'Traitement impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!exam || !submission) return null;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="transfer-modal grade-exam-answers-modal" onClick={(e) => e.stopPropagation()}>
        <header className="competition-params-modal-head">
          <div>
            <h3>Réponses - {athleteLabel}</h3>
            <p className="form-hint">
              {submission.grade_from} → {submission.grade_to}
              {submission.judoka_numero_carte ? ` · ID ${submission.judoka_numero_carte}` : ''}
            </p>
            <p className="grade-exam-instructeur" style={{ marginTop: '0.35rem' }}>
              Instructeur : <strong>{exam.instructeur_nom}</strong>
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <ul className="grade-exam-review-list">
          {questions.map((q, index) => (
            <li key={q.id} className="grade-exam-review-item">
              <div className="grade-exam-quiz-item-head">
                <span className="grade-exam-quiz-index">Question {index + 1}</span>
                <span className="grade-exam-quiz-points">/{q.max_points} pts</span>
              </div>
              <p className="grade-exam-quiz-prompt">{q.text}</p>
              <div className="grade-exam-review-answer">
                <span className="grade-exam-review-label">Réponse de l&apos;athlète</span>
                <p>{answerFor(q.id) || '-'}</p>
              </div>
              <label className="form-field exam-question-points">
                <span>Note / correction</span>
                <input
                  type="number"
                  min="0"
                  max={q.max_points}
                  step="0.5"
                  value={scores[q.id]}
                  onChange={(e) => setScores((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
              </label>
            </li>
          ))}
        </ul>

        <label className="form-field">
          <span>Note du Responsable Grade</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Commentaire, observations, décision…"
          />
        </label>

        <footer className="grade-exam-answers-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => handleResolve(false)}
          >
            {busy ? 'Traitement…' : 'Rejeter'}
          </button>
          <button
            type="button"
            className="btn btn-demande-grade"
            disabled={busy}
            onClick={() => handleResolve(true)}
          >
            {busy ? 'Traitement…' : 'Passer'}
          </button>
        </footer>
      </div>
    </div>
  );
}
