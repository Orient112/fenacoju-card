import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  fetchStats,
  fetchJudokas,
  fetchUsers,
  fetchArbitres,
  createJudoka,
  updateJudoka,
  deleteJudoka,
  deleteUser,
  deleteArbitre,
  validateUser,
  rejectUser,
  fetchCurrentUser,
  logoutUser,
  fetchClubs,
  fetchUnreadMessages,
  fetchCompetition,
  setCompetitionAccess,
  fetchEntenteCompetitionAccess,
  setEntenteCompetitionAccess,
  setEntenteCompetitionAccessBulk,
  getToken,
  USER_TYPES,
  resolveMediaUrl,
} from './api';
import Login from './pages/Login';
import ResetPasswordModal from './components/ResetPasswordModal';
import ClubInfoPanel from './components/ClubInfoPanel';
import StatCard from './components/StatCard';
import {
  IconPeople,
  IconPerson,
  IconCheck,
  IconAlert,
  IconBuilding,
  IconWhistle,
  IconFlag,
} from './components/ActionIcons';
import {
  applyFederationTheme,
  clearFederationTheme,
  entityLabel,
  isCardVisible,
  menuLabel,
  mergeFederationSettings,
} from './utils/federationConfig';
import BrandLoader from './components/BrandLoader';

const Messages = lazy(() => import('./pages/Messages'));
const Settings = lazy(() => import('./pages/Settings'));
const JudokaForm = lazy(() => import('./components/JudokaForm'));
const UserForm = lazy(() => import('./components/UserForm'));
const ArbitreForm = lazy(() => import('./components/ArbitreForm'));
const JudokaList = lazy(() => import('./components/JudokaList'));
const UserList = lazy(() => import('./components/UserList'));
const ArbitreList = lazy(() => import('./components/ArbitreList'));
const CardModal = lazy(() => import('./components/CardModal'));
const QrScanModal = lazy(() => import('./components/QrScanModal'));
const CreateTypeModal = lazy(() => import('./components/CreateTypeModal'));
const ClubDetailModal = lazy(() => import('./components/ClubDetailModal'));
const GradePassationModal = lazy(() => import('./components/GradePassationModal'));
const JudokaFicheModal = lazy(() => import('./components/JudokaFicheModal'));
const JudokaAthleteSheetModal = lazy(() => import('./components/JudokaAthleteSheetModal'));
const TransferModal = lazy(() => import('./components/TransferModal'));
const AccountDetailModal = lazy(() => import('./components/AccountDetailModal'));
const CompetitionSettings = lazy(() => import('./pages/CompetitionSettings'));
const FederationSettings = lazy(() => import('./pages/FederationSettings'));
const SuperAdminConfigurations = lazy(() => import('./pages/SuperAdminConfigurations'));
const SuperAdminFederations = lazy(() => import('./components/SuperAdminFederations'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard'));

function PageLoader({ label = 'Chargement...' }) {
  return <BrandLoader label={label} />;
}


function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return <div className={`toast toast-${type}`}>{message}</div>;
}

function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Supprimer' }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-outline" onClick={onCancel}>Annuler</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function exportToCsv(judokas) {
  const headers = ['N° Carte', 'Nom', 'Prénom', 'Date naissance', 'Sexe', 'Club', 'Grade', 'Catégorie', 'Licence', 'Téléphone', 'Email', 'Inscription', 'Statut'];
  const rows = judokas.map((j) => [
    j.numero_carte, j.nom, j.prenom, j.date_naissance, j.sexe, j.club,
    j.grade, j.categorie, j.numero_licence, j.telephone, j.email,
    j.date_inscription, j.statut,
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fenacoju-judokas-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getUserDisplayName(user) {
  if (!user) return '';
  if (user.type === 'superadmin') {
    return `${user.prenom || ''} ${user.nom || ''}`.trim() || 'SuperAdmin';
  }
  if (user.type === 'admin') return 'Administrateur';
  if (user.type === 'club') return user.nom_club;
  if (user.type === 'ligue' || user.type === 'entente') {
    return user.nom_organisation || user.nom || '';
  }
  return `${user.prenom || ''} ${user.nom || ''}`.trim();
}

function getRoleLabel(user) {
  if (!user) return '';
  let label = '';
  if (user.type === 'superadmin') label = 'SuperAdmin';
  else if (user.type === 'admin') label = 'Admin';
  else if (user.type === 'federation') label = user.fonction || 'Fédération';
  else label = USER_TYPES[user.type]?.label || user.type;
  const text = String(label || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isAdminOrCoordon(user) {
  return user?.type === 'admin' || (user?.type === 'federation' && user?.fonction === 'Coordon');
}

function isResponsableGrade(user) {
  return user?.type === 'federation'
    && ['Responsable Grade', 'Responsable Affiliation'].includes(user.fonction);
}

function hasFullDashboardCards(user) {
  return isAdminOrCoordon(user)
    || (user?.type === 'federation' && ['Coordon Adjoint', 'Secrétaire Général'].includes(user.fonction));
}

function canUseQrScan(user, perms) {
  return perms.scanQr === true;
}

function getVisibleTabs(user, tabs, fedSettings) {
  if (user.type === 'superadmin') {
    return [{ key: 'overview', label: 'Dashboard' }];
  }

  const L = (key) => entityLabel(fedSettings, key);
  const filterVisible = (items) => items.filter((t) => isCardVisible(fedSettings, user, t.key));

  if (user.type === 'admin') {
    return filterVisible([
      { key: 'judokas', label: L('judokas') },
      { key: 'ligues', label: L('ligues') },
      { key: 'ententes', label: L('ententes') },
      { key: 'clubs', label: L('clubs') },
      { key: 'entraineurs', label: L('entraineurs') },
      { key: 'arbitres', label: L('arbitres') },
      { key: 'federation', label: L('federation') },
    ]);
  }

  if (user.type === 'club') {
    return filterVisible([
      { key: 'judokas', label: L('judokas') },
      { key: 'entraineurs', label: L('entraineurs') },
    ]);
  }

  if (user.type === 'ligue') {
    return filterVisible([
      { key: 'ententes', label: L('ententes') },
      { key: 'clubs', label: L('clubs') },
      { key: 'entraineurs', label: L('entraineurs') },
      { key: 'judokas', label: L('judokas') },
    ]);
  }

  if (user.type === 'entente') {
    return filterVisible([
      { key: 'clubs', label: L('clubs') },
      { key: 'entraineurs', label: L('entraineurs') },
      { key: 'judokas', label: L('judokas') },
    ]);
  }

  const visible = [];
  if (tabs.includes('judokas')) visible.push({ key: 'judokas', label: L('judokas') });
  if (tabs.includes('ligues')) visible.push({ key: 'ligues', label: L('ligues') });
  if (tabs.includes('ententes')) visible.push({ key: 'ententes', label: L('ententes') });
  if (tabs.includes('clubs')) visible.push({ key: 'clubs', label: L('clubs') });
  if (tabs.includes('entraineurs')) visible.push({ key: 'entraineurs', label: L('entraineurs') });
  if (tabs.includes('arbitres')) visible.push({ key: 'arbitres', label: L('arbitres') });
  if (tabs.includes('federation')) visible.push({ key: 'federation', label: L('federation') });
  return filterVisible(visible);
}

function getUsersForTab(members, tab, currentUser) {
  if (tab === 'entraineurs') return members.filter((u) => u.type === 'entraineur');
  if (tab === 'clubs') return members.filter((u) => u.type === 'club');
  if (tab === 'ententes') return members.filter((u) => u.type === 'entente');
  if (tab === 'ligues') return members.filter((u) => u.type === 'ligue');
  if (tab === 'federation') {
    const list = members.filter((u) => u.type === 'federation' || u.type === 'membre');
    if (currentUser?.type === 'admin') {
      const admin = members.find((u) => u.id === currentUser.id) || currentUser;
      return [admin, ...list.filter((u) => u.id !== admin.id)];
    }
    return list;
  }
  return members;
}

function getSectionTitle(tab, user, fedSettings) {
  const name = entityLabel(fedSettings, tab);
  if (tab === 'entraineurs' && user?.type === 'club') return `${name} du club`;
  if (tab === 'judokas' && user?.type === 'entraineur') return `${name} du club`;
  if (tab === 'federation') return `${name} de la Fédération`;
  return `Liste des ${name}`;
}

function matchesSearch(value, term) {
  return (value || '').toLowerCase().includes(term);
}

function matchClubName(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('list');
  const [dashboardTab, setDashboardTab] = useState('judokas');
  const [stats, setStats] = useState({ total: 0, actifs: 0, clubs: 0, entraineurs: 0, pendingAccounts: 0, arbitres: 0 });
  const [judokas, setJudokas] = useState([]);
  const [members, setMembers] = useState([]);
  const [arbitres, setArbitres] = useState([]);
  const [registeredClubs, setRegisteredClubs] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingArbitre, setEditingArbitre] = useState(null);
  const [deleteArbitreTarget, setDeleteArbitreTarget] = useState(null);
  const [createType, setCreateType] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cardJudoka, setCardJudoka] = useState(null);
  const [showQrScan, setShowQrScan] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [viewClub, setViewClub] = useState(null);
  const [viewAccount, setViewAccount] = useState(null);
  const [gradeTarget, setGradeTarget] = useState(null);
  const [ficheTarget, setFicheTarget] = useState(null);
  const [athleteSheetTarget, setAthleteSheetTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [showTransfersInbox, setShowTransfersInbox] = useState(false);
  const [gradeHistoryOpen, setGradeHistoryOpen] = useState(false);
  const [gradeHistory, setGradeHistory] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const [competitionAccess, setCompetitionAccessState] = useState(false);
  const [competitionToggleBusy, setCompetitionToggleBusy] = useState(false);
  const [showEntenteCompetitionPanel, setShowEntenteCompetitionPanel] = useState(false);
  const [ententeCompetitionList, setEntenteCompetitionList] = useState([]);
  const [ententeCompetitionBusyIds, setEntenteCompetitionBusyIds] = useState(() => new Set());
  const [ententeCompetitionBulkBusy, setEntenteCompetitionBulkBusy] = useState(false);
  const [judokaStatutFilter, setJudokaStatutFilter] = useState(null);
  const [fedSettings, setFedSettings] = useState(() => mergeFederationSettings(null));

  const perms = user?.permissions || {};
  const tabs = perms.dashboardTabs || ['judokas'];
  const L = (key) => entityLabel(fedSettings, key);
  const M = (key, fallback) => menuLabel(fedSettings, key, fallback);
  const showCard = (key) => isCardVisible(fedSettings, user, key);
  const lockedClub = perms.clubScope || null;
  const canManageUsers = perms.manageUsers || perms.createUsers;
  const canResetPassword = perms.manageUsers === true;
  const canValidateAccounts = perms.validateAccounts === true;
  const canValidateTargetUser = useCallback((target) => {
    if (!user || !target || !canValidateAccounts) return false;
    if (user.type === 'ligue') {
      // Ligue : uniquement les clubs des Ententes qui lui sont liées
      if (target.type !== 'club') return false;
      const parent = members.find((u) => u.id === target.parent_id);
      return parent?.type === 'entente' && parent.parent_id === user.id;
    }
    if (user.type === 'admin' || (user.type === 'federation' && user.fonction === 'Coordon')) {
      if (target.type === 'entente') return true;
      if (target.type === 'club') {
        const parent = members.find((u) => u.id === target.parent_id);
        // Clubs d'Entente : réservés à la Ligue
        return parent?.type !== 'entente';
      }
      return ['ligue', 'entraineur'].includes(target.type);
    }
    return false;
  }, [user, members, canValidateAccounts]);
  const canViewClubDetails = perms.viewClubDetails === true;
  const canViewCards = perms.viewCards === true;
  const readOnlyJudokas = perms.readOnlyJudokas === true;
  const hideJudokaActions = perms.hideJudokaActions === true;
  const canManageGrades = perms.manageGrades === true;
  const canManageClubGrades = perms.manageClubGrades === true;
  const canPromoteGrade = canManageGrades || canManageClubGrades;
  const canRequestTransfers = perms.requestTransfers === true || user?.type === 'admin';
  const canValidateTransfersEntente = perms.validateTransfersEntente === true;
  const canValidateTransfersLigue = perms.validateTransfersLigue === true;
  const canConfirmTransfersFederation = perms.validateTransfers === true;
  const canViewGradeHistory = perms.viewGradeHistory === true || canManageGrades;
  const canCreateArbitres = perms.createArbitres === true;
  const showHeaderCreate = perms.showHeaderCreate !== false && (perms.createUsers || perms.createTypes?.length > 0);
  const canScanQr = canUseQrScan(user, perms);
  const canToggleCompetition = perms.canToggleCompetitionAccess === true;
  const canToggleEntenteCompetition = perms.canToggleEntenteCompetition === true;
  const canManageCompetition = perms.canManageCompetition === true;
  const showCompetitionButton = canManageCompetition && !canToggleCompetition;
  const competitionButtonEnabled = canManageCompetition && competitionAccess;
  const visibleTabs = useMemo(
    () => (user ? getVisibleTabs(user, tabs, fedSettings) : []),
    [user, tabs, fedSettings]
  );
  const entraineurs = useMemo(() => members.filter((m) => m.type === 'entraineur'), [members]);
  const entraineurClub = useMemo(() => {
    if (user?.type !== 'entraineur') return null;
    return members.find((m) => m.type === 'club' && matchClubName(m.nom_club, user.club)) || null;
  }, [members, user]);

  const showUserTabs = ['entraineurs', 'clubs', 'ententes', 'ligues', 'federation'].includes(dashboardTab);
  const showArbitresTab = dashboardTab === 'arbitres';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setAuthLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAuthLoading(false);
    }, 5000);

    fetchCurrentUser()
      .then((u) => {
        if (cancelled) return;
        if (u) {
          const settings = mergeFederationSettings(u.federation_settings);
          setFedSettings(settings);
          applyFederationTheme(settings.colors);
          setUser(u);
          const first = getVisibleTabs(u, u.permissions?.dashboardTabs || ['judokas'], settings)[0];
          setDashboardTab(first?.key || 'judokas');
        }
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setAuthLoading(false);
        }
      });

    const handleLogout = () => {
      clearFederationTheme();
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const loadData = useCallback(async (options = {}) => {
    if (!user) return;
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      // SuperAdmin : pas de chargement athlètes / stats métier
      if (user.type === 'superadmin') {
        setServerOnline(true);
        setJudokas([]);
        setMembers([]);
        setArbitres([]);
        setStats({ total: 0, actifs: 0, clubs: 0, entraineurs: 0, pendingAccounts: 0, arbitres: 0 });
        return;
      }

      const needsUsers = user.type === 'admin' || perms.viewUsers || user.type === 'club' || perms.viewClubInfo;
      const needsArbitres = tabs.includes('arbitres') || perms.createArbitres || user.type === 'admin';
      const requests = [fetchStats(), fetchJudokas(), fetchClubs()];
      if (needsUsers) requests.push(fetchUsers());
      if (needsArbitres) requests.push(fetchArbitres());

      const results = await Promise.allSettled(requests);

      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setJudokas(results[1].value);
      if (results[2].status === 'fulfilled') setRegisteredClubs(results[2].value || []);

      let idx = 3;
      if (needsUsers) {
        if (results[idx]?.status === 'fulfilled') setMembers(results[idx].value || []);
        idx += 1;
      }
      if (needsArbitres) {
        if (results[idx]?.status === 'fulfilled') setArbitres(results[idx].value || []);
      }

      // Hors ligne seulement si les appels essentiels (stats + athlètes) échouent
      const coreDown =
        results[0].status === 'rejected' && results[1].status === 'rejected';
      setServerOnline(!coreDown);

      // Entente / Directeur : resynchroniser l'accès Compétition (reste actif après refresh Ligue)
      if (user.type === 'entente' || user.fonction === 'Directeur Compétition') {
        fetchCompetition()
          .then((data) => {
            setCompetitionAccessState(
              Boolean(data.access_enabled)
              || (user.type === 'entente' && Boolean(user.competition_access))
            );
          })
          .catch(() => {});
      }

      if (coreDown) {
        if (!silent) {
          showToast('Connexion au serveur lente ou indisponible. Réessayez dans un instant.', 'error');
        }
      } else if (!silent) {
        fetchUnreadMessages()
          .then((r) => setUnreadMessages(r.count || 0))
          .catch(() => {});
      }
    } catch {
      if (!silent) {
        setServerOnline(false);
        showToast('Erreur de connexion au serveur.', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast, user, perms.viewUsers, perms.createArbitres, perms.viewClubInfo, tabs]);

  useEffect(() => {
    if (user) loadData();
  }, [loadData, user]);

  useEffect(() => {
    if (!user) {
      setCompetitionAccessState(false);
      return undefined;
    }
    if (!canToggleCompetition && !canManageCompetition) return undefined;

    // Flag durable Entente : déjà connu sur le compte (survit au refresh)
    if (user.type === 'entente' && user.competition_access) {
      setCompetitionAccessState(true);
    }

    let cancelled = false;
    fetchCompetition()
      .then((data) => {
        if (!cancelled) {
          setCompetitionAccessState(
            Boolean(data.access_enabled)
            || (user.type === 'entente' && Boolean(user.competition_access))
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompetitionAccessState(user.type === 'entente' && Boolean(user.competition_access));
        }
      });
    return () => { cancelled = true; };
  }, [user, canToggleCompetition, canManageCompetition]);

  const handleCompetitionAccessToggle = async () => {
    if (!canToggleCompetition || competitionToggleBusy) return;
    setCompetitionToggleBusy(true);
    try {
      const next = !competitionAccess;
      await setCompetitionAccess(next);
      setCompetitionAccessState(next);
      showToast(next
        ? 'Bouton Compétition activé - le Directeur peut créer une nouvelle compétition'
        : 'Compétition désactivée - données et lien d\'inscription effacés');
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    } finally {
      setCompetitionToggleBusy(false);
    }
  };

  const openEntenteCompetitionPanel = async () => {
    setShowEntenteCompetitionPanel(true);
    try {
      const data = await fetchEntenteCompetitionAccess();
      setEntenteCompetitionList(data.ententes || []);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
      setEntenteCompetitionList([]);
    }
  };

  const handleEntenteCompetitionToggle = async (ententeId, currentlyEnabled) => {
    if (!ententeId || ententeCompetitionBusyIds.has(ententeId) || ententeCompetitionBulkBusy) return;
    setEntenteCompetitionBusyIds((prev) => new Set(prev).add(ententeId));
    try {
      const next = !currentlyEnabled;
      await setEntenteCompetitionAccess(ententeId, next);
      setEntenteCompetitionList((prev) => prev.map((e) => (
        e.id === ententeId ? { ...e, access_enabled: next, configured: next ? e.configured : false } : e
      )));
      showToast(next
        ? 'Compétition activée pour cette Entente'
        : 'Compétition désactivée pour cette Entente - données effacées');
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    } finally {
      setEntenteCompetitionBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(ententeId);
        return next;
      });
    }
  };

  const handleEntenteCompetitionBulk = async (enable) => {
    if (ententeCompetitionBulkBusy || !ententeCompetitionList.length) return;
    const targets = ententeCompetitionList.filter((e) => Boolean(e.access_enabled) !== enable);
    if (!targets.length) {
      showToast(enable
        ? 'Toutes les Ententes sont déjà activées'
        : 'Aucune compétition Entente n\'est activée');
      return;
    }
    if (!enable && !window.confirm(
      `Désactiver la compétition pour ${targets.length} Entente(s) ? Les données de chaque compétition seront effacées.`,
    )) {
      return;
    }
    setEntenteCompetitionBulkBusy(true);
    try {
      await setEntenteCompetitionAccessBulk({ all: true, accessEnabled: enable });
      setEntenteCompetitionList((prev) => prev.map((e) => ({
        ...e,
        access_enabled: enable,
        configured: enable ? e.configured : false,
      })));
      showToast(enable
        ? `Compétition activée pour ${targets.length} Entente(s) - chacune gère la sienne indépendamment`
        : `Compétition désactivée pour ${targets.length} Entente(s)`);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
      try {
        const data = await fetchEntenteCompetitionAccess();
        setEntenteCompetitionList(data.ententes || []);
      } catch { /* ignore */ }
    } finally {
      setEntenteCompetitionBulkBusy(false);
    }
  };

  // Rafraîchissement silencieux (Coordon, Ligue, Entente) pour voir les validations en temps réel
  useEffect(() => {
    if (!user || !perms.liveRefresh) return undefined;
    const id = setInterval(() => {
      loadData({ silent: true });
    }, 2000);
    return () => clearInterval(id);
  }, [user, perms.liveRefresh, loadData]);

  const searchTerm = searchInput.trim().toLowerCase();

  const filteredJudokas = useMemo(() => {
    let list = judokas;
    if (judokaStatutFilter === 'actif') {
      list = list.filter((j) => j.statut === 'actif');
    } else if (judokaStatutFilter === 'inactif') {
      list = list.filter((j) => j.statut !== 'actif');
    }
    if (!searchTerm) return list;
    return list.filter((j) =>
      matchesSearch(j.nom, searchTerm) ||
      matchesSearch(j.prenom, searchTerm) ||
      matchesSearch(j.club, searchTerm) ||
      matchesSearch(j.numero_carte, searchTerm) ||
      matchesSearch(`${j.prenom} ${j.nom}`, searchTerm)
    );
  }, [judokas, searchTerm, judokaStatutFilter]);

  const tabUsers = useMemo(() => {
    let users = getUsersForTab(members, dashboardTab, user);
    if (!searchTerm) return users;
    return users.filter((u) => {
      const name = u.type === 'club'
        ? u.nom_club
        : (u.type === 'ligue' || u.type === 'entente')
          ? (u.nom_organisation || u.nom)
          : `${u.prenom || ''} ${u.nom || ''}`.trim();
      return (
        matchesSearch(name, searchTerm) ||
        matchesSearch(u.email, searchTerm) ||
        matchesSearch(u.club, searchTerm) ||
        matchesSearch(u.telephone, searchTerm) ||
        matchesSearch(u.fonction, searchTerm) ||
        matchesSearch(u.nom_organisation, searchTerm)
      );
    });
  }, [members, dashboardTab, searchTerm, user]);

  const filteredArbitres = useMemo(() => {
    if (!searchTerm) return arbitres;
    return arbitres.filter((a) =>
      matchesSearch(`${a.prenom} ${a.nom}`, searchTerm) ||
      matchesSearch(a.club, searchTerm) ||
      matchesSearch(a.niveau, searchTerm)
    );
  }, [arbitres, searchTerm]);

  const showJudokasTab = perms.viewJudokas !== false && tabs.includes('judokas');
  const showStatsJudokas = perms.viewStats && perms.viewJudokas !== false;
  const showStatsEntraineurs = perms.viewStats && (user?.type === 'admin' || perms.viewJudokas !== false);

  const openNewJudoka = () => {
    if (!perms.createJudokas) {
      showToast(`Vous n'êtes pas autorisé à créer des ${L('judokas').toLowerCase()}`, 'error');
      return;
    }
    setEditing(null);
    setEditingUser(null);
    setCreateType(null);
    setView('judoka-form');
  };

  const openEditForm = (j) => {
    setEditing(j);
    setEditingUser(null);
    setCreateType(null);
    setView('judoka-form');
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setCreateType(u.type);
    setEditing(null);
    setView('user-form');
  };

  const handleCreate = async (formData) => {
    const newJudoka = await createJudoka(formData);
    showToast(`${newJudoka.prenom} ${newJudoka.nom} enregistré - Carte ${newJudoka.numero_carte}`);
    setView('list');
    setEditing(null);
    if (canViewCards) setCardJudoka(newJudoka);
    await loadData();
  };

  const handleUpdate = async (formData) => {
    const updated = await updateJudoka(editing.id, formData);
    showToast(`${updated.prenom} ${updated.nom} mis à jour avec succès`);
    setEditing(null);
    setView('list');
    await loadData();
  };

  const handleUserSaved = async (savedUser) => {
    const label = USER_TYPES[savedUser.type]?.label || (savedUser.type === 'admin' ? 'Administrateur' : 'Utilisateur');
    if (editingUser) {
      showToast(`${label} mis à jour`);
      if (editingUser.id === user.id) {
        const fresh = await fetchCurrentUser();
        if (fresh) setUser(fresh);
      }
    } else if (savedUser.statut === 'pending') {
      showToast(`${label} créé - en attente de validation Coordon`);
    } else {
      showToast(`${label} créé - ${savedUser.email}`);
    }
    setCreateType(null);
    setEditingUser(null);
    setView('list');
    await loadData();
  };

  const handleValidateUser = async (u) => {
    try {
      await validateUser(u.id);
      showToast(`${USER_TYPES[u.type]?.label || 'Compte'} validé - compte actif`);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRejectUser = async (u) => {
    try {
      await rejectUser(u.id);
      showToast(`${USER_TYPES[u.type]?.label || 'Compte'} rejeté`);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    await deleteJudoka(deleteTarget.id);
    showToast(`${deleteTarget.prenom} ${deleteTarget.nom} supprimé`);
    setDeleteTarget(null);
    await loadData();
  };

  const handleDeleteUser = async () => {
    await deleteUser(deleteUserTarget.id);
    const name = deleteUserTarget.nom_club || `${deleteUserTarget.prenom} ${deleteUserTarget.nom}`;
    showToast(`${name} supprimé`);
    setDeleteUserTarget(null);
    await loadData();
  };

  const handleExport = async () => {
    if (!perms.export) {
      showToast('Export non autorisé pour votre rôle', 'error');
      return;
    }

    if (isAdminOrCoordon(user)) {
      const tab = dashboardTab || 'judokas';
      const rows = tab === 'judokas'
        ? filteredJudokas
        : tab === 'arbitres'
          ? filteredArbitres
          : tabUsers;
      if (!rows.length) {
        showToast('Aucune donnée à exporter pour cet onglet', 'error');
        return;
      }
      setExportingPdf(true);
      try {
        const { exportDashboardListToPdf } = await import('./utils/exportDashboardListPdf.js');
        exportDashboardListToPdf(tab, rows);
        showToast(`${rows.length} enregistrement(s) exporté(s) en PDF`);
      } catch {
        showToast('Impossible de générer le PDF de la liste', 'error');
      } finally {
        setExportingPdf(false);
      }
      return;
    }

    if (filteredJudokas.length === 0) {
      showToast('Aucune donnée à exporter', 'error');
      return;
    }
    exportToCsv(filteredJudokas);
    showToast(`${filteredJudokas.length} athlète(s) exporté(s) en CSV`);
  };

  const handleExportCardsPdf = async () => {
    if (!perms.export) {
      showToast('Export non autorisé pour votre rôle', 'error');
      return;
    }
    if (filteredJudokas.length === 0) {
      showToast('Aucune carte à exporter', 'error');
      return;
    }

    setExportingPdf(true);
    try {
      const { exportCardsToPdf } = await import('./utils/exportCardsPdf.jsx');
      await exportCardsToPdf(filteredJudokas, (current, total) => {
        if (current === total) {
          showToast(`${total} carte(s) exportée(s) en PDF`);
        }
      });
    } catch {
      showToast('Impossible de générer le PDF des cartes', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportJudokasListPdf = async () => {
    if (!perms.export) {
      showToast('Export non autorisé pour votre rôle', 'error');
      return;
    }
    if (filteredJudokas.length === 0) {
      showToast('Aucun athlète à exporter', 'error');
      return;
    }
    setExportingPdf(true);
    try {
      const { exportJudokasListToPdf } = await import('./utils/exportJudokasListPdf.js');
      exportJudokasListToPdf(filteredJudokas);
      showToast(`${filteredJudokas.length} athlète(s) exporté(s) en PDF`);
    } catch {
      showToast('Impossible de générer le PDF de la liste', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleLogout = () => {
    // Instantané : UI d'abord, invalidation session en arrière-plan
    clearFederationTheme();
    setFedSettings(mergeFederationSettings(null));
    setUser(null);
    setView('list');
    setEditing(null);
    setEditingUser(null);
    setCreateType(null);
    setJudokas([]);
    setMembers([]);
    logoutUser();
  };

  const openCreateModal = () => {
    if (!showHeaderCreate && !canCreateArbitres) {
      showToast('Vous n\'êtes pas autorisé à créer des utilisateurs', 'error');
      return;
    }
    setShowCreateModal(true);
  };

  const openNewEntraineur = () => {
    setCreateType('entraineur');
    setEditingUser(null);
    setEditing(null);
    setEditingArbitre(null);
    setView('user-form');
  };

  const openNewEntente = () => {
    setCreateType('entente');
    setEditingUser(null);
    setEditing(null);
    setEditingArbitre(null);
    setView('user-form');
  };

  const openNewClub = () => {
    setCreateType('club');
    setEditingUser(null);
    setEditing(null);
    setEditingArbitre(null);
    setView('user-form');
  };

  const openNewArbitre = () => {
    setEditingArbitre(null);
    setEditing(null);
    setEditingUser(null);
    setCreateType(null);
    setView('arbitre-form');
  };

  const handleCreateTypeSelect = (type) => {
    setShowCreateModal(false);
    if (type === 'arbitre') {
      openNewArbitre();
      return;
    }
    setCreateType(type);
    setEditing(null);
    setEditingUser(null);
    setEditingArbitre(null);
    setView('user-form');
  };

  const handleArbitreSaved = async (saved) => {
    showToast(editingArbitre ? 'Arbitre mis à jour' : `Arbitre créé - ${saved.prenom} ${saved.nom}`);
    setEditingArbitre(null);
    setView('list');
    setDashboardTab('arbitres');
    await loadData();
  };

  const handleDeleteArbitre = async () => {
    await deleteArbitre(deleteArbitreTarget.id);
    showToast(`${deleteArbitreTarget.prenom} ${deleteArbitreTarget.nom} supprimé`);
    setDeleteArbitreTarget(null);
    await loadData();
  };

  if (authLoading) {
    return <BrandLoader label="Chargement..." fullscreen />;
  }

  if (!user) {
    return (
      <Login
        onLogin={(u) => {
          const settings = mergeFederationSettings(u.federation_settings);
          setFedSettings(settings);
          applyFederationTheme(settings.colors);
          setUser(u);
          setView('list');
          const first = getVisibleTabs(u, u.permissions?.dashboardTabs || ['judokas'], settings)[0];
          setDashboardTab(first?.key || 'judokas');
        }}
      />
    );
  }

  const brandTitle = user.type === 'superadmin'
    ? 'Fight Management'
    : (user.federation_branding?.nom_profil
      || user.federation_branding?.nom
      || 'Fight Management');
  const brandLogo = user.type === 'superadmin'
    ? '/fenacoju-logo.png'
    : (user.federation_branding?.logo_url
      ? resolveMediaUrl(user.federation_branding.logo_url)
      : '/fenacoju-logo.png');

  return (
    <>
      <div className="app-shell">
        <div className="app-content">
          {!serverOnline && (
            <div className="server-banner">
              {import.meta.env.PROD ? (
                <>
                  Serveur temporairement indisponible - le backend Render peut mettre jusqu&apos;à une minute à démarrer.
                  Actualisez la page dans quelques secondes.
                </>
              ) : (
                <>
                  Serveur hors ligne - Dans le terminal, lancez <code>npm run dev</code> et ouvrez <code>http://localhost:5173</code>
                </>
              )}
            </div>
          )}

          <main className={`container dashboard-shell ${loading ? 'is-loading' : ''}`}>
            <div className="dashboard-topbar">
              <div className="dashboard-topbar-title">
                {view === 'list' && (user.type === 'superadmin' && dashboardTab === 'federations' ? 'Fédérations' : 'Dashboard')}
                {view === 'form' && (editing ? 'Modifier l\'athlète' : 'Nouvel athlète')}
                {view === 'user-form' && (editingUser ? 'Modifier le compte' : 'Créer un compte')}
                {view === 'arbitre-form' && (editingArbitre ? 'Modifier l\'arbitre' : 'Nouvel arbitre')}
                {view === 'messages' && 'Messages'}
                {view === 'settings' && M('settings', 'Réglages')}
                {view === 'federation-settings' && M('parametrage', 'Paramétrage fédération')}
                {view === 'configurations' && 'Configurations'}
                {view === 'competition' && M('competition', 'Compétition')}
              </div>
              <div className="dashboard-topbar-user">
                <span>{getUserDisplayName(user) || 'utilisateur'}</span>
                {user?.photo ? (
                  <img
                    className="dashboard-avatar dashboard-avatar-photo"
                    src={resolveMediaUrl(user.photo)}
                    alt=""
                  />
                ) : (
                  <span className="dashboard-avatar" aria-hidden="true">
                    {(getUserDisplayName(user) || 'U')
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                )}
              </div>
            </div>

        {view === 'list' && user.type === 'superadmin' && dashboardTab === 'federations' && (
          <div className="dashboard-workspace">
            <Suspense fallback={<PageLoader label="Chargement des fédérations..." />}>
              <SuperAdminFederations onToast={showToast} />
            </Suspense>
          </div>
        )}

        {view === 'list' && user.type === 'superadmin' && dashboardTab !== 'federations' && (
          <div className="dashboard-workspace">
            <Suspense fallback={<PageLoader label="Chargement du tableau de bord..." />}>
              <SuperAdminDashboard />
            </Suspense>
          </div>
        )}

        {view === 'list' && user.type !== 'superadmin' && (
          <div className="dashboard-workspace">
            {perms.viewStats && (
              <div className="stats-grid">
                {hasFullDashboardCards(user) ? (
                  <>
                    {showCard('judokas') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPeople />}
                        value={stats.total}
                        label={L('judokas')}
                        active={dashboardTab === 'judokas'}
                        onClick={() => { setDashboardTab('judokas'); setView('list'); }}
                      />
                    )}
                    {showCard('ligues') && (
                      <StatCard
                        theme="blue"
                        icon={<IconFlag />}
                        value={stats.ligues ?? 0}
                        label={L('ligues')}
                        active={dashboardTab === 'ligues'}
                        onClick={() => { setDashboardTab('ligues'); setView('list'); }}
                      />
                    )}
                    {showCard('ententes') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.ententes ?? 0}
                        label={L('ententes')}
                        active={dashboardTab === 'ententes'}
                        onClick={() => { setDashboardTab('ententes'); setView('list'); }}
                      />
                    )}
                    {showCard('clubs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.clubs}
                        label={L('clubs')}
                        active={dashboardTab === 'clubs'}
                        onClick={() => { setDashboardTab('clubs'); setView('list'); }}
                      />
                    )}
                    {showCard('entraineurs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPerson />}
                        value={stats.entraineurs}
                        label={L('entraineurs')}
                        active={dashboardTab === 'entraineurs'}
                        onClick={() => { setDashboardTab('entraineurs'); setView('list'); }}
                      />
                    )}
                    {showCard('arbitres') && (
                      <StatCard
                        theme="blue"
                        icon={<IconWhistle />}
                        value={stats.arbitres ?? 0}
                        label={L('arbitres')}
                        active={dashboardTab === 'arbitres'}
                        onClick={() => { setDashboardTab('arbitres'); setView('list'); }}
                      />
                    )}
                    {showCard('federation') && (
                      <StatCard
                        theme="blue"
                        icon={<IconCheck />}
                        value={stats.federationMembers ?? 0}
                        label={L('federation')}
                        active={dashboardTab === 'federation'}
                        onClick={() => { setDashboardTab('federation'); setView('list'); }}
                      />
                    )}
                  </>
                ) : isResponsableGrade(user) ? (
                  <>
                    {showCard('judokas') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPeople />}
                        value={stats.total}
                        label={`${L('judokas')} enregistrés`}
                        active={dashboardTab === 'judokas' && !judokaStatutFilter}
                        onClick={() => { setJudokaStatutFilter(null); setDashboardTab('judokas'); setView('list'); }}
                      />
                    )}
                    {showCard('judokas') && (
                      <StatCard
                        theme="blue"
                        icon={<IconCheck />}
                        value={stats.actifs}
                        label="Actifs"
                        active={dashboardTab === 'judokas' && judokaStatutFilter === 'actif'}
                        onClick={() => { setJudokaStatutFilter('actif'); setDashboardTab('judokas'); setView('list'); }}
                      />
                    )}
                    {showCard('judokas') && (
                      <StatCard
                        theme="blue"
                        icon={<IconAlert />}
                        value={Math.max(0, (stats.total || 0) - (stats.actifs || 0))}
                        label="Inactifs"
                        active={dashboardTab === 'judokas' && judokaStatutFilter === 'inactif'}
                        onClick={() => { setJudokaStatutFilter('inactif'); setDashboardTab('judokas'); setView('list'); }}
                      />
                    )}
                    {showCard('entraineurs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPerson />}
                        value={stats.entraineurs}
                        label={L('entraineurs')}
                        active={dashboardTab === 'entraineurs'}
                        onClick={() => { setJudokaStatutFilter(null); setDashboardTab('entraineurs'); setView('list'); }}
                      />
                    )}
                    {showCard('clubs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.clubs}
                        label={L('clubs')}
                        active={dashboardTab === 'clubs'}
                        onClick={() => { setJudokaStatutFilter(null); setDashboardTab('clubs'); setView('list'); }}
                      />
                    )}
                  </>
                ) : user.type === 'entente' ? (
                  <>
                    {showCard('clubs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.clubs}
                        label={L('clubs')}
                        active={dashboardTab === 'clubs'}
                        onClick={tabs.includes('clubs') ? () => { setDashboardTab('clubs'); setView('list'); } : undefined}
                      />
                    )}
                    {showStatsEntraineurs && showCard('entraineurs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPerson />}
                        value={stats.entraineurs}
                        label={L('entraineurs')}
                        active={dashboardTab === 'entraineurs'}
                        onClick={tabs.includes('entraineurs') ? () => { setDashboardTab('entraineurs'); setView('list'); } : undefined}
                      />
                    )}
                    {showStatsJudokas && showCard('judokas') && (
                      <>
                        <StatCard
                          theme="blue"
                          icon={<IconPeople />}
                          value={stats.total}
                          label={L('judokas')}
                          active={dashboardTab === 'judokas'}
                          onClick={() => { setDashboardTab('judokas'); setView('list'); }}
                        />
                        <StatCard
                          theme="blue"
                          icon={<IconCheck />}
                          value={stats.actifs}
                          label={`${L('judokas')} actifs`}
                        />
                      </>
                    )}
                  </>
                ) : user.type === 'ligue' ? (
                  <>
                    {showCard('ententes') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.ententes ?? 0}
                        label={L('ententes')}
                        active={dashboardTab === 'ententes'}
                        onClick={() => { setDashboardTab('ententes'); setView('list'); }}
                      />
                    )}
                    {showCard('clubs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.clubs}
                        label={L('clubs')}
                        active={dashboardTab === 'clubs'}
                        onClick={tabs.includes('clubs') ? () => { setDashboardTab('clubs'); setView('list'); } : undefined}
                      />
                    )}
                    {showStatsEntraineurs && showCard('entraineurs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPerson />}
                        value={stats.entraineurs}
                        label={L('entraineurs')}
                        active={dashboardTab === 'entraineurs'}
                        onClick={tabs.includes('entraineurs') ? () => { setDashboardTab('entraineurs'); setView('list'); } : undefined}
                      />
                    )}
                    {showStatsJudokas && showCard('judokas') && (
                      <>
                        <StatCard
                          theme="blue"
                          icon={<IconPeople />}
                          value={stats.total}
                          label={L('judokas')}
                          active={dashboardTab === 'judokas'}
                          onClick={() => { setDashboardTab('judokas'); setView('list'); }}
                        />
                        <StatCard theme="blue" icon={<IconCheck />} value={stats.actifs} label="Actifs" />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {showStatsJudokas && showCard('judokas') && (
                      <>
                        <StatCard theme="blue" icon={<IconPeople />} value={stats.total} label={`${L('judokas')} enregistrés`} />
                        <StatCard theme="blue" icon={<IconCheck />} value={stats.actifs} label="Actifs" />
                        <StatCard
                          theme="blue"
                          icon={<IconAlert />}
                          value={stats.arbitres ?? 0}
                          label="Inactifs"
                        />
                      </>
                    )}
                    {showStatsEntraineurs && showCard('entraineurs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconPerson />}
                        value={stats.entraineurs}
                        label={L('entraineurs')}
                        active={dashboardTab === 'entraineurs'}
                        onClick={tabs.includes('entraineurs') ? () => { setDashboardTab('entraineurs'); setView('list'); } : undefined}
                      />
                    )}
                    {user.type !== 'club' && user.type !== 'entraineur' && showCard('clubs') && (
                      <StatCard
                        theme="blue"
                        icon={<IconBuilding />}
                        value={stats.clubs}
                        label={L('clubs')}
                        active={dashboardTab === 'clubs'}
                        onClick={tabs.includes('clubs') ? () => { setDashboardTab('clubs'); setView('list'); } : undefined}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {user.type === 'entente' && perms.viewStats && Array.isArray(stats.gradesBreakdown) && stats.gradesBreakdown.length > 0 && (
              <div className="entente-grades-panel">
                <h4>Athlètes par ceinture / grade</h4>
                <div className="entente-grades-grid">
                  {stats.gradesBreakdown.map((row) => (
                    <div key={row.grade} className="entente-grade-item">
                      <span>{row.grade}</span>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {user.type === 'club' && perms.viewStats && (
              <ClubInfoPanel
                title={user.nom_club}
                responsable={user.responsable}
                ville={user.ville}
              />
            )}

            {(user.type === 'ligue' || user.type === 'entente') && perms.viewStats && (
              <ClubInfoPanel
                title={
                  user.org_code
                    ? `${user.nom_organisation || user.nom} · ${user.org_code}`
                    : (user.nom_organisation || user.nom)
                }
                responsable={user.responsable}
                ville={user.ville}
                responsableLabel={user.type === 'ligue' ? 'Responsable de la ligue' : 'Responsable de l\'entente'}
              />
            )}

            {visibleTabs.length > 1 && (
              <div className="dashboard-tabs">
                {visibleTabs.map((tab) => {
                  const pendingCount =
                    tab.key === 'ligues' ? (stats.pendingLigues || 0)
                      : tab.key === 'ententes' ? (stats.pendingEntentes || 0)
                        : tab.key === 'clubs' ? (stats.pendingClubs || 0)
                          : tab.key === 'entraineurs' ? (stats.pendingEntraineurs || 0)
                            : 0;
                  const showBadge = canValidateAccounts && pendingCount > 0;
                  return (
                    <button
                      key={tab.key}
                      className={`dashboard-tab ${dashboardTab === tab.key ? 'active' : ''}`}
                      onClick={() => { setDashboardTab(tab.key); setJudokaStatutFilter(null); }}
                    >
                      {tab.label}
                      {showBadge && (
                        <span className="tab-pending-badge" title={`${pendingCount} à valider`}>
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {dashboardTab === 'judokas' && showJudokasTab && (
              <>
                {user.type === 'entraineur' && (
                  <ClubInfoPanel
                    title={user.club}
                    responsable={entraineurClub?.responsable}
                    ville={entraineurClub?.ville}
                  />
                )}

                <div className="search-bar">
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Rechercher par nom, club, n° de carte..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  {perms.refreshList !== false && user.type !== 'entraineur' && (
                    <button className="btn btn-outline" onClick={loadData} disabled={loading}>
                      {loading ? 'Chargement...' : 'Actualiser'}
                    </button>
                  )}
                  {perms.createJudokas && (
                    <button className="btn btn-accent" onClick={openNewJudoka}>
                      Nouvel athlète
                    </button>
                  )}
                </div>

                <div className="table-card">
                  <div className="table-header">
                    <h2>{getSectionTitle('judokas', user, fedSettings)}</h2>
                    <div className="table-header-actions">
                      {canScanQr && (
                        <button
                          type="button"
                          className="btn btn-scan-qr"
                          onClick={() => setShowQrScan(true)}
                          disabled={!serverOnline}
                        >
                          Scan QR
                        </button>
                      )}
                      {perms.export && (
                        <button
                          type="button"
                          className="btn btn-export-green"
                          onClick={canManageCompetition ? handleExportJudokasListPdf : handleExportCardsPdf}
                          disabled={exportingPdf || !serverOnline || filteredJudokas.length === 0}
                        >
                          {exportingPdf ? 'Export...' : 'Exporter'}
                        </button>
                      )}
                    </div>
                  </div>
                  {loading && judokas.length === 0 ? (
                    <div className="table-skeleton">
                      {[1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
                    </div>
                  ) : (
                    <Suspense fallback={<PageLoader label="Chargement de la liste..." />}>
                      <JudokaList
                        judokas={filteredJudokas}
                        showActions={!readOnlyJudokas && (!hideJudokaActions || canPromoteGrade)}
                        onViewCard={!readOnlyJudokas && !hideJudokaActions && canViewCards ? setCardJudoka : null}
                        onEdit={!hideJudokaActions && perms.createJudokas ? openEditForm : null}
                        onViewFiche={setFicheTarget}
                        onDelete={!hideJudokaActions && perms.deleteJudokas ? setDeleteTarget : null}
                        onPromoteGrade={canPromoteGrade ? setGradeTarget : null}
                        onRequestTransfer={canRequestTransfers ? setTransferTarget : null}
                        onViewAthleteSheet={user.type === 'club' ? setAthleteSheetTarget : null}
                        onAddNew={perms.createJudokas ? openNewJudoka : null}
                      />
                    </Suspense>
                  )}
                </div>
              </>
            )}

            {showUserTabs && (
              <>
                <div className="search-bar">
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Rechercher..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button className="btn btn-outline" onClick={() => loadData()} disabled={loading}>
                    {loading ? 'Chargement...' : 'Actualiser'}
                  </button>
                  {dashboardTab === 'entraineurs' && user.type === 'club' && perms.createTypes?.includes('entraineur') && (
                    <button className="btn btn-primary" onClick={openNewEntraineur}>
                      Nouvel Entraineur
                    </button>
                  )}
                  {dashboardTab === 'ententes' && user.type === 'ligue' && perms.createTypes?.includes('entente') && (
                    <button className="btn btn-primary" onClick={openNewEntente}>
                      Nouvelle Entente
                    </button>
                  )}
                  {dashboardTab === 'clubs' && user.type === 'entente' && perms.createTypes?.includes('club') && (
                    <button className="btn btn-primary" onClick={openNewClub}>
                      Nouvel Club
                    </button>
                  )}
                </div>

                <div className="table-card">
                  <div className="table-header">
                    <h2>{getSectionTitle(dashboardTab, user, fedSettings)}</h2>
                  </div>
                  {loading && members.length === 0 ? (
                    <div className="table-skeleton">
                      {[1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
                    </div>
                  ) : (
                    <Suspense fallback={<PageLoader label="Chargement de la liste..." />}>
                      <UserList
                        users={tabUsers}
                        showClub={dashboardTab === 'entraineurs' && (user.type === 'admin' || user.type === 'federation' || user.type === 'ligue' || user.type === 'entente')}
                        detailColumnLabel={dashboardTab === 'federation' ? 'Fonction / Rôle' : 'Détails'}
                        hideFonctionUnderName={dashboardTab === 'federation'}
                        hideTypeColumn={dashboardTab === 'federation'}
                        showViewAction={
                          (dashboardTab === 'clubs' && canViewClubDetails)
                          || canValidateAccounts
                          || hasFullDashboardCards(user)
                        }
                        canManage={canManageUsers}
                        canValidate={canValidateAccounts && ['ligues', 'ententes', 'clubs', 'entraineurs'].includes(dashboardTab)}
                        canValidateUser={canValidateTargetUser}
                        onView={(u) => {
                          if (u.type === 'club' && canViewClubDetails) {
                            setViewClub(u);
                          } else {
                            setViewAccount(u);
                          }
                        }}
                        onEdit={canManageUsers ? openEditUser : null}
                        onDelete={canManageUsers ? setDeleteUserTarget : null}
                        onResetPassword={canResetPassword ? setResetPasswordTarget : null}
                        allowAdminSelfManage={user.type === 'admin'}
                        onValidate={canValidateAccounts ? handleValidateUser : null}
                        onReject={canValidateAccounts ? handleRejectUser : null}
                      />
                    </Suspense>
                  )}
                </div>
              </>
            )}

            {showArbitresTab && (
              <>
                <div className="search-bar">
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Rechercher un arbitre..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button className="btn btn-outline" onClick={() => loadData()} disabled={loading}>
                    {loading ? 'Chargement...' : 'Actualiser'}
                  </button>
                  {canCreateArbitres && (
                    <button className="btn btn-accent" onClick={openNewArbitre}>
                      Nouvel arbitre
                    </button>
                  )}
                </div>
                <div className="table-card">
                  <div className="table-header">
                    <h2>{getSectionTitle('arbitres', user, fedSettings)}</h2>
                  </div>
                  <Suspense fallback={<PageLoader label="Chargement des arbitres..." />}>
                    <ArbitreList
                      arbitres={filteredArbitres}
                      canManage={canCreateArbitres || user.type === 'admin'}
                      showViewAction={canValidateAccounts || hasFullDashboardCards(user)}
                      onView={(a) => setViewAccount({ ...a, _kind: 'arbitre' })}
                      onEdit={canCreateArbitres || user.type === 'admin' ? (a) => {
                        setEditingArbitre(a);
                        setView('arbitre-form');
                      } : null}
                      onDelete={canCreateArbitres || user.type === 'admin' ? setDeleteArbitreTarget : null}
                      onAddNew={canCreateArbitres ? openNewArbitre : null}
                    />
                  </Suspense>
                </div>
              </>
            )}

            {!showJudokasTab && dashboardTab === 'judokas' && (
              <div className="empty-state">
                <h3>Accès limité à votre rôle</h3>
                <p>Votre fonction ({getRoleLabel(user)}) ne donne pas accès à la liste des {L('judokas').toLowerCase()}.</p>
              </div>
            )}
          </div>
        )}

        {view === 'messages' && (
          <Suspense fallback={<PageLoader label="Ouverture des messages..." />}>
            <Messages
              currentUser={user}
              onUnreadChange={setUnreadMessages}
            />
          </Suspense>
        )}

        {view === 'settings' && (
          <Suspense fallback={<PageLoader label="Ouverture des réglages..." />}>
            <Settings
              user={user}
              onUserUpdated={(next) => setUser((prev) => ({ ...prev, ...next }))}
            />
          </Suspense>
        )}

        {view === 'federation-settings' && user.type === 'admin' && (
          <Suspense fallback={<PageLoader label="Chargement du paramétrage..." />}>
            <FederationSettings
              onBack={() => setView('list')}
              onToast={showToast}
              onSettingsSaved={(saved) => {
                const merged = mergeFederationSettings(saved);
                setFedSettings(merged);
                applyFederationTheme(merged.colors);
                setUser((prev) => (prev ? { ...prev, federation_settings: merged } : prev));
              }}
            />
          </Suspense>
        )}

        {view === 'configurations' && user.type === 'superadmin' && (
          <Suspense fallback={<PageLoader label="Chargement des configurations..." />}>
            <SuperAdminConfigurations onToast={showToast} />
          </Suspense>
        )}

        {view === 'competition' && (
          <Suspense fallback={<PageLoader label="Chargement de la compétition..." />}>
            <CompetitionSettings
              onBack={() => setView('list')}
              onToast={showToast}
            />
          </Suspense>
        )}

        {view === 'judoka-form' && (
          <Suspense fallback={<PageLoader label="Chargement du formulaire..." />}>
            <JudokaForm
              key={editing?.id || 'new'}
              judoka={editing}
              lockedClub={lockedClub}
              registeredClubs={registeredClubs}
              entraineurs={entraineurs.filter((e) => (e.statut || 'actif') === 'actif')}
              allowPhoto
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={() => { setEditing(null); setView('list'); }}
            />          </Suspense>
        )}

        {view === 'user-form' && createType && (
          <Suspense fallback={<PageLoader label="Chargement du formulaire..." />}>
            <UserForm
              key={editingUser?.id || createType}
              type={createType}
              editingUser={editingUser}
              currentUser={user}
              registeredClubs={registeredClubs}
              federationSettings={fedSettings}
              onSubmit={handleUserSaved}
              onCancel={() => { setCreateType(null); setEditingUser(null); setView('list'); }}
            />
          </Suspense>
        )}

        {view === 'arbitre-form' && (
          <Suspense fallback={<PageLoader label="Chargement du formulaire..." />}>
            <ArbitreForm
              key={editingArbitre?.id || 'new-arbitre'}
              arbitre={editingArbitre}
              registeredClubs={registeredClubs}
              onSubmit={handleArbitreSaved}
              onCancel={() => { setEditingArbitre(null); setView('list'); }}
            />
          </Suspense>
        )}
      </main>
        </div>

        <header className="header app-rail">
          <div className="header-brand">
            <img src={brandLogo} alt="" className="header-logo-img" width="52" height="52" decoding="async" />
            <div>
              <h1>{brandTitle}</h1>
              <p>
                {user.type === 'superadmin'
                  ? 'Console SuperAdmin - gestion des fédérations'
                  : user.type === 'ligue'
                    ? `Ligue / ${user.nom_organisation || user.nom || user.responsable || '-'}`
                    : user.type === 'entente'
                      ? `Entente / ${user.nom_organisation || user.nom || user.responsable || '-'}`
                      : user.type === 'club'
                        ? `Club / ${user.nom_club || user.nom || user.responsable || '-'}`
                        : 'Système intégral de gestion des arts martiaux'}
              </p>
            </div>
          </div>
          <nav className="header-nav">
            <button
              className={`nav-btn ${view === 'list' && (user.type !== 'superadmin' || dashboardTab !== 'federations') ? 'active' : ''}`}
              onClick={() => {
                setView('list');
                setEditing(null);
                setEditingUser(null);
                setCreateType(null);
                if (user.type === 'superadmin') setDashboardTab('overview');
              }}
            >
              {M('dashboard', 'Dashboard')}
            </button>
            {showHeaderCreate && user.type !== 'superadmin' && (
              <button
                className={`nav-btn ${view === 'user-form' && !editingUser ? 'active' : ''}`}
                onClick={openCreateModal}
              >
                {M('create', 'Créer')}
              </button>
            )}
            {user.type === 'superadmin' && (
              <button
                className={`nav-btn ${view === 'list' && dashboardTab === 'federations' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setDashboardTab('federations');
                  setView('list');
                }}
              >
                Fédérations
              </button>
            )}
            {perms.canMessage !== false && (
              <button
                className={`nav-btn ${view === 'messages' ? 'active' : ''}`}
                onClick={() => { setView('messages'); setEditing(null); setEditingUser(null); setCreateType(null); }}
              >
                {M('messages', 'Messages')}{unreadMessages > 0 ? ` (${unreadMessages})` : ''}
              </button>
            )}
            {canScanQr && (
              <button
                className="nav-btn"
                onClick={() => setShowQrScan(true)}
                disabled={!serverOnline}
              >
                {M('scan_qr', 'Scan QR')}
              </button>
            )}
            {canToggleCompetition && (
              <label
                className={`competition-access-toggle ${competitionAccess ? 'is-on' : ''}`}
                title="Activer / désactiver le bouton Compétition du Directeur Compétition"
              >
                <span>Compétition</span>
                <input
                  type="checkbox"
                  checked={competitionAccess}
                  onChange={handleCompetitionAccessToggle}
                  disabled={competitionToggleBusy || !serverOnline}
                />
                <span className="toggle-slider" />
              </label>
            )}
            {canToggleEntenteCompetition && (
              <button
                type="button"
                className="nav-btn"
                onClick={openEntenteCompetitionPanel}
                disabled={!serverOnline}
                title="Activer la compétition séparément pour chaque Entente"
              >
                Compétition Ententes
              </button>
            )}
            {showCompetitionButton && (
              <button
                className={`nav-btn ${view === 'competition' ? 'active' : ''}`}
                onClick={() => {
                  if (!competitionButtonEnabled) {
                    showToast(
                      user?.type === 'entente'
                        ? 'Le bouton Compétition n\'est pas encore activé par votre Ligue'
                        : 'Le bouton Compétition n\'est pas encore activé par Admin / Coordon',
                      'error'
                    );
                    return;
                  }
                  setView('competition');
                  setEditing(null);
                  setEditingUser(null);
                  setCreateType(null);
                }}
                disabled={!serverOnline || !competitionButtonEnabled}
                title={competitionButtonEnabled
                  ? (user?.type === 'entente' ? 'Compétition Entente (clubs liés)' : 'Paramètres compétition')
                  : (user?.type === 'entente' ? 'En attente d\'activation Ligue' : 'En attente d\'activation Admin / Coordon')}
              >
                {M('competition', 'Compétition')}
              </button>
            )}
            {(canValidateTransfersEntente || canValidateTransfersLigue || canConfirmTransfersFederation) && (
              <button
                className="nav-btn"
                type="button"
                onClick={() => setShowTransfersInbox(true)}
                disabled={!serverOnline}
                title="Validation des transferts"
              >
                Transferts
              </button>
            )}
            {canViewGradeHistory && (
              <button
                className="nav-btn"
                type="button"
                disabled={!serverOnline}
                onClick={async () => {
                  try {
                    const { fetchGradeHistory } = await import('./api');
                    const data = await fetchGradeHistory({ blackOnly: true });
                    setGradeHistory(data);
                    setGradeHistoryOpen(true);
                  } catch (err) {
                    showToast(err.message || 'Historique indisponible', 'error');
                  }
                }}
                title="Historique passations ceinture noire"
              >
                {M('grades', 'Grades')}
              </button>
            )}
            {perms.export && !showCompetitionButton && (
              <button
                className="nav-btn"
                onClick={handleExport}
                disabled={!serverOnline || exportingPdf}
                title={isAdminOrCoordon(user) ? `Exporter en PDF l’onglet ${dashboardTab}` : 'Exporter'}
              >
                {exportingPdf && isAdminOrCoordon(user) ? 'Export...' : M('export', 'Exporter')}
              </button>
            )}
            {user.type === 'admin' && (
              <button
                className={`nav-btn ${view === 'federation-settings' ? 'active' : ''}`}
                type="button"
                onClick={() => { setView('federation-settings'); setEditing(null); setEditingUser(null); setCreateType(null); }}
              >
                {M('parametrage', 'Paramétrage')}
              </button>
            )}
            <button
              className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
              onClick={() => { setView('settings'); setEditing(null); setEditingUser(null); setCreateType(null); }}
            >
              {M('settings', 'Réglages')}
            </button>
            {user.type === 'superadmin' && (
              <button
                className={`nav-btn ${view === 'configurations' ? 'active' : ''}`}
                type="button"
                onClick={() => { setView('configurations'); setEditing(null); setEditingUser(null); setCreateType(null); }}
              >
                Configurations
              </button>
            )}
          </nav>
        </header>
        <footer className="app-user-footer">
          <div className="header-user">
            <button type="button" className="nav-btn nav-btn-logout" onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </footer>
      </div>

      {showCreateModal && (
        <Suspense fallback={null}>
          <CreateTypeModal
            allowedTypes={perms.createTypes}
            includeArbitre={canCreateArbitres}
            groupFederation={
              user.type === 'admin'
              || (user.type === 'federation' && user.fonction === 'Coordon')
            }
            onSelect={handleCreateTypeSelect}
            onClose={() => setShowCreateModal(false)}
          />
        </Suspense>
      )}

      {cardJudoka && (
        <Suspense fallback={null}>
          <CardModal judoka={cardJudoka} onClose={() => setCardJudoka(null)} />
        </Suspense>
      )}

      {showQrScan && (
        <Suspense fallback={null}>
          <QrScanModal onClose={() => setShowQrScan(false)} />
        </Suspense>
      )}

      {gradeTarget && (
        <Suspense fallback={null}>
          <GradePassationModal
            judoka={gradeTarget}
            mode={
              canManageClubGrades && !canManageGrades && !perms.manageBlackBelts
                ? 'club'
                : (perms.manageBlackBelts && !canManageGrades && !perms.createJudokas ? 'black' : 'full')
            }
            allowBlackBelts={Boolean(canManageGrades || perms.manageBlackBelts || user?.type === 'admin')}
            entraineurs={entraineurs}
            onClose={() => setGradeTarget(null)}
            onSuccess={async (updated, meta) => {
              const ok = meta?.reussi !== false;
              showToast(
                ok
                  ? `Passation réussie : ${updated.prenom} ${updated.nom} · ${updated.grade}`
                  : `Passation enregistrée (non réussie) : ${updated.prenom} ${updated.nom}`
              );
              setGradeTarget(null);
              setFicheTarget(updated);
              await loadData();
            }}
          />
        </Suspense>
      )}

      {ficheTarget && (
        <Suspense fallback={null}>
          <JudokaFicheModal
            judoka={ficheTarget}
            onClose={() => setFicheTarget(null)}
            onRequestTransfer={canRequestTransfers ? (j) => {
              setFicheTarget(null);
              setTransferTarget(j);
            } : null}
          />
        </Suspense>
      )}

      {athleteSheetTarget && (
        <Suspense fallback={null}>
          <JudokaAthleteSheetModal
            judoka={athleteSheetTarget}
            onClose={() => setAthleteSheetTarget(null)}
          />
        </Suspense>
      )}

      {transferTarget && (
        <Suspense fallback={null}>
          <TransferModal
            mode="request"
            judoka={transferTarget}
            clubs={registeredClubs}
            onClose={() => setTransferTarget(null)}
            onToast={showToast}
            onDone={loadData}
          />
        </Suspense>
      )}

      {showTransfersInbox && (
        <Suspense fallback={null}>
          <TransferModal
            mode="inbox"
            canValidateEntente={canValidateTransfersEntente}
            canValidateLigue={canValidateTransfersLigue}
            canConfirmFederation={canConfirmTransfersFederation}
            onClose={() => setShowTransfersInbox(false)}
            onToast={showToast}
            onDone={loadData}
          />
        </Suspense>
      )}

      {showEntenteCompetitionPanel && (
        <div className="confirm-overlay" onClick={() => setShowEntenteCompetitionPanel(false)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Compétition par Entente</h3>
                <p className="form-hint">
                  Chaque Entente gère sa compétition indépendamment, avec ses clubs et athlètes uniquement.
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowEntenteCompetitionPanel(false)}>Fermer</button>
            </header>
            {ententeCompetitionList.length === 0 ? (
              <p className="form-hint">Aucune entente active dans votre ligue.</p>
            ) : (
              <>
                <div className="confirm-actions" style={{ marginBottom: '0.75rem', justifyContent: 'flex-start', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={ententeCompetitionBulkBusy || !serverOnline
                      || ententeCompetitionList.every((e) => e.access_enabled)}
                    onClick={() => handleEntenteCompetitionBulk(true)}
                  >
                    {ententeCompetitionBulkBusy ? '…' : 'Tout activer'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={ententeCompetitionBulkBusy || !serverOnline
                      || ententeCompetitionList.every((e) => !e.access_enabled)}
                    onClick={() => handleEntenteCompetitionBulk(false)}
                  >
                    Tout désactiver
                  </button>
                  <small className="form-hint" style={{ margin: 0 }}>
                    {ententeCompetitionList.filter((e) => e.access_enabled).length}
                    {' / '}
                    {ententeCompetitionList.length} activée(s)
                  </small>
                </div>
                <ul className="transfer-list">
                  {ententeCompetitionList.map((entente) => (
                    <li key={entente.id} className="transfer-row">
                      <div>
                        <strong>{entente.nom}</strong>
                        <small>
                          {entente.org_code ? `ID ${entente.org_code} · ` : ''}
                          {entente.access_enabled ? 'Compétition activée' : 'Compétition désactivée'}
                        </small>
                      </div>
                      <label className={`competition-access-toggle ${entente.access_enabled ? 'is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(entente.access_enabled)}
                          disabled={
                            ententeCompetitionBusyIds.has(entente.id)
                            || ententeCompetitionBulkBusy
                            || !serverOnline
                          }
                          onChange={() => handleEntenteCompetitionToggle(entente.id, entente.access_enabled)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {gradeHistoryOpen && (
        <div className="confirm-overlay" onClick={() => setGradeHistoryOpen(false)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Historique ceintures noires</h3>
                <p className="form-hint">Passations enregistrées par le Responsable Grade.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setGradeHistoryOpen(false)}>Fermer</button>
            </header>
            {gradeHistory.length === 0 ? (
              <p className="form-hint">Aucune passation ceinture noire.</p>
            ) : (
              <ul className="transfer-list">
                {gradeHistory.map((h) => (
                  <li key={h.id} className="transfer-row">
                    <div>
                      <strong>{h.grade_from || '-'} → {h.grade_to}</strong>
                      <small>
                        {h.instructeur_nom ? `Instructeur : ${h.instructeur_nom}` : 'Sans instructeur'}
                        {h.points != null ? ` · Points : ${h.points}` : ''}
                      </small>
                      <p className="form-hint">
                        {h.changed_by_name || '-'}
                        {h.created_at ? ` · ${new Date(h.created_at).toLocaleString('fr-FR')}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {viewClub && (
        <Suspense fallback={null}>
          <ClubDetailModal
            club={viewClub}
            judokas={judokas.filter((j) => matchClubName(j.club, viewClub.nom_club))}
            entraineurs={members.filter(
              (m) => m.type === 'entraineur' && matchClubName(m.club, viewClub.nom_club)
            )}
            onClose={() => setViewClub(null)}
          />
        </Suspense>
      )}

      {viewAccount && (
        <Suspense fallback={null}>
          <AccountDetailModal
            account={viewAccount}
            onClose={() => setViewAccount(null)}
          />
        </Suspense>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={`Voulez-vous vraiment supprimer ${deleteTarget.prenom} ${deleteTarget.nom} et sa carte ${deleteTarget.numero_carte} ?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleteUserTarget && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={`Voulez-vous vraiment supprimer ${deleteUserTarget.nom_club || deleteUserTarget.nom_organisation || `${deleteUserTarget.prenom} ${deleteUserTarget.nom}`} ?`}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeleteUserTarget(null)}
        />
      )}

      {deleteArbitreTarget && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={`Voulez-vous vraiment supprimer l'arbitre ${deleteArbitreTarget.prenom} ${deleteArbitreTarget.nom} ?`}
          onConfirm={handleDeleteArbitre}
          onCancel={() => setDeleteArbitreTarget(null)}
        />
      )}

      {resetPasswordTarget && (
        <ResetPasswordModal
          user={resetPasswordTarget}
          onClose={() => setResetPasswordTarget(null)}
          onSuccess={() => {
            showToast('Mot de passe réinitialisé avec succès');
            setResetPasswordTarget(null);
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
