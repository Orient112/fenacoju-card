import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCompetition,
  updateCompetition,
  uploadCompetitionLogo,
  deleteCompetitionLogo,
  fetchCompetitionRegistrations,
  createCompetitionRegistration,
  deleteCompetitionRegistration,
  updateCompetitionRegistration,
  deleteCompetitionPublicLink,
  chargeCompetitionTeamFromIndividuel,
  competitionPublicUrl,
  competitionWeighUrl,
  resolveMediaUrl,
  CATEGORIES,
} from '../api';
import { exportCompetitionListToPdf } from '../utils/exportCompetitionListPdf';
import { exportCompetitionDrawToPdf } from '../utils/exportCompetitionDrawPdf';
import { extractClubsFromPdfFile } from '../utils/importClubsFromPdf';
import CompetitionClubSelect from '../components/CompetitionClubSelect';
import { buildWeightDraw, buildTeamDraw } from '../utils/competitionDraw';
import DrawAnimation from '../components/DrawAnimation';
import ReceiptScanModal from '../components/ReceiptScanModal';
import CompetitionLinkQrModal from '../components/CompetitionLinkQrModal';
import CompetitionReceiptProofModal from '../components/CompetitionReceiptProofModal';
import { ClubLigueLabel } from '../components/CompetitionClubSelect';
import { IconCharge, IconEdit, IconQrCode, IconTrash } from '../components/ActionIcons';
import {
  buildReceiptPayloadFromRegistrations,
  extractOrderNumber,
} from '../utils/competitionReceipt';

function isTeamRegistration(r) {
  return r?.mode_inscription === 'equipe' || String(r?.taille || '').startsWith('__mode_equipe__');
}

function sameCompetitionPerson(a, b) {
  if (!a || !b) return false;
  if (a.judoka_id && b.judoka_id && String(a.judoka_id) === String(b.judoka_id)) return true;
  const cardA = String(a.numero_carte || '').trim().toUpperCase();
  const cardB = String(b.numero_carte || '').trim().toUpperCase();
  if (cardA && cardB && cardA === cardB) return true;
  const nom = String(a.nom || '').trim().toLowerCase();
  const prenom = String(a.prenom || '').trim().toLowerCase();
  if (!nom || !prenom) return false;
  return nom === String(b.nom || '').trim().toLowerCase()
    && prenom === String(b.prenom || '').trim().toLowerCase()
    && String(a.date_naissance || '').slice(0, 10) === String(b.date_naissance || '').slice(0, 10);
}

function chargeableIndividuelRegistrations(registrations) {
  const team = (registrations || []).filter((r) => isTeamRegistration(r));
  return (registrations || []).filter((r) => (
    !isTeamRegistration(r)
    && !team.some((t) => sameCompetitionPerson(r, t))
  ));
}

function teamMemberRole(m) {
  if (m?.role === 'remplacant' || m?.role_equipe === 'remplacant') return 'remplacant';
  const raw = String(m?.role || m?.role_equipe || m?.taille || '').toLowerCase();
  if (raw.includes('remplac')) return 'remplacant';
  return 'principal';
}

function teamMemberCategory(m) {
  const raw = String(m?.categorie || '').trim();
  if (raw && !/principal|rempl/i.test(raw)) return raw;
  return 'Sans catégorie';
}

function groupEditMembersByCategory(members) {
  const map = new Map();
  for (const m of members || []) {
    const cat = teamMemberCategory(m);
    const sexe = m.sexe === 'F' ? 'F' : 'M';
    const key = `${sexe}|${cat}`;
    if (!map.has(key)) {
      map.set(key, { key, cat, sexe, principal: null, remplacant: null });
    }
    const bucket = map.get(key);
    const role = teamMemberRole(m);
    if (role === 'remplacant' && !bucket.remplacant) bucket.remplacant = m;
    else if (!bucket.principal) bucket.principal = m;
    else if (!bucket.remplacant) bucket.remplacant = m;
  }
  return [...map.values()].sort((a, b) => {
    if (a.sexe !== b.sexe) return a.sexe === 'M' ? -1 : 1;
    return a.cat.localeCompare(b.cat, 'fr', { numeric: true });
  });
}

function groupTeamClubs(registrations) {
  const map = new Map();
  for (const r of registrations || []) {
    const club = (r.club || '').trim() || 'Sans club';
    if (!map.has(club)) map.set(club, { club, ids: [], members: [] });
    const team = map.get(club);
    team.ids.push(r.id);
    team.members.push(r);
  }
  return [...map.values()].sort((a, b) => a.club.localeCompare(b.club, 'fr'));
}

function mergeRegisteredTeamClubs(registeredClubs, registrations) {
  const fromRegs = groupTeamClubs(registrations.filter((r) => isTeamRegistration(r)));
  const byName = new Map(fromRegs.map((team) => [String(team.club).trim().toLowerCase(), team]));
  const merged = [];

  for (const club of (registeredClubs || []).filter((c) => c.cadre === 'equipe')) {
    const key = String(club.nom || '').trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      merged.push({ ...existing, club: club.nom });
      byName.delete(key);
    } else {
      merged.push({ club: club.nom, ids: [], members: [] });
    }
  }

  for (const leftover of byName.values()) merged.push(leftover);
  return merged.sort((a, b) => a.club.localeCompare(b.club, 'fr'));
}

function formatDateFr(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return value;
  }
}

