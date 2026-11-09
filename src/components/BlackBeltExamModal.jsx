import { useMemo, useState } from 'react';
import { createGradeExam, gradeExamTestUrl } from '../api';

function emptyQuestion() {
  return { id: `q${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: '', max_points: 10 };
}

export default function BlackBeltExamModal({ athletes = [], onClose, onCreated, showToast }) {
  const [instructeur, setInstructeur] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [busy, setBusy] = useState(false);
  const [createdExam, setCreatedExam] = useState(null);

  const testUrl = useMemo(
    () => (createdExam?.token ? gradeExamTestUrl(createdExam.token) : ''),
    [createdExam]
  );

  const updateQuestion = (id, patch) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (id) => {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((q) => q.id !== id)));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const exam = await createGradeExam({
        instructeur_nom: instructeur,
        questions,
        athletes: athletes.map((a) => ({
          request_id: a.id,
          judoka_id: a.judoka_id,
          judoka_numero_carte: a.judoka_numero_carte,
          judoka_nom: a.judoka_nom,
          judoka_prenom: a.judoka_prenom,
          grade_from: a.grade_from,
          grade_to: a.grade_to,
          club: a.judoka_club,
        })),
        request_ids: athletes.map((a) => a.id),
      });
      setCreatedExam(exam);
      showToast?.('Examen créé — partagez le Lien de Test');
      onCreated?.(exam);
    } catch (err) {
      showToast?.(err.message || 'Création impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!testUrl) return;
    try {
      await navigator.clipboard.writeText(testUrl);
      showToast?.('Lien de Test copié');
    } catch {
      showToast?.('Impossible de copier le lien', 'error');
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="transfer-modal black-belt-exam-modal" onClick={(e) => e.stopPropagation()}>
        <header className="competition-params-modal-head">
          <div>
            <h3>Examen ceinture noire</h3>
            <p className="form-hint">
              {athletes.length} athlète{athletes.length > 1 ? 's' : ''} sélectionné
              {athletes.length > 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        {!createdExam ? (
          <form onSubmit={handleCreate} className="black-belt-exam-form">
            <label className="form-field">
              <span>Nom de l&apos;instructeur</span>
              <input
                type="text"
                value={instructeur}
                onChange={(e) => setInstructeur(e.target.value)}
                required
                placeholder="Nom complet"
              />
            </label>

            <div className="exam-questions-block">
              <div className="exam-questions-head">
                <h4>Questionnaires d&apos;examen</h4>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                >
                  Ajouter une question
                </button>
              </div>
              <ul className="exam-questions-list">
                {questions.map((q, index) => (
                  <li key={q.id} className="exam-question-row">
                    <label className="form-field exam-question-text">
                      <span>Question {index + 1}</span>
                      <textarea
                        value={q.text}
                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                        required
                        rows={2}
                        placeholder="Énoncé de la question"
                      />
                    </label>
                    <label className="form-field exam-question-points">
                      <span>Note / points</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={q.max_points}
                        onChange={(e) => updateQuestion(q.id, { max_points: e.target.value })}
                        required
                      />
                    </label>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => removeQuestion(q.id)}
                      >
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="exam-athletes-preview">
              <h4>Athlètes</h4>
              <ul>
                {athletes.map((a) => (
                  <li key={a.id}>
                    {a.judoka_prenom} {a.judoka_nom}
                    {a.judoka_numero_carte ? ` · ID ${a.judoka_numero_carte}` : ''}
                    {' · '}
                    {a.grade_from} → {a.grade_to}
                  </li>
                ))}
              </ul>
            </div>

            <footer className="black-belt-exam-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="btn btn-demande-grade" disabled={busy}>
                {busy ? 'Création…' : 'Créer l\'examen'}
              </button>
            </footer>
          </form>
        ) : (
          <div className="black-belt-exam-link-block">
            <p className="form-hint">
              L&apos;examen est prêt. Partagez le Lien de Test aux athlètes sélectionnés.
              Le lien disparaîtra dès que tous auront confirmé leurs réponses.
            </p>
            <p className="exam-link-url">{testUrl}</p>
            <div className="black-belt-exam-actions">
              <button type="button" className="btn btn-outline" onClick={copyLink}>
                Copier le lien
              </button>
              <a
                className="btn btn-lien-test"
                href={testUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Lien de Test
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
