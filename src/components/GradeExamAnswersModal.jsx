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
  const [verdicts, setVerdicts] = useState(() => {
    const init = {};
    for (const q of questions) {
      const existing = (submission?.scores || []).find((s) => String(s.question_id) === String(q.id));
      if (existing && Number(existing.points) === 0) init[q.id] = 'faux';
      else if (existing && existing.points !== '' && existing.points != null) init[q.id] = 'vrai';
      else init[q.id] = null;
    }
    return init;
  });
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

  const setVerdict = (questionId, verdict) => {
    setVerdicts((prev) => ({ ...prev, [questionId]: verdict }));
    if (verdict === 'faux') {
      setScores((prev) => ({ ...prev, [questionId]: 0 }));
    } else if (verdict === 'vrai') {
      setScores((prev) => ({
        ...prev,
        [questionId]: prev[questionId] === 0 || prev[questionId] === '0' ? '' : prev[questionId],
      }));
    }
  };

  const handleResolve = async (reussi) => {
    if (!exam?.id || !submission?.id || busy) return;
    for (const q of questions) {
      if (!verdicts[q.id]) {
        showToast?.(`Indiquez Vrai ou Faux pour la question : ${q.text}`, 'error');
        return;
      }
      if (verdicts[q.id] === 'vrai') {
        const pts = Number(scores[q.id]);
        if (scores[q.id] === '' || Number.isNaN(pts)) {
          showToast?.(`Saisissez la note pour la question : ${q.text}`, 'error');
          return;
        }
      }
    }

    setBusy(true);
    try {
      const payloadScores = questions.map((q) => ({
        question_id: q.id,
        points: verdicts[q.id] === 'faux' ? 0 : scores[q.id],
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
      await onResolved?.();
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
      <div className="grade-exam-answers-modal" onClick={(e) => e.stopPropagation()}>
        <header className="grade-exam-answers-head">
          <div>
            <p className="grade-exam-answers-kicker">Correction d&apos;examen</p>
            <h3>Réponses - {athleteLabel}</h3>
            <p className="grade-exam-answers-meta">
              {submission.grade_from} → {submission.grade_to}
              {submission.judoka_numero_carte ? ` · ID ${submission.judoka_numero_carte}` : ''}
            </p>
            <p className="grade-exam-instructeur">
              Instructeur : <strong>{exam.instructeur_nom}</strong>
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <ul className="grade-exam-review-list">
          {questions.map((q, index) => {
            const verdict = verdicts[q.id];
            return (
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
                <div className="grade-exam-correction-row">
                  <span className="grade-exam-review-label">Note / correction</span>
                  <div className="grade-exam-verdict-btns">
                    <button
                      type="button"
                      className={`btn btn-sm grade-exam-verdict-btn ${verdict === 'vrai' ? 'is-vrai' : ''}`}
                      onClick={() => setVerdict(q.id, 'vrai')}
                    >
                      Vrai
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm grade-exam-verdict-btn ${verdict === 'faux' ? 'is-faux' : ''}`}
                      onClick={() => setVerdict(q.id, 'faux')}
                    >
                      Faux
                    </button>
                  </div>
                  {verdict === 'vrai' && (
                    <label className="grade-exam-score-field">
                      <span>Note / {q.max_points}</span>
                      <input
                        type="number"
                        min="0"
                        max={q.max_points}
                        step="0.5"
                        value={scores[q.id]}
                        onChange={(e) => setScores((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="0"
                      />
                    </label>
                  )}
                  {verdict === 'faux' && (
                    <span className="grade-exam-score-zero">Note : 0 / {q.max_points}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="grade-exam-responsable-note">
          <label>
            <span>Note du Responsable Grade</span>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Commentaire, observations, décision finale…"
            />
          </label>
        </div>

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
