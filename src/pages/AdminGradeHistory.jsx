import { useEffect, useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import { fetchGradeHistoryArchive, fetchGradeHistoryArchives } from '../api';

function groupArchiveAthletes(archive) {
  const submissions = (archive?.submissions || []).filter(
    (s) => s.reussi === true || s.reussi === false
  );
  const examsById = new Map((archive?.exams || []).map((e) => [String(e.id), e]));
  const byExam = new Map();

  for (const sub of submissions) {
    const examId = String(sub.exam_id || '');
    if (!examId) continue;
    if (!byExam.has(examId)) {
      const exam = examsById.get(examId) || {};
      byExam.set(examId, {
        id: examId,
        instructeur_nom: exam.instructeur_nom || '-',
        created_at: exam.created_at || sub.graded_at || sub.submitted_at,
        athletes: [],
        athletesSource: exam.athletes || [],
      });
    }
    const group = byExam.get(examId);
    const athleteMeta = (group.athletesSource || []).find(
      (a) => String(a.judoka_id) === String(sub.judoka_id)
    );
    group.athletes.push({
      ...sub,
      club: athleteMeta?.club || sub.judoka_club || '-',
    });
  }

  return [...byExam.values()]
    .map(({ athletesSource, ...g }) => g)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function linkPassationsToGroups(groups, history = []) {
  const remaining = [...(history || [])];
  const linkedGroups = groups.map((group) => {
    const athleteIds = new Set(
      (group.athletes || []).map((a) => String(a.judoka_id || '')).filter(Boolean)
    );
    const passations = [];
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const h = remaining[i];
      const judokaId = String(h.judoka_id || '');
      const matchesAthlete = judokaId && athleteIds.has(judokaId);
      const sameInstructeur = group.instructeur_nom
        && h.instructeur_nom
        && String(group.instructeur_nom).trim().toLowerCase() === String(h.instructeur_nom).trim().toLowerCase();
      if (matchesAthlete || (sameInstructeur && !judokaId)) {
        passations.unshift(h);
        remaining.splice(i, 1);
      }
    }
    return {
      ...group,
      passations: passations.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      ),
    };
  });

  return {
    linkedGroups,
    orphanPassations: remaining.sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    ),
  };
}

