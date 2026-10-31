import { useEffect, useState } from 'react';
import {
  confirmTransferFederation,
  fetchTransfers,
  rejectTransfer,
  requestJudokaTransfer,
  validateTransferLigue,
} from '../api';

const STATUT_LABELS = {
  pending_ligue: 'En attente Ligue',
  pending_federation: 'En attente Fédération',
  accepte: 'Accepté',
  rejete: 'Rejeté',
  annule: 'Annulé',
};

export default function TransferModal({
  mode = 'request', // request | inbox
  judoka = null,
  clubs = [],
  canValidateLigue = false,
  canConfirmFederation = false,
  onClose,
  onToast,
  onDone,
}) {
  const [clubTo, setClubTo] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(mode === 'inbox');

  const loadInbox = async () => {
    setLoading(true);
    try {
      const data = await fetchTransfers();
      setList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'inbox') loadInbox();
  }, [mode]);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    if (!clubTo.trim()) {
      setError('Choisissez le club de destination');
      return;
    }
    setBusy(true);
    try {
      await requestJudokaTransfer({
        judoka_id: judoka.id,
        club_to: clubTo.trim(),
        motif,
      });
      onToast?.(`Demande de transfert envoyée pour ${judoka.prenom} ${judoka.nom}`);
      onDone?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (id, action) => {
    setBusy(true);
    setError('');
    try {
      if (action === 'ligue') await validateTransferLigue(id);
      else if (action === 'federation') await confirmTransferFederation(id);
      else if (action === 'reject') await rejectTransfer(id);
      onToast?.('Transfert mis à jour');
      await loadInbox();
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
        <header className="competition-params-modal-head">
          <div>
            <h3>{mode === 'inbox' ? 'Transferts judokas' : 'Demande de transfert'}</h3>
            {mode === 'request' && judoka && (
              <p className="form-hint">
                {judoka.prenom} {judoka.nom} · Club actuel : <strong>{judoka.club || '—'}</strong>
              </p>
            )}
            {mode === 'inbox' && (
              <p className="form-hint">Validation Ligue puis confirmation Fédération (Secrétaire Général / Coordon).</p>
            )}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
        </header>

        {error && <div className="form-error">{error}</div>}

        {mode === 'request' ? (
          <form onSubmit={handleRequest}>
            <div className="form-group">
              <label htmlFor="transfer-club-to">Club de destination *</label>
              <select id="transfer-club-to" value={clubTo} onChange={(e) => setClubTo(e.target.value)} required>
                <option value="">— Sélectionner —</option>
                {clubs
                  .filter((c) => String(c).trim().toLowerCase() !== String(judoka?.club || '').trim().toLowerCase())
                  .map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="transfer-motif">Motif</label>
              <textarea id="transfer-motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        ) : loading ? (
          <div className="page-loader"><div className="spinner" /><p>Chargement…</p></div>
        ) : list.length === 0 ? (
          <p className="form-hint">Aucun transfert.</p>
        ) : (
          <ul className="transfer-list">
            {list.map((t) => (
              <li key={t.id} className="transfer-row">
                <div>
                  <strong>{t.club_from} → {t.club_to}</strong>
                  <small>{STATUT_LABELS[t.statut] || t.statut}</small>
                  {t.motif ? <p className="form-hint">{t.motif}</p> : null}
                </div>
                <div className="transfer-row-actions">
                  {t.statut === 'pending_ligue' && canValidateLigue && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleAction(t.id, 'ligue')}>
                      Valider Ligue
                    </button>
                  )}
                  {t.statut === 'pending_federation' && canConfirmFederation && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleAction(t.id, 'federation')}>
                      Confirmer Fédération
                    </button>
                  )}
                  {['pending_ligue', 'pending_federation'].includes(t.statut) && (canValidateLigue || canConfirmFederation) && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => handleAction(t.id, 'reject')}>
                      Rejeter
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
