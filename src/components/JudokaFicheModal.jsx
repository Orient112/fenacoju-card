import { useEffect, useMemo, useState } from 'react';
import BrandLoader from './BrandLoader';
import { fetchJudokaFiche } from '../api';

const TYPE_LABELS = {
  grade: 'Grade',
  transfert: 'Transfert',
  competition: 'Compétition',
  note: 'Note',
  autre: 'Mouvement',
};

function transferClubsLabel(ev) {
  const from = ev?.meta?.club_from || '';
  const to = ev?.meta?.club_to || '';
  if (from && to) return `${from} → ${to}`;
  const titre = String(ev?.titre || '');
  const match = titre.match(/:\s*(.+?)\s*→\s*(.+)$/);
  if (match) return `${match[1].trim()} → ${match[2].trim()}`;
  return titre || 'Transfert';
}

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
  const events = useMemo(() => {
    const raw = fiche?.events || [];
    return raw.filter((ev) => {
      if (ev.type !== 'transfert') return true;
      const statut = ev?.meta?.statut;
      if (statut) return statut === 'accepte';
      return /confirmé|effectif|accepté/i.test(String(ev.titre || ''));
    });
  }, [fiche?.events]);

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="judoka-fiche-modal" onClick={(e) => e.stopPropagation()}>
        <header className="judoka-fiche-head">
          <div>
            <p className="judoka-fiche-kicker">Fiche de suivi</p>
            <h3>{j.prenom} {j.nom}</h3>
            <p className="form-hint">
              {j.numero_carte || '-'} · {j.club || 'Sans club'} · {j.grade || '-'}
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
          <BrandLoader label="Chargement…" />
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : (
          <section className="judoka-fiche-history">
            <h4>Historique des mouvements</h4>
            {events.length === 0 ? (
              <p className="form-hint">Aucun mouvement enregistré pour cet athlète.</p>
            ) : (
              <ul className="judoka-fiche-timeline">
                {events.map((ev) => {
                  const isTransfer = ev.type === 'transfert';
                  return (
                    <li key={ev.id}>
                      <div className="judoka-fiche-timeline-meta">
                        <span className="badge">{TYPE_LABELS[ev.type] || ev.type}</span>
                        <time>{ev.created_at ? new Date(ev.created_at).toLocaleString('fr-FR') : ''}</time>
                      </div>
                      <strong>{isTransfer ? transferClubsLabel(ev) : ev.titre}</strong>
                      {!isTransfer && ev.detail ? <p>{ev.detail}</p> : null}
                      {!isTransfer && ev.created_by_name ? <small>Par {ev.created_by_name}</small> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
