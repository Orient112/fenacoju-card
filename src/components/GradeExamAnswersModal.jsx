import { useMemo, useState } from 'react';
import { gradeExamSubmission } from '../api';

function isUnansweredAnswer(entry) {
  if (!entry) return true;
  if (entry.unanswered === true) return true;
  const text = String(entry.answer || '').trim();
  if (!text) return true;
  return /non\s*r[eé]pondu|sans\s*r[eé]ponse|temps\s*[eé]coul[eé]|échec\s*\(\s*vide\s*\)|^vide$/i.test(text);
}

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
  const [pratiquePoints, setPratiquePoints] = useState(
    () => (submission?.pratique_score != null ? String(submission.pratique_score) : '')
  );
  const [pratiqueMax, setPratiqueMax] = useState(
    () => (submission?.pratique_max != null ? String(submission.pratique_max) : '')
  );
  const [verdicts, setVerdicts] = useState(() => {
    const init = {};
    for (const q of questions) {
      const answerEntry = (submission?.answers || []).find((a) => String(a.question_id) === String(q.id));
      const existing = (submission?.scores || []).find((s) => String(s.question_id) === String(q.id));
      if (isUnansweredAnswer(answerEntry)) init[q.id] = 'faux';
      else if (existing && Number(existing.points) === 0) init[q.id] = 'faux';
      else if (existing && existing.points !== '' && existing.points != null) init[q.id] = 'vrai';
      else init[q.id] = null;
    }
    return init;
  });
  const [scores, setScores] = useState(() => {
    const init = {};
    for (const q of questions) {
      const answerEntry = (submission?.answers || []).find((a) => String(a.question_id) === String(q.id));
      const existing = (submission?.scores || []).find((s) => String(s.question_id) === String(q.id));
      if (isUnansweredAnswer(answerEntry)) init[q.id] = 0;
      else init[q.id] = existing?.points ?? '';
    }
    return init;
  });

  const athleteLabel = useMemo(
    () => `${submission?.judoka_prenom || ''} ${submission?.judoka_nom || ''}`.trim() || 'Athlète',
    [submission]
  );

  const scoreSummary = useMemo(() => {
    let theoryTotal = 0;
    let theoryMax = 0;
    for (const q of questions) {
      theoryMax += Number(q.max_points) || 0;
      if (verdicts[q.id] === 'faux') theoryTotal += 0;
      else if (verdicts[q.id] === 'vrai') theoryTotal += Number(scores[q.id]) || 0;
    }
    const pratiqueScore = Number(pratiquePoints);
    const pratiqueCeiling = Number(pratiqueMax);
    const pratiqueOk = pratiquePoints !== '' && !Number.isNaN(pratiqueScore);
    const pratiqueMaxOk = pratiqueMax !== '' && !Number.isNaN(pratiqueCeiling) && pratiqueCeiling >= 0;
    const pratiqueValue = pratiqueOk ? Math.max(0, pratiqueScore) : 0;
    const pratiqueMaxValue = pratiqueMaxOk ? Math.max(0, pratiqueCeiling) : 0;
    const total = theoryTotal + pratiqueValue;
    const max = theoryMax + pratiqueMaxValue;
    return {
      theoryTotal,
      theoryMax,
      pratiqueValue,
      pratiqueMaxValue,
      pratiqueReady: pratiqueOk && pratiqueMaxOk,
      total,
      max,
      half: max / 2,
    };
  }, [questions, scores, verdicts, pratiquePoints, pratiqueMax]);

  const answerEntryFor = (questionId) => (
    (submission?.answers || []).find((a) => String(a.question_id) === String(questionId)) || null
  );

  const answerFor = (questionId) => {
    const found = answerEntryFor(questionId);
    return found?.answer || '';
  };

  const setVerdict = (questionId, verdict) => {
    if (isUnansweredAnswer(answerEntryFor(questionId)) && verdict === 'vrai') return;
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

    if (!scoreSummary.pratiqueReady) {
      showToast?.('Saisissez les points de pratique (obtenus et barème max).', 'error');
      return;
    }
    if (scoreSummary.pratiqueValue > scoreSummary.pratiqueMaxValue) {
      showToast?.('Les points de pratique ne peuvent pas dépasser le barème max.', 'error');
      return;
    }

    if (reussi && scoreSummary.total < scoreSummary.half) {
      showToast?.(
        `Score insuffisant : ${scoreSummary.total}/${scoreSummary.max}. Il faut au moins ${scoreSummary.half} points (moitié) pour Passer.`,
        'error'
      );
      return;
    }

    setBusy(true);
    try {
      const payloadScores = questions.map((q) => ({
        question_id: q.id,
        points: verdicts[q.id] === 'faux' ? 0 : scores[q.id],
      }));
      await gradeExamSubmission(exam.id, submission.id, {
        scores: payloadScores,
        pratique_score: scoreSummary.pratiqueValue,
        pratique_max: scoreSummary.pratiqueMaxValue,
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
            {submission?.timed_out ? (
              <p className="grade-exam-timeout-badge">Examen clos automatiquement - temps écoulé</p>
            ) : null}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="grade-exam-theory-label">Partie théorique</div>
        <ul className="grade-exam-review-list">
          {questions.map((q, index) => {
            const verdict = verdicts[q.id];
            const unanswered = isUnansweredAnswer(answerEntryFor(q.id));
            return (
              <li key={q.id} className={`grade-exam-review-item ${unanswered ? 'is-unanswered' : ''}`}>
                <div className="grade-exam-quiz-item-head">
                  <span className="grade-exam-quiz-index">Question {index + 1}</span>
                  <span className="grade-exam-quiz-points">/{q.max_points} pts</span>
                </div>
                <p className="grade-exam-quiz-prompt">{q.text}</p>
                <div className="grade-exam-review-answer">
                  <span className="grade-exam-review-label">Réponse de l&apos;athlète</span>
                  <p>{answerFor(q.id) || '-'}</p>
                  {unanswered ? (
                    <span className="grade-exam-unanswered-chip">Non répondu - échec (Vide)</span>
                  ) : null}
                </div>
                <div className="grade-exam-correction-row">
                  <div className="grade-exam-verdict-btns">
                    <button
                      type="button"
                      className={`btn btn-sm grade-exam-verdict-btn ${verdict === 'vrai' ? 'is-vrai' : ''} ${unanswered ? 'is-disabled' : ''}`}
                      onClick={() => setVerdict(q.id, 'vrai')}
                      disabled={unanswered}
                      title={unanswered ? 'Question non répondue - Vrai indisponible' : 'Réponse correcte'}
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
                  {verdict === 'vrai' && !unanswered && (
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
                  {(verdict === 'faux' || unanswered) && (
                    <span className="grade-exam-score-zero">Note : 0 / {q.max_points}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="grade-exam-pratique-block">
          <div className="grade-exam-pratique-head">
            <h4>Partie pratique</h4>
            <p>Saisissez les points obtenus par l&apos;athlète à la pratique.</p>
          </div>
          <div className="grade-exam-pratique-fields">
            <label className="exam-field">
              <span className="exam-field-label">Points obtenus</span>
              <input
                className="exam-field-control"
                type="number"
                min="0"
                step="0.5"
                value={pratiquePoints}
                onChange={(e) => setPratiquePoints(e.target.value)}
                placeholder="0"
                required
              />
            </label>
            <label className="exam-field">
              <span className="exam-field-label">Barème max</span>
              <input
                className="exam-field-control"
                type="number"
                min="0"
                step="0.5"
                value={pratiqueMax}
                onChange={(e) => setPratiqueMax(e.target.value)}
                placeholder="Ex. 50"
                required
              />
            </label>
          </div>
        </div>

        <p className="form-hint grade-exam-score-hint">
          Théorie : {scoreSummary.theoryTotal}/{scoreSummary.theoryMax}
          {' · '}
          Pratique : {scoreSummary.pratiqueReady ? `${scoreSummary.pratiqueValue}/${scoreSummary.pratiqueMaxValue}` : '-/-'}
          {' · '}
          Total : {scoreSummary.total}/{scoreSummary.max} pts
          {scoreSummary.max > 0
            ? ` · Seuil pour Passer : ${scoreSummary.half} pts (moitié)`
            : ''}
        </p>

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
            disabled={busy || (scoreSummary.max > 0 && scoreSummary.total < scoreSummary.half)}
            onClick={() => handleResolve(true)}
            title={
              scoreSummary.max > 0 && scoreSummary.total < scoreSummary.half
                ? `Il faut au moins ${scoreSummary.half} points`
                : 'Valider la ceinture supérieure'
            }
          >
            {busy ? 'Traitement…' : 'Passer'}
          </button>
        </footer>
      </div>
    </div>
  );
}
