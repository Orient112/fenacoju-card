import { useEffect, useMemo, useState } from 'react';
import { ACCOUNT_STATUT_LABELS, CLUB_DOCUMENT_LABELS, USER_TYPES, resolveMediaUrl } from '../api';

function Field({ label, value }) {
  return (
    <div className="club-detail-item">
      <span className="club-detail-label">{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}

function orgName(u) {
  return u?.nom_organisation || u?.nom_club || `${u?.prenom || ''} ${u?.nom || ''}`.trim() || '-';
}

export default function AccountDetailModal({
  account,
  members = [],
  onClose,
  canToggleLigueCompetition = false,
  onToggleLigueCompetition,
}) {
  const [ligueCompetitionBusy, setLigueCompetitionBusy] = useState(false);
  const [ligueCompetitionAccess, setLigueCompetitionAccess] = useState(
    () => Boolean(account?.competition_access)
  );

  useEffect(() => {
    setLigueCompetitionAccess(Boolean(account?.competition_access));
  }, [account?.id, account?.competition_access]);
  const childEntentes = useMemo(() => {
    if (!account || account.type !== 'ligue') return [];
    return (members || [])
      .filter((m) => m.type === 'entente' && String(m.parent_id) === String(account.id))
      .sort((a, b) => orgName(a).localeCompare(orgName(b), 'fr'));
  }, [account, members]);

  const childClubs = useMemo(() => {
    if (!account) return [];
    if (account.type === 'entente') {
      return (members || [])
        .filter((m) => m.type === 'club' && String(m.parent_id) === String(account.id))
        .sort((a, b) => orgName(a).localeCompare(orgName(b), 'fr'));
    }
    if (account.type === 'ligue') {
      const ententeIds = new Set(childEntentes.map((e) => String(e.id)));
      return (members || [])
        .filter((m) => m.type === 'club' && (
          String(m.parent_id) === String(account.id)
          || ententeIds.has(String(m.parent_id))
        ))
        .sort((a, b) => orgName(a).localeCompare(orgName(b), 'fr'));
    }
    return [];
  }, [account, members, childEntentes]);

  if (!account) return null;

  const handleToggleLigueCompetition = async () => {
    if (!onToggleLigueCompetition || ligueCompetitionBusy) return;
    setLigueCompetitionBusy(true);
    try {
      const next = !ligueCompetitionAccess;
      await onToggleLigueCompetition(account, next);
      setLigueCompetitionAccess(next);
    } finally {
      setLigueCompetitionBusy(false);
    }
  };

  const isArbitre = account._kind === 'arbitre' || (!account.type && account.niveau);
  const typeLabel = isArbitre
    ? 'Arbitre'
    : (USER_TYPES[account.type]?.label || account.type);
  const statut = account.statut || 'actif';
  const title = isArbitre
    ? `${account.prenom || ''} ${account.nom || ''}`.trim() || 'Arbitre'
    : account.type === 'club'
      ? account.nom_club
      : account.type === 'ligue' || account.type === 'entente'
        ? (account.nom_organisation || account.nom)
        : `${account.prenom || ''} ${account.nom || ''}`.trim() || typeLabel;

  const documents = account.documents || {};

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="club-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="club-detail-header">
          <div>
            <h2>{title}</h2>
            <p className="club-detail-value" style={{ margin: '0.25rem 0 0' }}>
              {typeLabel}
              {!isArbitre && (
                <>
                  {' · '}
                  <span className={`badge ${statut === 'pending' ? 'badge-pending' : statut === 'rejete' ? 'badge-inactif' : 'badge-actif'}`}>
                    {ACCOUNT_STATUT_LABELS[statut] || statut}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="club-detail-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {account.type === 'ligue' && canToggleLigueCompetition && (
              <button
                type="button"
                className={`btn btn-sm ligue-competition-toggle-btn ${
                  ligueCompetitionAccess ? 'is-active' : 'is-inactive'
                }`}
                onClick={handleToggleLigueCompetition}
                disabled={ligueCompetitionBusy}
                title={ligueCompetitionAccess
                  ? 'Compétition activée - cliquer pour désactiver'
                  : 'Compétition désactivée - cliquer pour activer'}
              >
                {ligueCompetitionBusy ? '…' : (ligueCompetitionAccess ? 'Activer' : 'Désactiver')}
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
          </div>
        </div>

        <div className="club-detail-body">
          <div className="club-detail-grid">
            {isArbitre && (
              <>
                <Field label="Nom" value={account.nom} />
                <Field label="Prénom" value={account.prenom} />
                <Field label="Niveau" value={account.niveau} />
                <Field label="Club" value={account.club} />
                <Field label="Grade" value={account.grade} />
                <Field label="Email" value={account.email} />
                <Field label="Téléphone" value={account.telephone} />
                <Field
                  label="Date d'enregistrement"
                  value={account.created_at ? new Date(account.created_at).toLocaleDateString('fr-FR') : ''}
                />
              </>
            )}

            {!isArbitre && (
              <>
                {(account.type === 'federation' || account.type === 'membre' || account.type === 'entraineur') && (
                  <>
                    <Field label="Nom" value={account.nom} />
                    <Field label="Prénom" value={account.prenom} />
                  </>
                )}
                {(account.type === 'ligue' || account.type === 'entente') && (
                  <>
                    <Field label="Organisation" value={account.nom_organisation || account.nom} />
                    <Field label="Responsable" value={account.responsable} />
                    <Field label="Province / Ville" value={account.ville} />
                  </>
                )}
                {account.type === 'club' && (
                  <>
                    <Field label="Nom du club" value={account.nom_club} />
                    <Field label="Responsable" value={account.responsable} />
                    <Field label="Province / Ville" value={account.ville} />
                  </>
                )}
                {account.type === 'entraineur' && (
                  <>
                    <Field label="Club" value={account.club} />
                    <Field label="Grade" value={account.grade} />
                  </>
                )}
                {(account.type === 'federation' || account.type === 'membre') && (
                  <Field label={account.type === 'membre' ? 'Rôle' : 'Fonction'} value={account.fonction} />
                )}
                <Field
                  label="Email / Identifiant"
                  value={account.email?.endsWith('@fiche.local') ? '-' : account.email}
                />
                <Field label="Téléphone" value={account.telephone} />
                <Field
                  label="Date d'enregistrement"
                  value={account.created_at ? new Date(account.created_at).toLocaleDateString('fr-FR') : ''}
                />
              </>
            )}
          </div>

          {!isArbitre && account.type === 'club' && Array.isArray(account.comites) && account.comites.length > 0 && (
            <div className="club-detail-section">
              <h3>Comités ({account.comites.length})</h3>
              <ul className="club-members-list">
                {account.comites.map((c, idx) => (
                  <li key={`acc-comite-${idx}`} className="club-member-item">
                    <div>
                      <span className="club-member-name">{c.nom || '-'}</span>
                      {c.titre && <span className="club-member-meta">{c.titre}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isArbitre && account.type === 'club' && Object.keys(documents).length > 0 && (
            <div className="club-detail-section">
              <h3>Documents</h3>
              <ul className="club-documents-list">
                {Object.entries(documents).map(([key, url]) => (
                  <li key={key}>
                    <span>{CLUB_DOCUMENT_LABELS[key] || key}</span>
                    <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Voir
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isArbitre && account.type === 'ligue' && (
            <>
              <div className="club-detail-section">
                <h3>Ententes ({childEntentes.length})</h3>
                {childEntentes.length === 0 ? (
                  <p className="form-hint">Aucune entente liée à cette ligue.</p>
                ) : (
                  <ul className="club-members-list">
                    {childEntentes.map((e) => (
                      <li key={e.id} className="club-member-item">
                        <div>
                          <span className="club-member-name">{orgName(e)}</span>
                          <span className="club-member-meta">
                            {[e.responsable, e.ville].filter(Boolean).join(' · ') || 'Entente'}
                          </span>
                        </div>
                        <span className={`badge ${e.statut === 'pending' ? 'badge-pending' : e.statut === 'rejete' ? 'badge-inactif' : 'badge-actif'}`}>
                          {ACCOUNT_STATUT_LABELS[e.statut || 'actif'] || e.statut || 'Actif'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="club-detail-section">
                <h3>Clubs ({childClubs.length})</h3>
                {childClubs.length === 0 ? (
                  <p className="form-hint">Aucun club lié à cette ligue.</p>
                ) : (
                  <ul className="club-members-list">
                    {childClubs.map((c) => {
                      const parentEntente = childEntentes.find((e) => String(e.id) === String(c.parent_id));
                      return (
                        <li key={c.id} className="club-member-item">
                          <div>
                            <span className="club-member-name">{orgName(c)}</span>
                            <span className="club-member-meta">
                              {[
                                parentEntente ? `Entente : ${orgName(parentEntente)}` : null,
                                c.responsable,
                                c.ville,
                              ].filter(Boolean).join(' · ') || 'Club'}
                            </span>
                          </div>
                          <span className={`badge ${c.statut === 'pending' ? 'badge-pending' : c.statut === 'rejete' ? 'badge-inactif' : 'badge-actif'}`}>
                            {ACCOUNT_STATUT_LABELS[c.statut || 'actif'] || c.statut || 'Actif'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}

          {!isArbitre && account.type === 'entente' && (
            <div className="club-detail-section">
              <h3>Clubs ({childClubs.length})</h3>
              {childClubs.length === 0 ? (
                <p className="form-hint">Aucun club lié à cette entente.</p>
              ) : (
                <ul className="club-members-list">
                  {childClubs.map((c) => (
                    <li key={c.id} className="club-member-item">
                      <div>
                        <span className="club-member-name">{orgName(c)}</span>
                        <span className="club-member-meta">
                          {[c.responsable, c.ville].filter(Boolean).join(' · ') || 'Club'}
                        </span>
                      </div>
                      <span className={`badge ${c.statut === 'pending' ? 'badge-pending' : c.statut === 'rejete' ? 'badge-inactif' : 'badge-actif'}`}>
                        {ACCOUNT_STATUT_LABELS[c.statut || 'actif'] || c.statut || 'Actif'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
