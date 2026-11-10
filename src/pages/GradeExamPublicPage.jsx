import { useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import { lookupGradeExamAthlete, submitGradeExamAnswers } from '../api';

export default function GradeExamPublicPage({ token }) {
  const [step, setStep] = useState('id'); // id | quiz | done | closed | already
  const [numeroCarte, setNumeroCarte] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exam, setExam] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [answers, setAnswers] = useState({});

  const questions = useMemo(() => exam?.questions || [], [exam]);

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
    setError('');
    setLoading(true);
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        answer: String(answers[q.id] || '').trim(),
      }));
      await submitGradeExamAnswers(token, {
        numero_carte: athlete?.judoka_numero_carte || numeroCarte,
        answers: payload,
      });
      setStep('done');
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
        <div className="grade-exam-public-card">
          {(step === 'id' || step === 'quiz') && (
            <header className="grade-exam-public-header">
              <p className="grade-exam-public-kicker">Fenacoju Card</p>
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

          {step === 'done' && (
            <div className="grade-exam-public-state is-success">
              <h1>Réponses envoyées</h1>
              <p>
                Merci {athlete?.judoka_prenom} {athlete?.judoka_nom}. Vos réponses ont été transmises
                au Responsable Grade. Votre accès à ce test est désormais fermé.
              </p>
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
              <div className="grade-exam-athlete-card">
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
                      className="grade-exam-quiz-answer"
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      required
                      rows={4}
                      placeholder="Écrivez votre réponse ici…"
                    />
                  </li>
                ))}
              </ul>

              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="btn btn-demande-grade grade-exam-primary-btn" disabled={loading}>
                {loading ? 'Envoi…' : 'Confirmer et envoyer'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
