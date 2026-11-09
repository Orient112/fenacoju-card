import { useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import { lookupGradeExamAthlete, submitGradeExamAnswers } from '../api';

export default function GradeExamPublicPage({ token }) {
  const [step, setStep] = useState('id'); // id | quiz | done | closed
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
      if (/plus accessible|n.est plus accessible|ferm[eé]/i.test(msg)) {
        setStep('closed');
      }
      setError(msg);
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
      if (/plus accessible|n.est plus accessible|ferm[eé]/i.test(msg)) {
        setStep('closed');
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'closed') {
    return (
      <div className="grade-exam-public">
        <div className="grade-exam-public-card">
          <h1>Lien de Test indisponible</h1>
          <p>
            Ce lien n&apos;est plus accessible : tous les athlètes sélectionnés ont confirmé leur examen.
          </p>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="grade-exam-public">
        <div className="grade-exam-public-card">
          <h1>Réponses envoyées</h1>
          <p>
            Merci {athlete?.judoka_prenom} {athlete?.judoka_nom}. Vos réponses ont été transmises
            au Responsable Grade pour notation.
          </p>
        </div>
      </div>
    );
  }

  if (loading && step === 'id') {
    return <BrandLoader label="Vérification…" />;
  }

  return (
    <div className="grade-exam-public">
      <div className="grade-exam-public-card">
        <h1>Lien de Test — Ceinture noire</h1>
        {step === 'id' && (
          <>
            <p className="form-hint">
              Saisissez votre ID unique (n° de carte) pour ouvrir le questionnaire d&apos;examen.
            </p>
            <form onSubmit={handleLookup} className="grade-exam-id-form">
              <label className="form-field">
                <span>ID unique</span>
                <input
                  type="text"
                  value={numeroCarte}
                  onChange={(e) => setNumeroCarte(e.target.value)}
                  required
                  autoFocus
                  placeholder="N° de carte"
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="btn btn-demande-grade" disabled={loading}>
                Ouvrir le questionnaire
              </button>
            </form>
          </>
        )}

        {step === 'quiz' && exam && athlete && (
          <form onSubmit={handleSubmit} className="grade-exam-quiz-form">
            <p>
              <strong>
                {athlete.judoka_prenom} {athlete.judoka_nom}
              </strong>
              {athlete.judoka_numero_carte ? ` · ID ${athlete.judoka_numero_carte}` : ''}
            </p>
            <p className="form-hint">
              Instructeur : {exam.instructeur_nom}
              {' · '}
              {athlete.grade_from} → {athlete.grade_to}
            </p>
            <ul className="exam-questions-list">
              {questions.map((q, index) => (
                <li key={q.id} className="exam-question-row">
                  <label className="form-field exam-question-text">
                    <span>
                      Question {index + 1}
                      {q.max_points != null ? ` (${q.max_points} pts)` : ''}
                    </span>
                    <p className="exam-question-prompt">{q.text}</p>
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      required
                      rows={3}
                      placeholder="Votre réponse"
                    />
                  </label>
                </li>
              ))}
            </ul>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="btn btn-demande-grade" disabled={loading}>
              {loading ? 'Envoi…' : 'Confirmer et envoyer'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
