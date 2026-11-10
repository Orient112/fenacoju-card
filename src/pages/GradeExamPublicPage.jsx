import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import { fetchPublicGradeExam, lookupGradeExamAthlete, submitGradeExamAnswers } from '../api';

const UNANSWERED_TIMEOUT_MARKER = 'Non répondu - temps écoulé';

function formatTimer(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function GradeExamPublicPage({ token }) {
  const [step, setStep] = useState('id'); // id | quiz | done | closed | already
  const [numeroCarte, setNumeroCarte] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exam, setExam] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [answers, setAnswers] = useState({});
  const [federationNomProfil, setFederationNomProfil] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const autoSubmitRef = useRef(false);
  const answersRef = useRef(answers);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const questions = useMemo(() => exam?.questions || [], [exam]);
  const brandLabel = useMemo(() => {
    const profil = String(exam?.federation_nom_profil || federationNomProfil || '').trim()
      || 'Nom Profil Fédération';
    return `Fight Management / ${profil}`;
  }, [exam, federationNomProfil]);

  useEffect(() => {
    let cancelled = false;
    fetchPublicGradeExam(token)
      .then((data) => {
        if (cancelled) return;
        if (data?.federation_nom_profil) setFederationNomProfil(data.federation_nom_profil);
        if (data?.closed) setStep('closed');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const buildAnswersPayload = useCallback((forceTimedOut = false) => {
    const current = answersRef.current || {};
    return questions.map((q) => {
      const raw = String(current[q.id] || '').trim();
      if (forceTimedOut && !raw) {
        return {
          question_id: q.id,
          answer: UNANSWERED_TIMEOUT_MARKER,
          unanswered: true,
        };
      }
      return {
        question_id: q.id,
        answer: raw,
        unanswered: !raw,
      };
    });
  }, [questions]);

  const submitAnswers = useCallback(async ({ forceTimedOut = false } = {}) => {
    await submitGradeExamAnswers(token, {
      numero_carte: athlete?.judoka_numero_carte || numeroCarte,
      answers: buildAnswersPayload(forceTimedOut),
      timed_out: Boolean(forceTimedOut),
    });
    if (forceTimedOut) setTimedOut(true);
    setStep('done');
  }, [athlete, buildAnswersPayload, numeroCarte, token]);

  useEffect(() => {
    if (step !== 'quiz' || !exam?.chronometre_enabled || !exam?.chronometre_minutes) {
      setSecondsLeft(null);
      autoSubmitRef.current = false;
      return undefined;
    }
    const total = Math.max(1, Number(exam.chronometre_minutes) || 30) * 60;
    setSecondsLeft(total);
    autoSubmitRef.current = false;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step, exam?.chronometre_enabled, exam?.chronometre_minutes]);

  useEffect(() => {
    if (secondsLeft !== 0 || step !== 'quiz') return undefined;
    if (autoSubmitRef.current) return undefined;
    autoSubmitRef.current = true;

    let cancelled = false;
    (async () => {
      setTimedOut(true);
      setLoading(true);
      setError('');
      try {
        await submitAnswers({ forceTimedOut: true });
      } catch (err) {
        if (!cancelled) {
          autoSubmitRef.current = false;
          setError(err.message || 'Temps écoulé - envoi impossible');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [secondsLeft, step, submitAnswers]);

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await lookupGradeExamAthlete(token, numeroCarte.trim());
      setExam(data.exam);
      setAthlete(data.athlete);
      const init = {};
      for (const q of data.exam?.questions || []) init[q.id] = '';
      setAnswers(init);
      setTimedOut(false);
      autoSubmitRef.current = false;
      setStep('quiz');
    } catch (err) {
      const msg = err.message || 'Accès impossible';
      if (/déjà confirmé|deja confirme|déjà envoyé|deja envoye/i.test(msg)) {
        setStep('already');
        setError(msg);
      } else if (/plus accessible|n.est plus accessible|ferm[eé]/i.test(msg)) {
        setStep('closed');
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (timedOut || loading || autoSubmitRef.current) return;
    setError('');
    setLoading(true);
    try {
      await submitAnswers({ forceTimedOut: false });
    } catch (err) {
      const msg = err.message || 'Envoi impossible';
      if (/déjà confirmé|deja confirme/i.test(msg)) {
        setStep('already');
      } else if (/plus accessible|n.est plus accessible|ferm[eé]/i.test(msg)) {
        setStep('closed');
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loading && step === 'id') {
    return <BrandLoader label="Vérification…" />;
  }

  return (
    <div className="grade-exam-public">
      <div className="grade-exam-public-shell">
        {step === 'done' ? (
          <div className="grade-exam-public-card">
            <div className={`grade-exam-public-state ${timedOut ? 'is-timeout' : 'is-success'}`}>
              <h1>{timedOut ? 'Temps écoulé - examen terminé' : 'Réponses envoyées'}</h1>
              <p className="grade-exam-done-text">
                <strong className="grade-exam-done-name">
                  {athlete?.judoka_prenom} {athlete?.judoka_nom}
                </strong>
                <span className="grade-exam-done-msg">
                  {timedOut
                    ? 'Le temps imparti est terminé. Les questions non répondues sont enregistrées comme échec (Vide).'
                    : 'Vos réponses ont été transmises au Responsable Grade'}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <div className="grade-exam-public-card">
            {(step === 'id' || step === 'quiz') && (
              <header className="grade-exam-public-header">
                <p className="grade-exam-public-kicker">{brandLabel}</p>
                <h1>Test - Ceinture noire</h1>
                {step === 'id' && (
                  <p className="grade-exam-public-lead">
                    Saisissez votre ID unique pour accéder au questionnaire d&apos;examen.
                  </p>
                )}
              </header>
            )}

            {step === 'closed' && (
              <div className="grade-exam-public-state">
                <h1>Test indisponible</h1>
                <p>
                  Ce lien n&apos;est plus accessible : tous les athlètes sélectionnés ont confirmé leur examen.
                </p>
                {error ? <p className="form-error">{error}</p> : null}
              </div>
            )}

            {step === 'already' && (
              <div className="grade-exam-public-state">
                <h1>Accès fermé</h1>
                <p>
                  Vous avez déjà confirmé et envoyé vos réponses. Il n&apos;est plus possible
                  d&apos;ouvrir ni de modifier ce questionnaire.
                </p>
                {error ? <p className="form-error">{error}</p> : null}
              </div>
            )}

            {step === 'id' && (
              <form onSubmit={handleLookup} className="grade-exam-id-form">
                <label className="grade-exam-id-field">
                  <span>ID unique (n° de carte)</span>
                  <input
                    type="text"
                    value={numeroCarte}
                    onChange={(e) => setNumeroCarte(e.target.value)}
                    required
                    autoFocus
                    placeholder="Ex. FC-2026-00123"
                    autoComplete="off"
                  />
                </label>
                {error ? <p className="form-error">{error}</p> : null}
                <button type="submit" className="btn btn-demande-grade grade-exam-primary-btn" disabled={loading}>
                  {loading ? 'Vérification…' : 'Ouvrir le questionnaire'}
                </button>
              </form>
            )}

            {step === 'quiz' && exam && athlete && (
              <form onSubmit={handleSubmit} className="grade-exam-quiz-form">
                {exam.chronometre_enabled && secondsLeft != null && (
                  <div className={`grade-exam-timer ${secondsLeft <= 60 ? 'is-urgent' : ''}`}>
                    Temps restant : {formatTimer(secondsLeft)}
                  </div>
                )}
                {timedOut && (
                  <p className="form-hint grade-exam-timeout-hint">
                    Temps écoulé - envoi automatique des réponses…
                  </p>
                )}
                <div className="grade-exam-athlete-card is-blue">
                  <p className="grade-exam-athlete-name">
                    {athlete.judoka_prenom} {athlete.judoka_nom}
                  </p>
                  <p className="grade-exam-athlete-belts">
                    {athlete.grade_from || '-'} → {athlete.grade_to || '-'}
                  </p>
                  {athlete.judoka_numero_carte ? (
                    <p className="grade-exam-athlete-id">ID {athlete.judoka_numero_carte}</p>
                  ) : null}
                  <p className="grade-exam-instructeur">
                    Instructeur : <strong>{exam.instructeur_nom}</strong>
                  </p>
                </div>

                <ul className="grade-exam-quiz-list">
                  {questions.map((q, index) => (
                    <li key={q.id} className="grade-exam-quiz-item">
                      <div className="grade-exam-quiz-item-head">
                        <span className="grade-exam-quiz-index">Question {index + 1}</span>
                        {q.max_points != null ? (
                          <span className="grade-exam-quiz-points">{q.max_points} pts</span>
                        ) : null}
                      </div>
                      <p className="grade-exam-quiz-prompt">{q.text}</p>
                      <textarea
                        className="grade-exam-quiz-answer is-compact"
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        required={!timedOut}
                        rows={2}
                        placeholder="Écrivez votre réponse ici…"
                        disabled={timedOut || loading}
                        readOnly={timedOut || loading}
                      />
                    </li>
                  ))}
                </ul>

                {error ? <p className="form-error">{error}</p> : null}
                <button
                  type="submit"
                  className="btn btn-demande-grade grade-exam-primary-btn"
                  disabled={loading || timedOut}
                >
                  {loading ? 'Envoi…' : 'Confirmer et envoyer'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
