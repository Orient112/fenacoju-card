import { useEffect, useState } from 'react';
import { fetchJudokaFiche, formatDate } from '../api';

const TYPE_LABELS = {
  grade: 'Grade',
  transfert: 'Transfert',
  competition: 'Compétition',
  note: 'Note',
  autre: 'Mouvement',
};

export default function JudokaFicheModal({ judoka, onClose, onRequestTransfer }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fiche, setFiche] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchJudokaFiche(judoka.id);
        if (!cancelled) setFiche(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [judoka.id]);

  const j = fiche?.judoka || judoka;
  const events = fiche?.events || [];

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="judoka-fiche-modal" onClick={(e) => e.stopPropagation()}>
        <header className="judoka-fiche-head">
          <div>
            <p className="judoka-fiche-kicker">Fiche de suivi</p>
            <h3>{j.prenom} {j.nom}</h3>
            <p className="form-hint">
              {j.numero_carte || '—'} · {j.club || 'Sans club'} · {j.grade || '—'}
            </p>
          </div>
          <div className="judoka-fiche-head-actions">
            {onRequestTransfer && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onRequestTransfer(j)}>
                Transférer
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
          </div>
        </header>

        {loading ? (
          <div className="page-loader"><div className="spinner" /><p>Chargement…</p></div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : (
          <>
            <section className="judoka-fiche-identity">
              <div><span>Sexe</span><strong>{j.sexe === 'F' ? 'Féminin' : 'Masculin'}</strong></div>
              <div><span>Naissance</span><strong>{formatDate(j.date_naissance) || '—'}</strong></div>
              <div><span>Catégorie</span><strong>{j.categorie || '—'}</strong></div>
              <div><span>Licence</span><strong>{j.numero_licence || '—'}</strong></div>
              <div><span>Inscription</span><strong>{formatDate(j.date_inscription) || '—'}</strong></div>
              <div><span>Statut</span><strong>{j.statut === 'actif' ? 'Actif' : 'Inactif'}</strong></div>
            </section>

            <section className="judoka-fiche-history">
              <h4>Historique des mouvements</h4>
              {events.length === 0 ? (
                <p className="form-hint">Aucun mouvement enregistré pour cet athlète.</p>
              ) : (
                <ul className="judoka-fiche-timeline">
                  {events.map((ev) => (
                    <li key={ev.id}>
                      <div className="judoka-fiche-timeline-meta">
                        <span className="badge">{TYPE_LABELS[ev.type] || ev.type}</span>
                        <time>{ev.created_at ? new Date(ev.created_at).toLocaleString('fr-FR') : ''}</time>
                      </div>
                      <strong>{ev.titre}</strong>
                      {ev.detail ? <p>{ev.detail}</p> : null}
                      {ev.created_by_name ? <small>Par {ev.created_by_name}</small> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
