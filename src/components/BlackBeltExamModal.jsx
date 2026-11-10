import { useMemo, useState } from 'react';
import { createGradeExam, gradeExamTestUrl } from '../api';

function emptyQuestion() {
  return { id: `q${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: '', max_points: 10 };
}

export default function BlackBeltExamModal({ athletes = [], onClose, onCreated, showToast }) {
  const [instructeur, setInstructeur] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [chronometreEnabled, setChronometreEnabled] = useState(false);
  const [chronometreMinutes, setChronometreMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [createdExam, setCreatedExam] = useState(null);

  const testUrl = useMemo(
    () => (createdExam?.token ? gradeExamTestUrl(createdExam.token) : ''),
    [createdExam]
  );

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.max_points) || 0), 0),
    [questions]
  );
  const seuilPoints = totalPoints > 0 ? Math.ceil(totalPoints / 2) : 0;

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
        chronometre_enabled: chronometreEnabled,
        chronometre_minutes: chronometreEnabled ? Number(chronometreMinutes) || 30 : null,
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
      showToast?.('Examen créé - partagez le Lien de Test');
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
      <div className="black-belt-exam-modal is-refined" onClick={(e) => e.stopPropagation()}>
        <header className="black-belt-exam-head">
          <div>
            <p className="black-belt-exam-kicker">Ceinture noire</p>
            <h3>Examen</h3>
            <p className="black-belt-exam-subtitle">
              {createdExam
                ? 'Examen prêt à partager'
                : 'Paramétrez le questionnaire puis générez le Lien de Test'}
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="black-belt-exam-body">
          <div className="black-belt-exam-summary">
            <div className="black-belt-exam-stat">
              <strong>{athletes.length}</strong>
              <span>Athlète{athletes.length > 1 ? 's' : ''}</span>
            </div>
            <div className="black-belt-exam-stat">
              <strong>{questions.length}</strong>
              <span>Question{questions.length > 1 ? 's' : ''}</span>
            </div>
            <div className="black-belt-exam-stat is-points">
              <strong>{totalPoints || '-'}</strong>
              <span>{seuilPoints > 0 ? `Seuil ${seuilPoints} pts` : 'Total points'}</span>
            </div>
          </div>

          {!createdExam ? (
            <form onSubmit={handleCreate} className="black-belt-exam-form">
              <section className="black-belt-exam-panel">
                <h4>Instructeur</h4>
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

                <div className="exam-chrono-block">
                  <label className="exam-chrono-toggle">
                    <input
                      type="checkbox"
                      checked={chronometreEnabled}
                      onChange={(e) => setChronometreEnabled(e.target.checked)}
                    />
                    <span>Chronométrer l&apos;examen</span>
                  </label>
                  {chronometreEnabled && (
                    <label className="form-field exam-chrono-minutes">
                      <span>Durée (minutes)</span>
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={chronometreMinutes}
                        onChange={(e) => setChronometreMinutes(e.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>
              </section>

              <section className="black-belt-exam-panel">
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
                      <div className="exam-question-index" aria-hidden="true">{index + 1}</div>
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
                          className="btn btn-outline btn-sm exam-question-remove"
                          onClick={() => removeQuestion(q.id)}
                        >
                          Retirer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="black-belt-exam-panel">
                <h4>Athlètes sélectionnés</h4>
                {athletes.length === 0 ? (
                  <div className="black-belt-exam-empty">Aucun athlète sélectionné.</div>
                ) : (
                  <ul className="exam-athletes-list">
                    {athletes.map((a) => (
                      <li key={a.id} className="exam-athlete-item">
                        <div>
                          <strong>
                            {a.judoka_prenom} {a.judoka_nom}
                          </strong>
                          <small>
                            {a.judoka_numero_carte ? `ID ${a.judoka_numero_carte}` : 'Sans ID'}
                            {a.judoka_club ? ` · ${a.judoka_club}` : ''}
                          </small>
                        </div>
                        <span className="exam-athlete-grade">
                          {a.grade_from} → {a.grade_to}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <footer className="black-belt-exam-actions">
                <button type="button" className="btn btn-outline" onClick={onClose}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-demande-grade" disabled={busy || athletes.length === 0}>
                  {busy ? 'Création…' : 'Créer l\'examen'}
                </button>
              </footer>
            </form>
          ) : (
            <div className="black-belt-exam-link-block">
              <div className="black-belt-exam-ready-card">
                <p className="black-belt-exam-ready-title">L&apos;examen est prêt</p>
                <p className="black-belt-exam-ready-text">
                  Partagez le Lien de Test aux athlètes sélectionnés.
                  Le lien disparaîtra dès que tous auront confirmé leurs réponses.
                </p>
                {createdExam.chronometre_enabled ? (
                  <span className="black-belt-exam-ready-chip">
                    Chronométré : {createdExam.chronometre_minutes || chronometreMinutes} min
                  </span>
                ) : (
                  <span className="black-belt-exam-ready-chip is-muted">Sans chronomètre</span>
                )}
              </div>
              <div className="exam-link-box">
                <span className="exam-link-label">Lien de Test</span>
                <p className="exam-link-url">{testUrl}</p>
              </div>
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
    </div>
  );
}