export default function AdminGradeHistory({ onToast }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archives, setArchives] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await fetchGradeHistoryArchives();
        if (!cancelled) setArchives(list);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Chargement impossible');
          onToast?.(err.message || 'Chargement impossible', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onToast]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const data = await fetchGradeHistoryArchive(selectedId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          onToast?.(err.message || 'Archive introuvable', 'error');
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, onToast]);

  const groups = useMemo(() => (detail ? groupArchiveAthletes(detail) : []), [detail]);
  const { linkedGroups, orphanPassations } = useMemo(
    () => linkPassationsToGroups(groups, detail?.grade_history || []),
    [groups, detail]
  );

  return (
    <div className="admin-grade-history">
      <header className="admin-grade-history-head">
        <div>
          <p className="admin-grade-history-kicker">Administration</p>
          <h2>Historique</h2>
          <p className="form-hint">
            Archives des passations ceinture noire réinitialisées par le Responsable Grade.
          </p>
        </div>
      </header>

      {loading ? (
        <BrandLoader label="Chargement…" />
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : archives.length === 0 ? (
        <p className="form-hint">Aucune archive pour le moment.</p>
      ) : (
        <div className="admin-grade-history-layout">
          <section className="admin-grade-history-list">
            <h3>Réinitialisations</h3>
            <ul>
              {archives.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`admin-grade-archive-btn ${selectedId === a.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <strong>
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString('fr-FR')
                        : 'Archive'}
                    </strong>
                    <small>
                      Par {a.reset_by_name || '-'}
                      {' · '}
                      {a.exams_count || 0} examen{(a.exams_count || 0) > 1 ? 's' : ''}
                      {' · '}
                      {a.submissions_count || 0} réponse{(a.submissions_count || 0) > 1 ? 's' : ''}
                      {' · '}
                      {a.history_count || 0} passation{(a.history_count || 0) > 1 ? 's' : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-grade-history-detail">
            {!selectedId ? (
              <p className="form-hint">Sélectionnez une archive pour voir le détail.</p>
            ) : detailLoading ? (
              <BrandLoader label="Chargement de l&apos;archive…" />
            ) : !detail ? (
              <p className="form-hint">Archive introuvable.</p>
            ) : (
              <>
                <header className="admin-grade-detail-head">
                  <div>
                    <h3>
                      Archive du{' '}
                      {detail.created_at
                        ? new Date(detail.created_at).toLocaleString('fr-FR')
                        : '-'}
                    </h3>
                    <p className="form-hint">
                      Réinitialisé par {detail.reset_by_name || '-'}
                    </p>
                  </div>
                </header>

                <div className="grade-requests-section">
                  <h4>Groupes d&apos;examen et passations liées</h4>
                  {linkedGroups.length === 0 && orphanPassations.length === 0 ? (
                    <p className="form-hint">Aucune donnée dans cette archive.</p>
                  ) : (
                    <ul className="transfer-list admin-grade-linked-list">
                      {linkedGroups.map((group) => (
                        <li key={group.id} className="transfer-row grade-exam-list-row admin-grade-linked-card">
                          <div className="admin-grade-linked-block">
                            <div className="grade-history-meta" style={{ marginBottom: '0.35rem' }}>
                              <span className="grade-history-chip is-exam">Groupe d&apos;examen</span>
                              {group.created_at ? (
                                <span>{new Date(group.created_at).toLocaleString('fr-FR')}</span>
                              ) : null}
                            </div>
                            <strong>
                              Instructeur : {group.instructeur_nom}
                              {' · '}
                              {group.athletes.length} athlète{group.athletes.length > 1 ? 's' : ''}
                            </strong>
                            <ul className="passation-group-list" style={{ marginTop: '0.65rem' }}>
                              {group.athletes.map((a) => (
                                <li key={a.id || `${a.judoka_id}-${a.graded_at}`} className="passation-group-item">
                                  <div className="passation-group-item-main">
                                    <strong>
                                      {a.judoka_prenom} {a.judoka_nom}
                                    </strong>
                                    <small>
                                      Club : {a.club || '-'}
                                      {a.judoka_numero_carte ? ` · ID ${a.judoka_numero_carte}` : ''}
                                    </small>
                                    <p className="form-hint">
                                      {a.grade_from || '-'} → {a.grade_to || '-'}
                                      {a.total_score != null && a.total_max != null
                                        ? ` · Points : ${a.total_score}/${a.total_max}`
                                        : ''}
                                    </p>
                                  </div>
                                  <span className={`passation-result-badge ${a.reussi ? 'is-pass' : 'is-reject'}`}>
                                    {a.reussi ? 'Passer' : 'Rejeter'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="admin-grade-linked-passations">
                            <div className="grade-history-meta" style={{ marginBottom: '0.45rem' }}>
                              <span className="grade-history-chip is-pass">Passation enregistrée</span>
                              <span>
                                {group.passations.length} liée{group.passations.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            {group.passations.length === 0 ? (
                              <p className="form-hint">Aucune passation liée à ce groupe.</p>
                            ) : (
                              <ul className="admin-grade-passation-mini-list">
                                {group.passations.map((h) => (
                                  <li key={h.id}>
                                    <strong>{h.grade_from || '-'} → {h.grade_to}</strong>
                                    <small>
                                      {h.instructeur_nom ? `Instructeur : ${h.instructeur_nom}` : 'Sans instructeur'}
                                      {h.points != null ? ` · Points : ${h.points}` : ''}
                                      {h.created_at ? ` · ${new Date(h.created_at).toLocaleString('fr-FR')}` : ''}
                                    </small>
                                    {h.changed_by_name ? (
                                      <p className="form-hint">{h.changed_by_name}</p>
                                    ) : null}
                                    {h.note ? <p className="form-hint">{h.note}</p> : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </li>
                      ))}

                      {orphanPassations.map((h) => (
                        <li key={`orphan-${h.id}`} className="transfer-row">
                          <div>
                            <div className="grade-history-meta" style={{ marginBottom: '0.35rem' }}>
                              <span className="grade-history-chip is-pass">Passation enregistrée</span>
                              {h.created_at ? (
                                <span>{new Date(h.created_at).toLocaleString('fr-FR')}</span>
                              ) : null}
                            </div>
                            <strong>{h.grade_from || '-'} → {h.grade_to}</strong>
                            <small>
                              {h.instructeur_nom ? `Instructeur : ${h.instructeur_nom}` : 'Sans instructeur'}
                              {h.points != null ? ` · Points : ${h.points}` : ''}
                            </small>
                            <p className="form-hint">{h.changed_by_name || '-'}</p>
                            {h.note ? <p className="form-hint">{h.note}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