function RegistrationsTable({ registrations, onEdit, onDelete, onShowReceipt, pageSize = 4 }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const filtered = term
    ? registrations.filter((r) => {
      const hay = [
        r.nom, r.prenom, r.club, r.poids, r.categorie,
        r.deja_enregistre ? 'systeme' : 'nouveau',
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    })
    : registrations;

  useEffect(() => {
    setPage(0);
  }, [filtered.length, term]);

  if (!registrations.length) {
    return (
      <div className="competition-empty-regs">
        <p>Aucun inscrit.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="competition-regs-paged">
      <div className="competition-regs-search">
        <input
          type="search"
          className="search-input"
          placeholder="Rechercher un inscrit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher un inscrit individuel"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="competition-empty-regs">
          <p>Aucun résultat pour « {search} ».</p>
        </div>
      ) : (
        <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Club</th>
              <th>Poids</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td data-label="Nom">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</td>
                <td data-label="Club">{r.club || '—'}</td>
                <td data-label="Poids">
                  {r.poids ? (
                    <span className="badge badge-actif">{r.poids} kg</span>
                  ) : (
                    <span className="badge badge-pending">À peser</span>
                  )}
                </td>
                <td data-label="Type">
                  <span className={`badge ${r.deja_enregistre ? 'badge-actif' : 'badge-pending'}`}>
                    {r.deja_enregistre ? 'Système' : 'Nouveau'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="actions-cell">
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-edit"
                      title="Modifier"
                      onClick={() => onEdit(r)}
                    >
                      <IconEdit />
                    </button>
                    {onShowReceipt && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-qr"
                        title="Preuve de paiement (QR Code)"
                        onClick={() => onShowReceipt(r)}
                      >
                        <IconQrCode />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-delete"
                      title="Supprimer"
                      onClick={() => onDelete(r)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="competition-regs-pager">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédent
          </button>
          <span className="competition-regs-pager-info">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Suivant
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function TeamClubsTable({ clubs, onEdit, onDelete, onCharge, onShowReceipt, pageSize = 4 }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const filtered = term
    ? clubs.filter((team) => String(team.club || '').toLowerCase().includes(term))
    : clubs;

  useEffect(() => {
    setPage(0);
  }, [filtered.length, term]);

  if (!clubs.length) {
    return (
      <div className="competition-empty-regs">
        <p>Aucun club inscrit.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="competition-regs-paged">
      <div className="competition-regs-search">
        <input
          type="search"
          className="search-input"
          placeholder="Rechercher un club..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher un club par équipe"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="competition-empty-regs">
          <p>Aucun résultat pour « {search} ».</p>
        </div>
      ) : (
        <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Club</th>
              <th>Judokas</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((team) => (
              <tr key={team.club}>
                <td data-label="Club">{team.club}</td>
                <td data-label="Judokas">{team.members?.length || team.ids.length}</td>
                <td data-label="Actions">
                  <div className="actions-cell">
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-edit"
                      title="Modifier"
                      onClick={() => onEdit(team)}
                    >
                      <IconEdit />
                    </button>
                    {onCharge && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-key"
                        title="Charger des judokas individuels"
                        onClick={() => onCharge(team)}
                      >
                        <IconCharge />
                      </button>
                    )}
                    {onShowReceipt && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-qr"
                        title="Preuve de paiement (QR Code)"
                        onClick={() => onShowReceipt(team)}
                      >
                        <IconQrCode />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-delete"
                      title="Supprimer l'équipe"
                      onClick={() => onDelete(team)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="competition-regs-pager">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédent
          </button>
          <span className="competition-regs-pager-info">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Suivant
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function ParamsFormFields({
  form,
  onChange,
  onCategoriesChange,
  onIndividualCategoriesChange,
  onLogoSelected,
  onLogoRemoved,
  logoUploading = false,
}) {
  const teamCats = Array.isArray(form.categories_poids) ? form.categories_poids : [];
  const individualCats = Array.isArray(form.categories_poids_individuel) ? form.categories_poids_individuel : [];
  const logoSrc = form.logo_url ? resolveMediaUrl(form.logo_url) : '/fenacoju-logo.png';
  const hasCustomLogo = Boolean(form.logo_url);

  const renderCatEditor = (cats, onUpdate, prefix) => {
    const updateCat = (index, field, value) => {
      const next = cats.map((c, i) => {
        if (i !== index) return c;
        const current = (c && typeof c === 'object') ? c : { min: c, max: c, label: c };
        return { ...current, [field]: value };
      });
      onUpdate(next);
    };
    const addCat = (sexe) => onUpdate([...cats, { sexe, label: '', min: '', max: '' }]);
    const removeCat = (index) => onUpdate(cats.filter((_, i) => i !== index));

    const renderSexGroup = (sexe, title) => {
      const rows = cats
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => {
          const current = (value && typeof value === 'object') ? value : {};
          const s = String(current.sexe || 'M').toUpperCase().startsWith('F') ? 'F' : 'M';
          return s === sexe;
        });

      return (
        <div className="competition-cat-sex-group">
          <div className="club-comites-head">
            <label>{title}</label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => addCat(sexe)}>
              + Ajouter
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="form-hint">Aucune catégorie {title.toLowerCase()} pour le moment.</p>
          ) : (
            <div className="club-comites-list">
              {rows.map(({ value, index }) => {
                const cat = (value && typeof value === 'object') ? value : { label: value, min: value, max: value };
                return (
                  <div key={`${prefix}-${sexe}-${index}`} className="club-comite-row club-comite-row-cat">
                    <input
                      value={cat.label ?? ''}
                      onChange={(e) => updateCat(index, 'label', e.target.value)}
                      placeholder="Ex. -60"
                      aria-label={`Catégorie ${title} ${index + 1}`}
                    />
                    <span className="form-hint" style={{ margin: 0 }}>de</span>
                    <input
                      value={cat.min ?? ''}
                      onChange={(e) => updateCat(index, 'min', e.target.value)}
                      placeholder="Ex. 0"
                      inputMode="decimal"
                      aria-label={`Poids minimum ${title} ${index + 1}`}
                    />
                    <span className="form-hint" style={{ margin: 0 }}>à</span>
                    <input
                      value={cat.max ?? ''}
                      onChange={(e) => updateCat(index, 'max', e.target.value)}
                      placeholder="Ex. 60"
                      inputMode="decimal"
                      aria-label={`Poids maximum ${title} ${index + 1}`}
                    />
                    <span className="form-hint" style={{ margin: 0 }}>kg</span>
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-delete"
                      title="Retirer"
                      onClick={() => removeCat(index)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        {renderSexGroup('M', 'Garçon')}
        {renderSexGroup('F', 'Fille')}
      </>
    );
  };

  return (
    <div className="form-grid">
      <div className="form-group form-group-full">
        <label htmlFor="comp-nom">Nom de la compétition *</label>
        <input
          id="comp-nom"
          name="nom"
          value={form.nom}
          onChange={onChange}
          required
          placeholder="Ex. Championnat National 2026"
        />
      </div>
      <div className="form-group">
        <label htmlFor="comp-lieu">Lieu *</label>
        <input
          id="comp-lieu"
          name="lieu"
          value={form.lieu}
          onChange={onChange}
          required
          placeholder="Ville / salle"
        />
      </div>
      <div className="form-group">
        <label htmlFor="comp-debut">Date de début *</label>
        <input
          id="comp-debut"
          type="date"
          name="date_debut"
          value={form.date_debut}
          onChange={onChange}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="comp-fin">Date de fin</label>
        <input
          id="comp-fin"
          type="date"
          name="date_fin"
          value={form.date_fin}
          onChange={onChange}
        />
      </div>
      <div className="form-group form-group-full competition-logo-field">
        <label htmlFor="comp-logo">Logo de la compétition</label>
        <div className="competition-logo-row">
          <img
            src={logoSrc}
            alt="Logo compétition"
            className="competition-logo-preview"
            width="64"
            height="64"
          />
          <div className="competition-logo-controls">
            <div className="competition-logo-actions">
              <input
                id="comp-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={logoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onLogoSelected?.(file);
                }}
              />
              {hasCustomLogo && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={logoUploading}
                  onClick={() => onLogoRemoved?.()}
                >
                  Retirer le logo
                </button>
              )}
            </div>
            <p className="form-hint">Formats pris en charge (JPG, PNG ou WebP)</p>
          </div>
        </div>
      </div>
      <div className="form-group form-group-full competition-description-field">
        <div className="competition-description-head">
          <span className="competition-cat-block-kicker">Présentation</span>
          <label htmlFor="comp-desc">Description</label>
        </div>
        <p className="form-hint competition-description-hint">
          Texte affiché aux judokas sur la page d&apos;inscription publique.
        </p>
        <textarea
          id="comp-desc"
          name="description"
          className="competition-description-input"
          value={form.description}
          onChange={onChange}
          rows={5}
          placeholder="Ex. Horaires, lieu exact, consignes d'arrivée, documents à prévoir…"
        />
      </div>
      <div className="competition-fees-block">
        <div className="competition-cat-block-head">
          <span className="competition-cat-block-kicker">Tarifs</span>
          <h4>Frais de participation</h4>
        </div>
        <p className="form-hint">
          Définissez les prix en Franc Congolais et en Dollars pour chaque catégorie.
          La monnaie choisie est celle utilisée pour le paiement à l&apos;inscription.
        </p>
        <div className="form-group competition-fees-currency">
          <label htmlFor="frais-monnaie">Monnaie de paiement</label>
          <select
            id="frais-monnaie"
            name="frais_monnaie"
            value={form.frais_monnaie || 'CDF'}
            onChange={onChange}
          >
            <option value="CDF">Franc Congolais (FC)</option>
            <option value="USD">Dollars (USD)</option>
          </select>
        </div>
        <div className="competition-fees-grid competition-fees-grid-dual">
          <div className="competition-fees-category">
            <h5>Individuel (par judoka)</h5>
            <div className="form-group">
              <label htmlFor="frais-individuel-cdf">Prix en Franc Congolais</label>
              <input
                id="frais-individuel-cdf"
                name="frais_individuel_cdf"
                type="number"
                min="0"
                step="1"
                value={form.frais_individuel_cdf ?? 0}
                onChange={onChange}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label htmlFor="frais-individuel-usd">Prix en Dollars</label>
              <input
                id="frais-individuel-usd"
                name="frais_individuel_usd"
                type="number"
                min="0"
                step="0.01"
                value={form.frais_individuel_usd ?? 0}
                onChange={onChange}
                placeholder="0"
              />
            </div>
          </div>
          <div className="competition-fees-category">
            <h5>Par équipe (par club)</h5>
            <div className="form-group">
              <label htmlFor="frais-equipe-cdf">Prix en Franc Congolais</label>
              <input
                id="frais-equipe-cdf"
                name="frais_equipe_cdf"
                type="number"
                min="0"
                step="1"
                value={form.frais_equipe_cdf ?? 0}
                onChange={onChange}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label htmlFor="frais-equipe-usd">Prix en Dollars</label>
              <input
                id="frais-equipe-usd"
                name="frais_equipe_usd"
                type="number"
                min="0"
                step="0.01"
                value={form.frais_equipe_usd ?? 0}
                onChange={onChange}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="competition-cat-block competition-cat-block-indiv">
        <div className="competition-cat-block-head">
          <span className="competition-cat-block-kicker">Individuel</span>
          <h4>Catégories de poids</h4>
        </div>
        {renderCatEditor(individualCats, onIndividualCategoriesChange, 'indiv')}
      </div>
      <div className="competition-cat-separator" aria-hidden="true" />
      <div className="competition-cat-block competition-cat-block-team">
        <div className="competition-cat-block-head">
          <span className="competition-cat-block-kicker">Par équipe</span>
          <h4>Catégories de poids</h4>
        </div>
        {renderCatEditor(teamCats, onCategoriesChange, 'equipe')}
      </div>
    </div>
  );
}

export default function CompetitionSettings({ onBack, onToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [liveTick, setLiveTick] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [showLinkQrModal, setShowLinkQrModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drawResult, setDrawResult] = useState(null);
  const [drawAnimating, setDrawAnimating] = useState(false);
  const [actionMode, setActionMode] = useState(null);
  const [deleteRegTarget, setDeleteRegTarget] = useState(null);
  const [deleteClubTarget, setDeleteClubTarget] = useState(null);
  const [editRegTarget, setEditRegTarget] = useState(null);
  const [editRegForm, setEditRegForm] = useState({ nom: '', prenom: '', poids: '', date_naissance: '' });
  const [showAddIndividuel, setShowAddIndividuel] = useState(false);
  const [addIndividuelForm, setAddIndividuelForm] = useState({
    nom: '',
    prenom: '',
    club: '',
    sexe: 'M',
    date_naissance: '',
    categorie: '',
  });
  const [editTeamTarget, setEditTeamTarget] = useState(null);
  const [editTeamClub, setEditTeamClub] = useState('');
  const [editTeamMembers, setEditTeamMembers] = useState([]);
  const [editTeamNewJudoka, setEditTeamNewJudoka] = useState({
    prenom: '',
    nom: '',
    poids: '',
    sexe: 'M',
    role_equipe: 'principal',
  });
  const [addingTeamJudoka, setAddingTeamJudoka] = useState(false);
  const [clubsEditorCadre, setClubsEditorCadre] = useState(null);
  const [clubsEditorSearch, setClubsEditorSearch] = useState('');
  const [clubDraft, setClubDraft] = useState('');
  const [ligueDraft, setLigueDraft] = useState('');
  const [editingClub, setEditingClub] = useState(null);
  const clubsPdfInputRef = useRef(null);
  const [clubsImportProgress, setClubsImportProgress] = useState(null);
  const [chargeTeamTarget, setChargeTeamTarget] = useState(null);
  const [chargeSelections, setChargeSelections] = useState({});
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [receiptProof, setReceiptProof] = useState(null);
  const [form, setForm] = useState({
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
    logo_url: '',
    categories_poids: [],
    categories_poids_individuel: [],
    frais_monnaie: 'CDF',
    frais_individuel_cdf: 0,
    frais_individuel_usd: 0,
    frais_equipe_cdf: 0,
    frais_equipe_usd: 0,
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const formRef = useRef(form);
  const savingRef = useRef(false);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const applySettingsForm = (data) => {
    setForm({
      nom: data.nom || '',
      date_debut: data.date_debut || '',
      date_fin: data.date_fin || '',
      lieu: data.lieu || '',
      description: data.description || '',
      logo_url: data.logo_url || '',
      categories_poids: Array.isArray(data.categories_poids) ? data.categories_poids : [],
      categories_poids_individuel: Array.isArray(data.categories_poids_individuel) ? data.categories_poids_individuel : [],
      frais_monnaie: String(data.frais_monnaie || '').toUpperCase() === 'USD' ? 'USD' : 'CDF',
      frais_individuel_cdf: Math.max(0, Number(data.frais_individuel_cdf ?? data.frais_individuel) || 0),
      frais_individuel_usd: Math.max(0, Number(data.frais_individuel_usd) || 0),
      frais_equipe_cdf: Math.max(0, Number(data.frais_equipe_cdf ?? data.frais_equipe) || 0),
      frais_equipe_usd: Math.max(0, Number(data.frais_equipe_usd) || 0),
    });
  };

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCompetition();
      if (!data.access_ok && !data.can_toggle_access) {
        setError('Le bouton Compétition n\'est pas encore activé par Admin / Coordon.');
        setSettings(data);
        return;
      }
      setSettings(data);
      applySettingsForm(data);
      if (data.access_ok || data.can_toggle_access) {
        const regs = await fetchCompetitionRegistrations().catch(() => []);
        setRegistrations(regs);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSilent = useCallback(async () => {
    if (savingRef.current) return;
    try {
      const [data, regs] = await Promise.all([
        fetchCompetition(),
        fetchCompetitionRegistrations().catch(() => null),
      ]);
      setSettings((prev) => ({ ...prev, ...data }));
      // Si Admin/Coordon a reset (Off), synchroniser le formulaire local
      if (!data.configured || !data.nom) {
        setForm({
          nom: data.nom || '',
          date_debut: data.date_debut || '',
          date_fin: data.date_fin || '',
          lieu: data.lieu || '',
          description: data.description || '',
          categories_poids: Array.isArray(data.categories_poids) ? data.categories_poids : [],
          categories_poids_individuel: Array.isArray(data.categories_poids_individuel) ? data.categories_poids_individuel : [],
        });
        setDrawResult(null);
        setShowParamsModal(false);
      }
      if (regs) setRegistrations(regs);
      else if (!data.configured) setRegistrations([]);
      setLiveTick((v) => !v);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (loading) return undefined;
    if (showReceiptScan) return undefined;
    if (!settings?.access_ok && !settings?.can_toggle_access) return undefined;
    const id = setInterval(refreshSilent, 1000);
    return () => clearInterval(id);
  }, [loading, showReceiptScan, settings?.access_ok, settings?.can_toggle_access, refreshSilent]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? value : value,
    }));
  };

  const handleCategoriesChange = (next) => {
    setForm((prev) => ({ ...prev, categories_poids: next }));
  };

  const handleIndividualCategoriesChange = (next) => {
    setForm((prev) => ({ ...prev, categories_poids_individuel: next }));
  };

  const handleLogoSelected = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    setError('');
    try {
      const updated = await uploadCompetitionLogo(file);
      setSettings((prev) => ({ ...prev, ...updated }));
      setForm((prev) => ({ ...prev, logo_url: updated.logo_url || '' }));
      onToast?.('Logo de la compétition mis à jour');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message || 'Impossible de charger le logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemoved = async () => {
    setLogoUploading(true);
    setError('');
    try {
      const updated = await deleteCompetitionLogo();
      setSettings((prev) => ({ ...prev, ...updated, logo_url: '' }));
      setForm((prev) => ({ ...prev, logo_url: '' }));
      onToast?.('Logo retiré — logo FENACOJU par défaut');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message || 'Impossible de retirer le logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        frais_monnaie: String(form.frais_monnaie || '').toUpperCase() === 'USD' ? 'USD' : 'CDF',
        frais_individuel_cdf: Math.max(0, Number(form.frais_individuel_cdf) || 0),
        frais_individuel_usd: Math.max(0, Number(form.frais_individuel_usd) || 0),
        frais_equipe_cdf: Math.max(0, Number(form.frais_equipe_cdf) || 0),
        frais_equipe_usd: Math.max(0, Number(form.frais_equipe_usd) || 0),
      };
      const updated = await updateCompetition(payload);
      setSettings((prev) => ({ ...prev, ...updated }));
      applySettingsForm(updated);
      setShowParamsModal(false);
      onToast?.('Paramètres de la compétition enregistrés');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openChargeTeam = (team) => {
    setChargeTeamTarget(team);
    setChargeSelections({});
  };

  const toggleChargeJudoka = (reg) => {
    setChargeSelections((prev) => {
      if (prev[reg.id]) {
        const next = { ...prev };
        delete next[reg.id];
        return next;
      }
      return {
        ...prev,
        [reg.id]: {
          selected: true,
          poids: reg.poids || '',
          role_equipe: 'principal',
          source: reg,
        },
      };
    });
  };

  const handleConfirmChargeTeam = async () => {
    if (!chargeTeamTarget) return;
    const members = Object.values(chargeSelections)
      .filter((row) => row.selected)
      .map((row) => ({
        nom: row.source.nom,
        prenom: row.source.prenom,
        date_naissance: row.source.date_naissance || '',
        sexe: row.source.sexe || 'M',
        grade: row.source.grade || '',
        telephone: row.source.telephone || '',
        email: row.source.email || '',
        judoka_id: row.source.judoka_id || null,
        numero_carte: row.source.numero_carte || '',
        deja_enregistre: Boolean(row.source.deja_enregistre || row.source.judoka_id),
        poids: row.poids,
        role_equipe: row.role_equipe === 'remplacant' ? 'remplacant' : 'principal',
      }));
    if (!members.length) {
      onToast?.('Sélectionnez au moins un judoka', 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await chargeCompetitionTeamFromIndividuel({
        club: chargeTeamTarget.club,
        members,
      });
      const created = result.registrations || [];
      setRegistrations((prev) => [...created, ...prev]);
      const clubName = chargeTeamTarget.club;
      const chargedClub = String(clubName || '').trim().toLowerCase();
      const mappedMembers = created.map((m) => ({
        id: m.id,
        nom: m.nom || '',
        prenom: m.prenom || '',
        poids: m.poids || '',
        categorie: m.categorie || '',
        sexe: m.sexe === 'F' ? 'F' : 'M',
        role: teamMemberRole(m),
        role_equipe: m.role_equipe,
        taille: m.taille,
      }));
      const nextTeam = {
        club: clubName,
        members: [
          ...created,
          ...((editTeamTarget && String(editTeamTarget.club || '').trim().toLowerCase() === chargedClub)
            ? (editTeamTarget.members || [])
            : (chargeTeamTarget.members || [])),
        ],
        ids: [
          ...created.map((r) => r.id),
          ...((editTeamTarget && String(editTeamTarget.club || '').trim().toLowerCase() === chargedClub)
            ? (editTeamTarget.ids || [])
            : (chargeTeamTarget.ids || [])),
        ],
      };
      setEditTeamTarget(nextTeam);
      setEditTeamClub(clubName);
      setEditTeamMembers((prev) => {
        const base = (editTeamTarget && String(editTeamTarget.club || '').trim().toLowerCase() === chargedClub)
          ? prev
          : (chargeTeamTarget.members || []).map((m) => ({
            id: m.id,
            nom: m.nom || '',
            prenom: m.prenom || '',
            poids: m.poids || '',
            categorie: m.categorie || '',
            sexe: m.sexe === 'F' ? 'F' : 'M',
            role: teamMemberRole(m),
            role_equipe: m.role_equipe,
            taille: m.taille,
          }));
        return [...mappedMembers, ...base];
      });
      setChargeTeamTarget(null);
      setChargeSelections({});
      onToast?.(`${result.count || members.length} judoka(s) chargé(s) dans ${clubName}`);
    } catch (err) {
      setError(err.message);
      onToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetition({
        ...formRef.current,
        public_enabled: !settings.public_enabled,
      });
      setSettings((prev) => ({ ...prev, ...updated }));
      onToast?.(
        updated.public_enabled
          ? 'Lien du formulaire rendu public'
          : 'Inscriptions clôturées'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onToast?.('Lien copié dans le presse-papiers');
    } catch {
      onToast?.('Impossible de copier le lien', 'error');
    }
  };

  const handleDeleteLink = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await deleteCompetitionPublicLink();
      setSettings((prev) => ({ ...prev, ...updated }));
      setRegistrations([]);
      setDrawResult(null);
      setConfirmDelete(false);
      onToast?.('Lien supprimé et inscriptions effacées');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportList = async (mode) => {
    // Individuel : tous les inscrits du cadre, même non pesés
    // Par équipe : uniquement les clubs ayant au moins 1 judoka inscrit
    let list = registrations.filter((r) => (mode === 'equipe') === isTeamRegistration(r));

    if (mode === 'equipe') {
      const clubsWithMembers = new Set(
        list
          .map((r) => String(r.club || '').trim().toLowerCase())
          .filter(Boolean)
      );
      list = list.filter((r) => clubsWithMembers.has(String(r.club || '').trim().toLowerCase()));
    }

    if (!list.length) {
      onToast?.(
        mode === 'equipe'
          ? 'Aucun club Par équipe avec au moins un judoka inscrit à exporter'
          : 'Aucun inscrit individuel à exporter',
        'error'
      );
      return;
    }
    setExporting(true);
    try {
      exportCompetitionListToPdf(list, {
        ...(settings || {}),
        cadre: mode === 'equipe' ? 'Par équipe' : 'Individuel',
        includeUnweighed: true,
        clubsWithMembersOnly: mode === 'equipe',
      });
      onToast?.('Liste exportée en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de l\'export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const openActionMode = (action) => {
    if (action === 'clubs') {
      setActionMode('clubs');
      return;
    }
    if (action === 'weigh') {
      if (!canWeigh) {
        onToast?.(
          isClosed
            ? 'La pesée est inactive tant que les inscriptions sont clôturées'
            : 'Publiez d\'abord le formulaire de compétition',
          'error'
        );
        return;
      }
      setActionMode('weigh');
      return;
    }
    if (action === 'export') {
      if (!registrations.length) {
        onToast?.('Aucun inscrit à exporter', 'error');
        return;
      }
      setActionMode('export');
      return;
    }
    const closed = Boolean(settings?.configured) && !settings?.public_enabled;
    if (registrations.length === 0) {
      onToast?.('Aucun judoka inscrit pour le tirage', 'error');
      return;
    }
    if (!closed) {
      onToast?.(
        'Le tirage au sort n\'est disponible qu\'après la clôture des inscriptions',
        'error'
      );
      return;
    }
    setDrawResult(null);
    setDrawAnimating(false);
    setActionMode('draw');
  };

  const handleActionMode = (mode) => {
    if (actionMode === 'clubs') {
      setActionMode(null);
      setClubsEditorCadre(mode);
      setClubsEditorSearch('');
      setClubDraft('');
      setLigueDraft('');
      setEditingClub(null);
      return;
    }
    if (actionMode === 'weigh') {
      const url = competitionWeighUrl(settings?.public_token, mode);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      setActionMode(null);
      return;
    }
    if (actionMode === 'export') {
      setActionMode(null);
      handleExportList(mode);
      return;
    }
    handleTirageMode(mode);
  };

  const openAddIndividuelModal = () => {
    setAddIndividuelForm({
      nom: '',
      prenom: '',
      club: '',
      sexe: 'M',
      date_naissance: '',
      categorie: '',
    });
    setShowAddIndividuel(true);
  };

  const handleAddIndividuelRegistration = async (e) => {
    e.preventDefault();
    const nom = String(addIndividuelForm.nom || '').trim();
    const prenom = String(addIndividuelForm.prenom || '').trim();
    const club = String(addIndividuelForm.club || '').trim();
    const dateNaissance = String(addIndividuelForm.date_naissance || '').trim();
    if (!nom || !prenom) {
      onToast?.('Nom et prénom obligatoires', 'error');
      return;
    }
    if (!club) {
      onToast?.('Le club est obligatoire', 'error');
      return;
    }
    if (!dateNaissance) {
      onToast?.('La date de naissance est obligatoire', 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createCompetitionRegistration({
        nom,
        prenom,
        club,
        sexe: addIndividuelForm.sexe === 'F' ? 'F' : 'M',
        date_naissance: dateNaissance,
        categorie: String(addIndividuelForm.categorie || '').trim(),
        mode_inscription: 'individuel',
        poids: '',
      });
      setRegistrations((prev) => [created, ...prev]);
      setShowAddIndividuel(false);
      onToast?.(`${prenom} ${nom} ajouté(e) en Individuel`);
    } catch (err) {
      setError(err.message || 'Ajout impossible');
      onToast?.(err.message || 'Ajout impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const persistCompetitionClubs = async (nextClubs) => {
    const updated = await updateCompetition({ competition_clubs: nextClubs });
    setSettings((prev) => ({ ...prev, ...updated }));
  };

  const handleAddCompetitionClub = async (e) => {
    e.preventDefault();
    const nom = clubDraft.trim();
    const ligue = ligueDraft.trim() || '-';
    if (!nom || !clubsEditorCadre) return;
    const current = settings?.competition_clubs || [];
    if (current.some((c) => c.cadre === clubsEditorCadre && String(c.nom).toLowerCase() === nom.toLowerCase())) {
      onToast?.('Ce club est déjà enregistré pour ce cadre', 'error');
      return;
    }
    setSaving(true);
    try {
      await persistCompetitionClubs([...current, { nom, ligue, cadre: clubsEditorCadre }]);
      setClubDraft('');
      setLigueDraft('');
      onToast?.('Club enregistré');
    } catch (err) {
      onToast?.(err.message || 'Impossible d\'enregistrer le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCompetitionClub = async (club) => {
    const current = settings?.competition_clubs || [];
    setSaving(true);
    try {
      await persistCompetitionClubs(current.filter((c) => c.id !== club.id));
      setEditingClub((prev) => (prev?.id === club.id ? null : prev));
      onToast?.('Club retiré');
    } catch (err) {
      onToast?.(err.message || 'Impossible de retirer le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCadreClubsAndRegistrations = async () => {
    if (!clubsEditorCadre) return;
    const cadre = clubsEditorCadre;
    const label = cadre === 'equipe' ? 'Par équipe' : 'Individuel';
    const regsToDelete = registrations.filter((r) => {
      const isTeam = isTeamRegistration(r);
      return cadre === 'equipe' ? isTeam : !isTeam;
    });
    const clubsToDelete = (settings?.competition_clubs || []).filter((c) => c.cadre === cadre);
    if (!regsToDelete.length && !clubsToDelete.length) {
      onToast?.(`Aucun club ni judoka à supprimer pour ${label}`, 'error');
      return;
    }
    const confirmed = window.confirm(
      `Supprimer tous les clubs et judokas enregistrés en ${label} ? Cette action est irréversible.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      if (regsToDelete.length) {
        await Promise.all(regsToDelete.map((r) => deleteCompetitionRegistration(r.id)));
        const ids = new Set(regsToDelete.map((r) => r.id));
        setRegistrations((prev) => prev.filter((r) => !ids.has(r.id)));
      }
      const current = settings?.competition_clubs || [];
      const nextClubs = current.filter((c) => c.cadre !== cadre);
      if (nextClubs.length !== current.length) {
        await persistCompetitionClubs(nextClubs);
      }
      setEditingClub(null);
      setClubDraft('');
      setLigueDraft('');
      onToast?.(`Tous les clubs et judokas ${label} ont été supprimés`);
    } catch (err) {
      setError(err.message || 'Suppression impossible');
      onToast?.(err.message || 'Suppression impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadClubsFromPdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !clubsEditorCadre) return;

    setSaving(true);
    setClubsImportProgress(0);
    try {
      const imported = await extractClubsFromPdfFile(file, setClubsImportProgress);
      const cadre = clubsEditorCadre;
      const current = settings?.competition_clubs || [];
      const existing = new Set(
        current
          .filter((c) => c.cadre === cadre)
          .map((c) => String(c.nom || '').trim().toLowerCase())
      );

      setClubsImportProgress(96);
      await new Promise((r) => setTimeout(r, 0));

      const toAdd = [];
      for (let i = 0; i < imported.length; i += 1) {
        const row = imported[i];
        const nom = String(row.nom || '').trim();
        if (!nom || existing.has(nom.toLowerCase())) continue;
        toAdd.push({
          nom,
          ligue: String(row.ligue || '').trim() || '-',
          cadre,
        });
        existing.add(nom.toLowerCase());
        // 96% → 99% pendant la préparation des clubs à enregistrer
        if (imported.length > 0 && (i % 5 === 0 || i === imported.length - 1)) {
          setClubsImportProgress(96 + Math.round(((i + 1) / imported.length) * 3));
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (!toAdd.length) {
        setClubsImportProgress(100);
        onToast?.('Tous les clubs du PDF sont déjà enregistrés pour ce cadre', 'error');
        return;
      }

      setClubsImportProgress(99);
      await new Promise((r) => setTimeout(r, 0));
      await persistCompetitionClubs([...current, ...toAdd]);
      setClubsImportProgress(100);
      await new Promise((r) => setTimeout(r, 120));
      onToast?.(`${toAdd.length} club(s) importé(s) depuis le PDF`);
    } catch (err) {
      onToast?.(err.message || 'Impossible d\'importer les clubs depuis le PDF', 'error');
    } finally {
      setSaving(false);
      setTimeout(() => setClubsImportProgress(null), 400);
    }
  };

  const handleSaveEditedClub = async (club) => {
    const nom = String(editingClub?.nom || '').trim();
    const ligue = String(editingClub?.ligue || '').trim() || '-';
    if (!nom) {
      onToast?.('Le nom du club est obligatoire', 'error');
      return;
    }
    const current = settings?.competition_clubs || [];
    if (current.some((c) => c.id !== club.id && c.cadre === club.cadre && String(c.nom).toLowerCase() === nom.toLowerCase())) {
      onToast?.('Ce club est déjà enregistré pour ce cadre', 'error');
      return;
    }
    const oldName = club.nom;
    setSaving(true);
    try {
      await persistCompetitionClubs(current.map((c) => (c.id === club.id ? { ...c, nom, ligue } : c)));
      const affected = registrations.filter((r) => {
        const isTeam = isTeamRegistration(r);
        if (club.cadre === 'equipe' && !isTeam) return false;
        if (club.cadre === 'individuel' && isTeam) return false;
        return (r.club || '').trim().toLowerCase() === String(oldName).trim().toLowerCase();
      });
      const updatedList = [];
      for (const row of affected) {
        const updated = await updateCompetitionRegistration(row.id, {
          club: nom,
          nom: row.nom,
          prenom: row.prenom,
          poids: row.poids,
        });
        updatedList.push(updated);
      }
      if (updatedList.length) {
        const byId = new Map(updatedList.map((row) => [row.id, row]));
        setRegistrations((prev) => prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)));
      }
      setEditingClub(null);
      onToast?.('Club modifié');
    } catch (err) {
      onToast?.(err.message || 'Impossible de modifier le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTirageMode = (mode) => {
    const result = mode === 'equipe'
      ? buildTeamDraw(registrations)
      : buildWeightDraw(registrations, settings?.categories_poids_individuel);
    if (!result.groups.length) {
      onToast?.(
        mode === 'equipe'
          ? 'Aucun combat par équipe : chaque club doit avoir des judokas dans au moins 3 catégories du même sexe'
          : 'Aucun combat individuel possible (vérifiez les pesées)',
        'error'
      );
      return;
    }
    setActionMode(null);
    setDrawResult(result);
    setDrawAnimating(true);
  };

  const openEditRegistration = (reg) => {
    setEditRegTarget(reg);
    setEditRegForm({
      nom: reg.nom || '',
      prenom: reg.prenom || '',
      poids: reg.poids || '',
      date_naissance: String(reg.date_naissance || '').slice(0, 10),
    });
  };

  const openEditTeam = (team) => {
    setEditTeamTarget(team);
    setEditTeamClub(team.club || '');
    setEditTeamMembers((team.members || []).map((m) => ({
      id: m.id,
      nom: m.nom || '',
      prenom: m.prenom || '',
      poids: m.poids || '',
      categorie: m.categorie || '',
      sexe: m.sexe === 'F' ? 'F' : 'M',
      role: teamMemberRole(m),
      role_equipe: m.role_equipe,
      taille: m.taille,
    })));
    const defaultSexe = (team.members || []).some((m) => m.sexe === 'F')
      && !(team.members || []).some((m) => m.sexe !== 'F')
      ? 'F'
      : 'M';
    setEditTeamNewJudoka({
      prenom: '',
      nom: '',
      poids: '',
      sexe: defaultSexe,
      role_equipe: 'principal',
    });
  };

  const openReceiptProof = (mode, regs, club = '') => {
    const list = (Array.isArray(regs) ? regs : []).filter(Boolean);
    if (!list.length) {
      onToast?.('Aucune inscription trouvée pour cette preuve de paiement', 'error');
      return;
    }
    const clubName = club || list[0]?.club || '';
    const primary = list[0] || {};
    const parts = String(primary.mode_paiement || '').split('|');
    const telephone = (parts[0] === 'mobile_money' && parts[1])
      ? parts[1].trim()
      : String(primary.telephone || '').trim();
    const orderNumber = extractOrderNumber(primary.mode_paiement);
    const isTeam = mode === 'equipe';
    const montant = isTeam
      ? Math.max(0, Number(primary.montant_paye) || 0)
      : list.reduce((sum, r) => sum + (Math.max(0, Number(r.montant_paye) || 0)), 0);
    const monnaie = String(settings?.frais_monnaie || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
    const exportArgs = {
      competition: settings,
      mode: isTeam ? 'equipe' : 'individuel',
      paiement: { orderNumber, telephone, montant, monnaie },
      participants: list,
      registrations: list,
      club: clubName,
      sexe: primary.sexe,
    };
    setReceiptProof({
      payload: buildReceiptPayloadFromRegistrations({
        competition: settings,
        mode: isTeam ? 'equipe' : 'individuel',
        registrations: list,
        club: clubName,
      }),
      exportArgs,
    });
  };

  const openReceiptProofIndividual = (reg) => {
    if (!reg) return;
    openReceiptProof('individuel', [reg], reg.club || '');
  };

  const openReceiptProofTeam = (team) => {
    const clubName = String(team?.club || '').trim();
    const clubKey = clubName.toLowerCase();
    const idSet = new Set((team?.ids || []).map((id) => String(id)));
    const fromIds = idSet.size
      ? registrations.filter((r) => idSet.has(String(r.id)))
      : [];
    const fromTeamMode = registrations.filter(
      (r) => isTeamRegistration(r)
        && String(r.club || '').trim().toLowerCase() === clubKey,
    );
    const fromClubAny = registrations.filter(
      (r) => String(r.club || '').trim().toLowerCase() === clubKey,
    );
    const fromTeam = Array.isArray(team?.members) ? team.members.filter(Boolean) : [];
    const byId = new Map();
    [...fromIds, ...fromTeamMode, ...fromTeam, ...fromClubAny].forEach((r) => {
      if (!r) return;
      const key = r.id || `${r.prenom || ''}|${r.nom || ''}|${r.categorie || ''}|${r.role_equipe || ''}`;
      if (!byId.has(String(key))) byId.set(String(key), r);
    });
    const members = [...byId.values()];
    if (!members.length) {
      onToast?.('Ajoutez au moins 1 judoka à ce club pour afficher la preuve de paiement', 'error');
      return;
    }
    openReceiptProof('equipe', members, clubName || members[0]?.club || '');
  };

  const handleAddEditTeamJudoka = async (e) => {
    e.preventDefault();
    if (!editTeamTarget) return;
    const club = editTeamClub.trim() || editTeamTarget.club;
    const prenom = String(editTeamNewJudoka.prenom || '').trim();
    const nom = String(editTeamNewJudoka.nom || '').trim();
    const poids = String(editTeamNewJudoka.poids || '').trim();
    const sexe = editTeamNewJudoka.sexe === 'F' ? 'F' : 'M';
    const role = editTeamNewJudoka.role_equipe === 'remplacant' ? 'remplacant' : 'principal';
    if (!club) {
      onToast?.('Le nom du club est obligatoire', 'error');
      return;
    }
    if (!prenom || !nom) {
      onToast?.('Prénom et nom obligatoires', 'error');
      return;
    }
    if (!poids) {
      onToast?.('Indiquez le poids du judoka', 'error');
      return;
    }
    setAddingTeamJudoka(true);
    setError('');
    try {
      const result = await chargeCompetitionTeamFromIndividuel({
        club,
        members: [{
          prenom,
          nom,
          poids,
          sexe,
          role_equipe: role,
          deja_enregistre: false,
        }],
      });
      const created = result.registrations || [];
      setRegistrations((prev) => [...created, ...prev]);
      setEditTeamMembers((prev) => [
        ...created.map((m) => ({
          id: m.id,
          nom: m.nom || '',
          prenom: m.prenom || '',
          poids: m.poids || '',
          categorie: m.categorie || '',
          sexe: m.sexe === 'F' ? 'F' : 'M',
          role: teamMemberRole(m),
          role_equipe: m.role_equipe,
          taille: m.taille,
        })),
        ...prev,
      ]);
      setEditTeamTarget((prev) => (prev ? {
        ...prev,
        members: [...created, ...(prev.members || [])],
        ids: [...created.map((r) => r.id), ...(prev.ids || [])],
      } : prev));
      setEditTeamNewJudoka((prev) => ({
        prenom: '',
        nom: '',
        poids: '',
        sexe: prev.sexe,
        role_equipe: 'principal',
      }));
      onToast?.(`${prenom} ${nom} ajouté(e) à l'équipe`);
    } catch (err) {
      setError(err.message);
      onToast?.(err.message || 'Impossible d\'ajouter le judoka', 'error');
    } finally {
      setAddingTeamJudoka(false);
    }
  };

  const handleRemoveEditTeamMember = async (member) => {
    if (!member?.id || !editTeamTarget) return;
    const label = `${member.prenom || ''} ${member.nom || ''}`.trim() || 'ce judoka';
    const confirmed = window.confirm(
      `Supprimer ${label} de l'équipe ${editTeamClub.trim() || editTeamTarget.club} ?`
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      await deleteCompetitionRegistration(member.id);
      setRegistrations((prev) => prev.filter((r) => r.id !== member.id));
      setEditTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
      setEditTeamTarget((prev) => (prev ? {
        ...prev,
        ids: (prev.ids || []).filter((id) => id !== member.id),
        members: (prev.members || []).filter((m) => m.id !== member.id),
      } : prev));
      onToast?.(`${label} retiré(e) de l'équipe`);
    } catch (err) {
      setError(err.message || 'Suppression impossible');
      onToast?.(err.message || 'Suppression impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!editTeamTarget) return;
    const club = editTeamClub.trim();
    if (!club) {
      onToast?.('Le nom du club est obligatoire', 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let updatedList = [];
      if (editTeamMembers.length) {
        for (const member of editTeamMembers) {
          const updated = await updateCompetitionRegistration(member.id, {
            club,
            nom: member.nom,
            prenom: member.prenom,
            poids: member.poids,
            role_equipe: member.role === 'remplacant' ? 'remplacant' : 'principal',
          });
          updatedList.push(updated);
        }
        const byId = new Map(updatedList.map((row) => [row.id, row]));
        setRegistrations((prev) => prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)));
      }
      const current = settings?.competition_clubs || [];
      const oldName = String(editTeamTarget.club || '').trim().toLowerCase();
      const nextClubs = current.map((c) => (
        c.cadre === 'equipe' && String(c.nom || '').trim().toLowerCase() === oldName
          ? { ...c, nom: club }
          : c
      ));
      if (JSON.stringify(nextClubs) !== JSON.stringify(current)) {
        await persistCompetitionClubs(nextClubs);
      }
      const byId = new Map(updatedList.map((row) => [row.id, row]));
      if (updatedList.length) {
        setEditTeamMembers((prev) => prev.map((m) => {
          const refreshed = byId.get(m.id);
          if (!refreshed) return m;
          return {
            id: refreshed.id,
            nom: refreshed.nom || '',
            prenom: refreshed.prenom || '',
            poids: refreshed.poids || '',
            categorie: refreshed.categorie || m.categorie || '',
            sexe: refreshed.sexe === 'F' ? 'F' : (m.sexe === 'F' ? 'F' : 'M'),
            role: teamMemberRole(refreshed),
            role_equipe: refreshed.role_equipe,
            taille: refreshed.taille,
          };
        }));
      }
      setEditTeamTarget((prev) => (prev ? {
        ...prev,
        club,
        members: (prev.members || []).map((m) => {
          const refreshed = byId.get(m.id);
          return refreshed ? { ...m, ...refreshed, club } : { ...m, club };
        }),
      } : prev));
      setEditTeamClub(club);
      onToast?.('Équipe mise à jour');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message || 'Impossible de modifier l\'équipe', 'error');
    } finally {
      setSaving(false);
    }
  };

  const swapTeamMemberRole = (memberId) => {
    setEditTeamMembers((prev) => {
      const member = prev.find((m) => m.id === memberId);
      if (!member) return prev;
      const cat = teamMemberCategory(member);
      const sexe = member.sexe === 'F' ? 'F' : 'M';
      const currentRole = member.role === 'remplacant' ? 'remplacant' : 'principal';
      const otherRole = currentRole === 'principal' ? 'remplacant' : 'principal';
      const peer = prev.find((m) => (
        m.id !== memberId
        && teamMemberCategory(m) === cat
        && (m.sexe === 'F' ? 'F' : 'M') === sexe
        && (m.role === 'remplacant' ? 'remplacant' : 'principal') === otherRole
      ));
      return prev.map((row) => {
        if (row.id === member.id) {
          return { ...row, role: otherRole, role_equipe: otherRole };
        }
        if (peer && row.id === peer.id) {
          return { ...row, role: currentRole, role_equipe: currentRole };
        }
        return row;
      });
    });
  };

  const handleSaveRegistration = async (e) => {
    e.preventDefault();
    if (!editRegTarget) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetitionRegistration(editRegTarget.id, {
        nom: editRegForm.nom,
        prenom: editRegForm.prenom,
        poids: editRegForm.poids,
        date_naissance: editRegForm.date_naissance,
      });
      setRegistrations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setEditRegTarget(null);
      onToast?.('Inscription mise à jour');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportGrilleCombat = () => {
    if (!drawResult?.groups?.length) {
      onToast?.('Aucune grille de combat à exporter', 'error');
      return;
    }
    try {
      exportCompetitionDrawToPdf(drawResult, settings || {});
      onToast?.('Grille de combat exportée en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de l\'export de la grille', 'error');
    }
  };

  const handleDeleteRegistration = async () => {
    if (!deleteRegTarget) return;
    setSaving(true);
    setError('');
    try {
      await deleteCompetitionRegistration(deleteRegTarget.id);
      setRegistrations((prev) => prev.filter((r) => r.id !== deleteRegTarget.id));
      setDeleteRegTarget(null);
      onToast?.('Judoka retiré de la compétition');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClubTeam = async () => {
    if (!deleteClubTarget) return;
    setSaving(true);
    setError('');
    try {
      if (deleteClubTarget.ids?.length) {
        await Promise.all(deleteClubTarget.ids.map((id) => deleteCompetitionRegistration(id)));
        const ids = new Set(deleteClubTarget.ids);
        setRegistrations((prev) => prev.filter((r) => !ids.has(r.id)));
      }
      const current = settings?.competition_clubs || [];
      const target = String(deleteClubTarget.club || '').trim().toLowerCase();
      const nextClubs = current.filter((c) => !(
        c.cadre === 'equipe' && String(c.nom || '').trim().toLowerCase() === target
      ));
      if (nextClubs.length !== current.length) {
        await persistCompetitionClubs(nextClubs);
      }
      setDeleteClubTarget(null);
      onToast?.('Équipe du club retirée de la compétition');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
        <p>Chargement de la compétition...</p>
      </div>
    );
  }

  const publicUrl = competitionPublicUrl(settings?.public_token);
  const accessBlocked = settings && !settings.access_ok && !settings.can_toggle_access;
  const configured = Boolean(settings?.configured);
  const isPublic = Boolean(settings?.public_enabled);
  const isClosed = configured && !isPublic;
  const canWeigh = configured && isPublic;
  const weighedCount = registrations.filter((r) => r.poids).length;
  const individualCount = registrations.filter((r) => !isTeamRegistration(r)).length;
  const teamCount = registrations.length - individualCount;
  const individualWeighed = registrations.filter((r) => !isTeamRegistration(r) && r.poids).length;
  const teamWeighed = registrations.filter((r) => isTeamRegistration(r) && r.poids).length;
  const clubsEditorSearchTerm = clubsEditorSearch.trim().toLowerCase();
  const clubsEditorCadreClubs = (settings?.competition_clubs || []).filter(
    (c) => c.cadre === clubsEditorCadre,
  );
  const clubsEditorList = clubsEditorCadreClubs.filter((c) => {
    if (!clubsEditorSearchTerm) return true;
    const haystack = `${c.nom || ''} ${c.ligue || ''}`.toLowerCase();
    return haystack.includes(clubsEditorSearchTerm);
  });
  const clubsEditorLigueStats = (() => {
    const counts = new Map();
    for (const club of clubsEditorCadreClubs) {
      const ligue = String(club.ligue || '').trim() || 'Sans ligue';
      counts.set(ligue, (counts.get(ligue) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([ligue, count]) => ({ ligue, count }))
      .sort((a, b) => b.count - a.count || a.ligue.localeCompare(b.ligue, 'fr'));
  })();
  // Tirage actif si pesée clôturée, ou si le lien d'inscription est Off
  const tirageReady = isClosed && registrations.length > 0;

  return (
    <div className="competition-page">
      <header className="competition-hero">
        <div className="competition-hero-main">
          <div>
            <p className="competition-kicker">FENACOJU · Directeur Compétition</p>
            <h2>Compétition</h2>
            <p className="subtitle">
              Paramétrez l&apos;événement, publiez l&apos;inscription et suivez les judokas en direct.
            </p>
          </div>
          <div className="competition-hero-actions">
            <span className={`live-pill ${liveTick ? 'pulse' : ''}`} title="Actualisation automatique chaque seconde">
              <span className="live-dot" />
              Live
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowReceiptScan(true)}
            >
              Scan Reçu
            </button>
          </div>
        </div>

        {!accessBlocked && (
          <div className="competition-stats-strip">
            <div className="competition-stat competition-stat-emphasis">
              <strong>{registrations.length}</strong>
              <span>Judokas inscrits</span>
              <div className="competition-stat-split" aria-label="Répartition Individuel et Par équipe">
                <span className="competition-stat-chip competition-stat-chip-indiv">
                  Individuel <b>{individualCount}</b>
                </span>
                <span className="competition-stat-chip competition-stat-chip-team">
                  Par équipe <b>{teamCount}</b>
                </span>
              </div>
            </div>
            <div className="competition-stat competition-stat-emphasis">
              <strong>{weighedCount}</strong>
              <span>Pesés</span>
              <div className="competition-stat-split" aria-label="Pesés Individuel et Par équipe">
                <span className="competition-stat-chip competition-stat-chip-indiv">
                  Individuel <b>{individualWeighed}</b>
                </span>
                <span className="competition-stat-chip competition-stat-chip-team">
                  Par équipe <b>{teamWeighed}</b>
                </span>
              </div>
            </div>
            <div className="competition-stat">
              <strong>{isPublic ? 'Ouvertes' : (configured ? 'Clôturées' : 'Non')}</strong>
              <span>Inscriptions</span>
            </div>
            <div className="competition-stat">
              <strong>{settings?.lieu || '—'}</strong>
              <span>{formatDateFr(settings?.date_debut)}</span>
            </div>
          </div>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {accessBlocked ? (
        <div className="empty-state">
          <h3>Compétition non activée</h3>
          <p>Attendez qu&apos;un Admin ou Coordon active le bouton Compétition.</p>
        </div>
      ) : (
        <>
          <div className={`competition-layout ${configured ? 'competition-layout-single' : ''}`}>
            {!configured && (
              <form className="form-card competition-form" onSubmit={handleSave}>
                <div className="competition-section-head">
                  <h3>Paramètres</h3>
                  <p>Renseignez ces informations pour activer la publication.</p>
                </div>
                <ParamsFormFields
                  form={form}
                  onChange={handleChange}
                  onCategoriesChange={handleCategoriesChange}
                  onIndividualCategoriesChange={handleIndividualCategoriesChange}
                  onLogoSelected={handleLogoSelected}
                  onLogoRemoved={handleLogoRemoved}
                  logoUploading={logoUploading}
                />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}

            <aside className="form-card competition-public-panel">
              <div className="competition-section-head">
                <h3>Publication</h3>
                <p>Contrôlez l&apos;accès public aux inscriptions.</p>
              </div>

              <div className="competition-public-header">
                <div>
                  <p className="competition-status-label">Statut du lien</p>
                  <strong>{isPublic ? 'On' : 'Off'}</strong>
                </div>
                <label className="toggle-switch" title="Activer / clôturer les inscriptions">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={handleTogglePublic}
                    disabled={saving || !configured}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-label">{isPublic ? 'On' : 'Off'}</span>
                </label>
              </div>

              {!configured && (
                <p className="form-hint">Renseignez le nom, la date et le lieu avant de publier.</p>
              )}

              {isClosed && (
                <div className="competition-closed-banner">
                  <strong>Les Inscriptions sont clôturées</strong>
                  <p>Le lien public n&apos;accepte plus de nouvelles inscriptions.</p>
                </div>
              )}

              {configured && publicUrl && (
                <div className="competition-link-block">
                  <label>Lien d&apos;inscription</label>
                  <div className="competition-link-row">
                    <input
                      type="text"
                      readOnly
                      value={publicUrl}
                      className={`competition-link-input ${isClosed ? 'is-closed' : ''}`}
                    />
                    <button
                      type="button"
                      className="btn btn-accent competition-link-action"
                      onClick={() => handleCopyLink(publicUrl)}
                      disabled={isClosed}
                    >
                      Copier
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline competition-link-action"
                      onClick={() => setShowLinkQrModal(true)}
                      disabled={isClosed}
                    >
                      QR Code
                    </button>
                    <a
                      className={`btn btn-outline competition-link-action ${isClosed ? 'is-disabled' : ''}`}
                      href={isClosed ? undefined : publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (isClosed) e.preventDefault();
                      }}
                    >
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        applySettingsForm(settings);
                        setShowParamsModal(true);
                      }}
                    >
                      Paramètres de Compétition
                    </button>
                  </div>
                </div>
              )}

              {isClosed && (
                <div className="competition-delete-row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={saving}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Supprimer le lien
                  </button>
                  <p className="form-hint">
                    Rend le lien définitivement inaccessible et efface la liste des inscrits.
                  </p>
                </div>
              )}
            </aside>
          </div>

          <section className="form-card competition-inscriptions">
            <div className="competition-inscriptions-head">
              <div>
                <h3>Inscriptions</h3>
                <p className="form-hint">
                  Liste actualisée en direct · {registrations.length} judoka{registrations.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="competition-inscriptions-actions">
                <button
                  type="button"
                  className="btn btn-outline competition-action-btn"
                  onClick={() => openActionMode('clubs')}
                >
                  Club
                </button>
                <button
                  type="button"
                  className={`btn btn-primary competition-action-btn ${!canWeigh ? 'is-disabled' : ''}`}
                  onClick={() => openActionMode('weigh')}
                >
                  Pesé
                </button>
                <button
                  type="button"
                  className="btn btn-outline competition-action-btn"
                  onClick={() => openActionMode('export')}
                  disabled={exporting || registrations.length === 0}
                >
                  {exporting ? 'Export...' : 'Exporter Liste'}
                </button>
              </div>
            </div>

            <div className="competition-inscriptions-split">
              <div className="competition-inscriptions-pane">
                <div className="competition-inscriptions-pane-head">
                  <h4>Individuel</h4>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}
                    onClick={openAddIndividuelModal}
                  >
                    Ajouter
                  </button>
                </div>
                <RegistrationsTable
                  registrations={registrations.filter((r) => !isTeamRegistration(r))}
                  onEdit={openEditRegistration}
                  onDelete={setDeleteRegTarget}
                  onShowReceipt={openReceiptProofIndividual}
                />
              </div>
              <div className="competition-inscriptions-pane">
                <div className="competition-inscriptions-pane-head">
                  <h4>Par Équipe</h4>
                </div>
                <TeamClubsTable
                  clubs={mergeRegisteredTeamClubs(settings?.competition_clubs, registrations)}
                  onEdit={openEditTeam}
                  onDelete={setDeleteClubTarget}
                  onCharge={openChargeTeam}
                  onShowReceipt={openReceiptProofTeam}
                />
              </div>
            </div>
          </section>
        </>
      )}

      {showParamsModal && (
        <div className="confirm-overlay" onClick={() => setShowParamsModal(false)}>
          <div className="competition-params-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <h3>Paramètres de Compétition</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowParamsModal(false)}>
                Fermer
              </button>
            </div>
            <form onSubmit={handleSave}>
              <ParamsFormFields
                form={form}
                onChange={handleChange}
                onCategoriesChange={handleCategoriesChange}
                onIndividualCategoriesChange={handleIndividualCategoriesChange}
                onLogoSelected={handleLogoSelected}
                onLogoRemoved={handleLogoRemoved}
                logoUploading={logoUploading}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowParamsModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLinkQrModal && publicUrl && (
        <CompetitionLinkQrModal
          url={publicUrl}
          competitionName={settings?.nom || ''}
          onClose={() => setShowLinkQrModal(false)}
        />
      )}

      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer le lien ?</h3>
            <p>
              Cette action rend le lien définitivement inaccessible, efface tous les judokas inscrits
              et désactive la pesée. Continuer ?
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteLink} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRegTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteRegTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l&apos;inscription ?</h3>
            <p>
              Retirer{' '}
              <strong>{`${deleteRegTarget.prenom || ''} ${deleteRegTarget.nom || ''}`.trim()}</strong>
              {' '}de la compétition ?
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteRegTarget(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteRegistration} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteClubTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteClubTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l&apos;équipe ?</h3>
            <p>
              {(deleteClubTarget.ids?.length || 0) > 0
                ? <>Retirer le club <strong>{deleteClubTarget.club}</strong> et tous ses judokas d&apos;équipe ?</>
                : <>Retirer le club <strong>{deleteClubTarget.club}</strong> de la liste Par équipe ?</>}
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteClubTarget(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteClubTeam} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {chargeTeamTarget && (
        <div className="confirm-overlay" onClick={() => setChargeTeamTarget(null)}>
          <div className="competition-charge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <div>
                <h3>Charger des judokas</h3>
                <p className="form-hint">
                  Sélectionnez des judokas inscrits en Individuel (tous clubs) pour l&apos;équipe{' '}
                  <strong>{chargeTeamTarget.club}</strong>. Leur inscription Individuel reste inchangée.
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setChargeTeamTarget(null)}>
                Fermer
              </button>
            </div>
            {chargeableIndividuelRegistrations(registrations).length === 0 ? (
              <p className="form-hint">Aucun judoka Individuel disponible à charger (déjà en équipe ou non inscrit).</p>
            ) : (
              <div className="competition-charge-list">
                {chargeableIndividuelRegistrations(registrations).map((r) => {
                  const selected = Boolean(chargeSelections[r.id]);
                  return (
                    <div key={r.id} className={`competition-charge-row ${selected ? 'is-selected' : ''}`}>
                      <label className="competition-charge-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleChargeJudoka(r)}
                        />
                        <span>
                          <strong>{r.prenom} {r.nom}</strong>
                          <small>{r.club || 'Sans club'} · {r.sexe === 'F' ? 'F' : 'M'}{r.categorie ? ` · ${r.categorie}` : ''}</small>
                        </span>
                      </label>
                      {selected && (
                        <div className="competition-charge-fields">
                          <input
                            type="text"
                            placeholder="Poids (kg)"
                            value={chargeSelections[r.id]?.poids || ''}
                            onChange={(e) => setChargeSelections((prev) => ({
                              ...prev,
                              [r.id]: { ...prev[r.id], poids: e.target.value },
                            }))}
                            required
                          />
                          <select
                            value={chargeSelections[r.id]?.role_equipe || 'principal'}
                            onChange={(e) => setChargeSelections((prev) => ({
                              ...prev,
                              [r.id]: { ...prev[r.id], role_equipe: e.target.value },
                            }))}
                          >
                            <option value="principal">Principal</option>
                            <option value="remplacant">Remplaçant</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setChargeTeamTarget(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmChargeTeam}
                disabled={saving || Object.keys(chargeSelections).length === 0}
              >
                {saving ? 'Chargement...' : 'Charger dans l\'équipe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddIndividuel && (
        <div className="confirm-overlay" onClick={() => !saving && setShowAddIndividuel(false)}>
          <div className="confirm-dialog competition-edit-reg-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un judoka · Individuel</h3>
            <form onSubmit={handleAddIndividuelRegistration}>
              <div className="competition-edit-reg-grid">
                <div className="form-group">
                  <label htmlFor="add-indiv-prenom">Prénom</label>
                  <input
                    id="add-indiv-prenom"
                    value={addIndividuelForm.prenom}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, prenom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="add-indiv-nom">Nom</label>
                  <input
                    id="add-indiv-nom"
                    value={addIndividuelForm.nom}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, nom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group form-group-full">
                  <label htmlFor="add-indiv-club">Club</label>
                  <CompetitionClubSelect
                    id="add-indiv-club"
                    name="club"
                    value={addIndividuelForm.club}
                    clubs={(settings?.competition_clubs || [])
                      .filter((c) => c.cadre === 'individuel')
                      .map((c) => ({ id: c.id, nom: c.nom, ligue: c.ligue }))}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, club: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="add-indiv-sexe">Sexe</label>
                  <select
                    id="add-indiv-sexe"
                    value={addIndividuelForm.sexe}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, sexe: e.target.value }))}
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="add-indiv-naissance">Date de naissance</label>
                  <input
                    id="add-indiv-naissance"
                    type="date"
                    value={addIndividuelForm.date_naissance}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, date_naissance: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group form-group-full">
                  <label htmlFor="add-indiv-categorie">Catégorie</label>
                  <select
                    id="add-indiv-categorie"
                    value={addIndividuelForm.categorie}
                    onChange={(e) => setAddIndividuelForm((prev) => ({ ...prev, categorie: e.target.value }))}
                  >
                    <option value="">— Optionnel —</option>
                    {(CATEGORIES || []).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddIndividuel(false)} disabled={saving}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}
                  disabled={saving}
                >
                  {saving ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editRegTarget && (
        <div className="confirm-overlay" onClick={() => setEditRegTarget(null)}>
          <div className="confirm-dialog competition-edit-reg-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier l&apos;inscription</h3>
            <form onSubmit={handleSaveRegistration}>
              <div className="competition-edit-reg-grid">
                <div className="form-group">
                  <label htmlFor="edit-prenom">Prénom</label>
                  <input
                    id="edit-prenom"
                    value={editRegForm.prenom}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, prenom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-nom">Nom</label>
                  <input
                    id="edit-nom"
                    value={editRegForm.nom}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, nom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-date-naissance">Date de naissance</label>
                  <input
                    id="edit-date-naissance"
                    type="date"
                    value={editRegForm.date_naissance}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, date_naissance: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-poids">Poids (kg)</label>
                  <input
                    id="edit-poids"
                    value={editRegForm.poids}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, poids: e.target.value }))}
                    placeholder="Ex. 66"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditRegTarget(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTeamTarget && (
        <div className="confirm-overlay" onClick={() => !addingTeamJudoka && setEditTeamTarget(null)}>
          <div className="confirm-dialog competition-team-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier l&apos;équipe</h3>
            <form onSubmit={handleSaveTeam}>
              <div className="form-group">
                <label htmlFor="edit-team-club">Nom du club</label>
                <input
                  id="edit-team-club"
                  value={editTeamClub}
                  onChange={(e) => setEditTeamClub(e.target.value)}
                  required
                />
              </div>
              <div className="competition-team-edit-list">
                {editTeamMembers.length === 0 && (
                  <p className="form-hint">Aucun judoka n&apos;est encore rattaché à ce club.</p>
                )}
                {groupEditMembersByCategory(editTeamMembers).map((bucket) => (
                  <section key={bucket.key} className="competition-team-edit-cat">
                    <h4>
                      {bucket.cat}
                      <span> · {bucket.sexe === 'F' ? 'Fille' : 'Garçon'}</span>
                    </h4>
                    {['principal', 'remplacant'].map((role) => {
                      const member = bucket[role];
                      if (!member) return null;
                      return (
                        <div key={member.id} className="competition-team-edit-row competition-team-edit-row-inline">
                          <div className="competition-team-edit-inline-fields">
                            <div className="form-group">
                              <label htmlFor={`edit-team-prenom-${member.id}`}>Prénom</label>
                              <input
                                id={`edit-team-prenom-${member.id}`}
                                value={member.prenom}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, prenom: e.target.value } : row
                                )))}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-team-nom-${member.id}`}>Nom</label>
                              <input
                                id={`edit-team-nom-${member.id}`}
                                value={member.nom}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, nom: e.target.value } : row
                                )))}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-team-poids-${member.id}`}>Poids</label>
                              <input
                                id={`edit-team-poids-${member.id}`}
                                value={member.poids}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, poids: e.target.value } : row
                                )))}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-team-role-${member.id}`}>Rôle</label>
                              <select
                                id={`edit-team-role-${member.id}`}
                                value={member.role === 'remplacant' ? 'remplacant' : 'principal'}
                                onChange={(e) => {
                                  const nextRole = e.target.value === 'remplacant' ? 'remplacant' : 'principal';
                                  setEditTeamMembers((prev) => {
                                    const peer = prev.find((m) => (
                                      m.id !== member.id
                                      && teamMemberCategory(m) === teamMemberCategory(member)
                                      && (m.sexe === 'F' ? 'F' : 'M') === (member.sexe === 'F' ? 'F' : 'M')
                                      && (m.role === 'remplacant' ? 'remplacant' : 'principal') === nextRole
                                    ));
                                    return prev.map((row) => {
                                      if (row.id === member.id) {
                                        return { ...row, role: nextRole, role_equipe: nextRole };
                                      }
                                      if (peer && row.id === peer.id) {
                                        const swapped = nextRole === 'principal' ? 'remplacant' : 'principal';
                                        return { ...row, role: swapped, role_equipe: swapped };
                                      }
                                      return row;
                                    });
                                  });
                                }}
                              >
                                <option value="principal">Principal</option>
                                <option value="remplacant">Remplaçant</option>
                              </select>
                            </div>
                            {bucket.principal && bucket.remplacant && role === 'principal' && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm competition-team-swap-btn"
                                onClick={() => swapTeamMemberRole(member.id)}
                                title="Permuter Principal / Remplaçant"
                                disabled={saving || addingTeamJudoka}
                              >
                                ⇄
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-icon btn-icon-delete"
                              title="Supprimer le judoka"
                              disabled={saving || addingTeamJudoka}
                              onClick={() => handleRemoveEditTeamMember(member)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditTeamTarget(null)} disabled={addingTeamJudoka || saving}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || addingTeamJudoka}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div className="competition-team-add-block">
              <div className="competition-cat-block-head">
                <span className="competition-cat-block-kicker">Nouveau</span>
                <h4>Ajouter un judoka</h4>
              </div>
              <p className="form-hint">Ajoute un judoka à cette équipe sans passer par les modifications ci-dessus.</p>
              <form onSubmit={handleAddEditTeamJudoka}>
                <div className="competition-team-edit-inline-fields competition-team-add-fields">
                  <div className="form-group">
                    <label htmlFor="edit-team-new-prenom">Prénom *</label>
                    <input
                      id="edit-team-new-prenom"
                      value={editTeamNewJudoka.prenom}
                      onChange={(e) => setEditTeamNewJudoka((prev) => ({ ...prev, prenom: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-team-new-nom">Nom *</label>
                    <input
                      id="edit-team-new-nom"
                      value={editTeamNewJudoka.nom}
                      onChange={(e) => setEditTeamNewJudoka((prev) => ({ ...prev, nom: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-team-new-poids">Poids (kg) *</label>
                    <input
                      id="edit-team-new-poids"
                      value={editTeamNewJudoka.poids}
                      onChange={(e) => setEditTeamNewJudoka((prev) => ({ ...prev, poids: e.target.value }))}
                      placeholder="Ex. 66"
                      inputMode="decimal"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-team-new-sexe">Sexe</label>
                    <select
                      id="edit-team-new-sexe"
                      value={editTeamNewJudoka.sexe}
                      disabled
                      title="Sexe fixé selon l'équipe du club (Garçon ou Fille)"
                    >
                      <option value="M">Garçon</option>
                      <option value="F">Fille</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-team-new-role">Rôle</label>
                    <select
                      id="edit-team-new-role"
                      value={editTeamNewJudoka.role_equipe}
                      onChange={(e) => setEditTeamNewJudoka((prev) => ({ ...prev, role_equipe: e.target.value }))}
                    >
                      <option value="principal">Principal</option>
                      <option value="remplacant">Remplaçant</option>
                    </select>
                  </div>
                </div>
                <div className="confirm-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addingTeamJudoka || saving}
                  >
                    {addingTeamJudoka ? 'Ajout...' : 'Ajouter le judoka'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {clubsEditorCadre && (
        <div
          className="confirm-overlay"
          onClick={() => {
            if (clubsImportProgress == null) {
              setClubsEditorCadre(null);
              setClubsEditorSearch('');
            }
          }}
        >
          <div className="confirm-dialog competition-team-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clubs · {clubsEditorCadre === 'equipe' ? 'Par équipe' : 'Individuel'}</h3>
            <div className="competition-clubs-editor-stats" aria-label="Statistiques des clubs">
              <div className="competition-clubs-editor-stat-total">
                <strong>{clubsEditorCadreClubs.length}</strong>
                <span>
                  club{clubsEditorCadreClubs.length > 1 ? 's' : ''} enregistré
                  {clubsEditorCadreClubs.length > 1 ? 's' : ''}
                </span>
              </div>
              {clubsEditorLigueStats.length > 0 && (
                <ul className="competition-clubs-editor-stat-ligues">
                  {clubsEditorLigueStats.map(({ ligue, count }) => (
                    <li key={ligue}>
                      <span className="competition-clubs-editor-stat-ligue">{ligue}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {clubsImportProgress != null && (
              <div className="clubs-import-progress" role="status" aria-live="polite">
                <p>Chargement des clubs…</p>
                <div className="clubs-import-progress-track">
                  <div
                    className="clubs-import-progress-fill"
                    style={{ width: `${clubsImportProgress}%` }}
                  />
                </div>
                <span className="clubs-import-progress-value">{clubsImportProgress}%</span>
              </div>
            )}
            <form onSubmit={handleAddCompetitionClub}>
              <div className="competition-club-fields-row">
                <div className="form-group">
                  <label htmlFor="competition-club-name">Nom du club</label>
                  <input
                    id="competition-club-name"
                    value={clubDraft}
                    onChange={(e) => setClubDraft(e.target.value)}
                    placeholder="Ex. Club Judo Kinshasa"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="competition-club-ligue">Ligue</label>
                  <input
                    id="competition-club-ligue"
                    value={ligueDraft}
                    onChange={(e) => setLigueDraft(e.target.value)}
                    placeholder="Ex. Kinshasa"
                  />
                </div>
              </div>
              <div className="confirm-actions" style={{ marginBottom: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving || !clubDraft.trim()}>
                  {saving ? 'Enregistrement...' : 'Ajouter'}
                </button>
              </div>
            </form>
            {clubsEditorCadreClubs.length > 0 && (
              <div className="competition-clubs-editor-search">
                <input
                  type="search"
                  className="search-input"
                  value={clubsEditorSearch}
                  onChange={(e) => setClubsEditorSearch(e.target.value)}
                  placeholder="Rechercher un club..."
                  aria-label="Rechercher un club"
                />
              </div>
            )}
            {clubsEditorCadreClubs.length === 0 ? (
              <p className="form-hint">Aucun club enregistré pour ce cadre.</p>
            ) : clubsEditorList.length === 0 ? (
              <p className="form-hint">Aucun club ne correspond à « {clubsEditorSearch.trim()} ».</p>
            ) : (
              <ul className="competition-club-editor-list">
                {clubsEditorList.map((club) => (
                    <li key={club.id}>
                      {editingClub?.id === club.id ? (
                        <div className="competition-club-edit-fields competition-club-fields-row">
                          <input
                            value={editingClub.nom}
                            onChange={(e) => setEditingClub((prev) => ({ ...prev, nom: e.target.value }))}
                            aria-label="Nouveau nom du club"
                            placeholder="Nom du club"
                          />
                          <input
                            value={editingClub.ligue || ''}
                            onChange={(e) => setEditingClub((prev) => ({ ...prev, ligue: e.target.value }))}
                            aria-label="Ligue du club"
                            placeholder="Ligue"
                          />
                        </div>
                      ) : (
                        <span className="competition-club-list-label">
                          <ClubLigueLabel nom={club.nom} ligue={club.ligue} />
                        </span>
                      )}
                      <div className="actions-cell">
                        {editingClub?.id === club.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={saving}
                              onClick={() => handleSaveEditedClub(club)}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingClub(null)}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-edit"
                            title="Modifier"
                            disabled={saving}
                            onClick={() => setEditingClub({
                              id: club.id,
                              nom: club.nom,
                              ligue: club.ligue || '',
                            })}
                          >
                            <IconEdit />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-delete"
                          title="Retirer"
                          disabled={saving}
                          onClick={() => handleRemoveCompetitionClub(club)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
            <div className="confirm-actions">
              <input
                ref={clubsPdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={handleLoadClubsFromPdf}
              />
              <button
                type="button"
                className="btn"
                style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}
                disabled={saving}
                onClick={() => clubsPdfInputRef.current?.click()}
              >
                {saving ? 'Chargement…' : 'Charger'}
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                disabled={saving}
                onClick={handleClearCadreClubsAndRegistrations}
              >
                {saving ? 'Suppression…' : 'Supprimer'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={clubsImportProgress != null}
                onClick={() => {
                  setClubsEditorCadre(null);
                  setClubsEditorSearch('');
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMode && !drawAnimating && (
        <div className="confirm-overlay" onClick={() => setActionMode(null)}>
          <div className="competition-draw-mode-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <div>
                <h3>
                  {actionMode === 'weigh' && 'Pesé'}
                  {actionMode === 'export' && 'Exporter Liste'}
                  {actionMode === 'draw' && 'Tirage au sort'}
                  {actionMode === 'clubs' && 'Club'}
                </h3>
                <p className="form-hint">Choisissez Individuel ou Par équipe.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActionMode(null)}>
                Fermer
              </button>
            </div>
            <div className="competition-draw-mode-actions">
              <button type="button" className="btn btn-tirage competition-draw-mode-btn" onClick={() => handleActionMode('individuel')}>
                Individuel
              </button>
              <button type="button" className="btn btn-primary competition-draw-mode-btn" onClick={() => handleActionMode('equipe')}>
                Par Equipe
              </button>
            </div>
          </div>
        </div>
      )}

      {drawAnimating && drawResult && (
        <div className="draw-animation-overlay" role="dialog" aria-modal="true" aria-label="Animation du tirage au sort">
          <DrawAnimation
            durationMs={10000}
            items={
              drawResult.mode === 'equipe'
                ? drawResult.groups.flatMap((g) => (g.matches || []).flatMap((m) => [m.clubA, m.clubB]))
                : drawResult.groups.flatMap((g) => (g.seedOrder || []).map((s) => s.label))
            }
            title={drawResult.mode === 'equipe' ? 'Tirage par équipes' : 'Tirage individuel'}
            onDone={() => setDrawAnimating(false)}
          />
        </div>
      )}

      {drawResult && !drawAnimating && (
        <div className="confirm-overlay" onClick={() => setDrawResult(null)}>
          <div className="competition-draw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <div>
                <h3>Tirage au sort · {drawResult.modeLabel}</h3>
                <p className="form-hint">
                  {drawResult.totalFights} combat{drawResult.totalFights > 1 ? 's' : ''} · {drawResult.totalJudokas} judoka{drawResult.totalJudokas > 1 ? 's' : ''}
                  {drawResult.mode === 'individuel' ? ' · par poids (Garçons / Filles)' : ' · clubs puis catégories de poids'}
                </p>
              </div>
              <div className="competition-inscriptions-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setDrawResult(null); setActionMode('draw'); }}>
                  Mode
                </button>
                <button type="button" className="btn btn-tirage" onClick={handleExportGrilleCombat}>
                  Grille de Combat
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawResult(null)}>
                  Fermer
                </button>
              </div>
            </div>

            <div className="competition-draw-groups">
              {drawResult.groups.map((group) => (
                <section key={group.key} className="competition-draw-group">
                  <header>
                    <h4>{group.title}</h4>
                    <span>{group.count} judoka{group.count > 1 ? 's' : ''}</span>
                  </header>
                  {group.mode === 'equipe' ? (
                    <>
                      {(group.matches || []).length === 0 && !group.bye && (
                        <p className="form-hint">Pas de rencontre d&apos;équipes dans cette catégorie.</p>
                      )}
                      <ul className="competition-draw-team-matches">
                        {(group.matches || []).map((match) => (
                          <li key={match.id} className="competition-draw-team-match">
                            <p className="competition-draw-club-vs">
                              <strong>{match.clubA}</strong>
                              <span className="competition-draw-vs">vs</span>
                              <strong>{match.clubB}</strong>
                            </p>
                            <ul className="competition-draw-fights">
                              {(match.byWeight || [{ poids: group.poids, fights: match.fights }]).flatMap((bucket) =>
                                bucket.fights.map((fight, idx) => (
                                  <li key={fight.id}>
                                    <span className="competition-draw-fight-num">
                                      {bucket.poids} kg · Combat {idx + 1}
                                    </span>
                                    <strong>{fight.labelA}</strong>
                                    <span className="competition-draw-vs">vs</span>
                                    <strong>{fight.labelB}</strong>
                                  </li>
                                ))
                              )}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      {group.fights.length === 0 && !group.bye && (
                        <p className="form-hint">Pas de combat dans cette catégorie.</p>
                      )}
                      <ul className="competition-draw-fights">
                        {group.fights.map((fight, idx) => (
                          <li key={fight.id}>
                            <span className="competition-draw-fight-num">Combat {idx + 1}</span>
                            <strong>{fight.labelA}</strong>
                            <span className="competition-draw-vs">vs</span>
                            <strong>{fight.labelB}</strong>
                            <p>
                              {(fight.a.club || '—')} · {(fight.b.club || '—')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {group.bye && (
                    <p className="competition-draw-bye">
                      Exempt : <strong>{group.bye.label}</strong>
                      {group.bye.club ? ` (${group.bye.club})` : ''}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {showReceiptScan && (
        <ReceiptScanModal
          competition={settings}
          registrations={registrations}
          onClose={() => setShowReceiptScan(false)}
        />
      )}

      {receiptProof && (
        <CompetitionReceiptProofModal
          payload={receiptProof.payload}
          exportArgs={receiptProof.exportArgs}
          onClose={() => setReceiptProof(null)}
        />
      )}
    </div>
  );
}
