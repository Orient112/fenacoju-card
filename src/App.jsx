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
  getToken,
  USER_TYPES,
} from './api';
import Login from './pages/Login';
import ResetPasswordModal from './components/ResetPasswordModal';
import ClubInfoPanel from './components/ClubInfoPanel';

const Messages = lazy(() => import('./pages/Messages'));
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

function PageLoader({ label = 'Chargement...' }) {
  return (
    <div className="page-loader">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

const SECTION_TITLES = {
  judokas: 'Liste des Judokas',
  entraineurs: 'Liste des Entraineurs',
  arbitres: 'Liste des Arbitres',
  clubs: 'Liste des Clubs',
  ententes: 'Liste des Ententes',
  ligues: 'Liste des Ligues',
  federation: 'Membres de la Fédération',
};

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
  if (user.type === 'admin') return 'Administrateur';
  if (user.type === 'club') return user.nom_club;
  if (user.type === 'ligue' || user.type === 'entente') {
    return user.nom_organisation || user.nom || '';
  }
  return `${user.prenom || ''} ${user.nom || ''}`.trim();
}

function getRoleLabel(user) {
  if (!user) return '';
  if (user.type === 'admin') return 'Admin';
  if (user.type === 'federation') return user.fonction || 'Fédération';
  return USER_TYPES[user.type]?.label || user.type;
}

function canUseQrScan(user, perms) {
  return perms.scanQr === true;
}

function getVisibleTabs(user, tabs) {
  if (user.type === 'admin') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'ligues', label: 'Ligues' },
      { key: 'ententes', label: 'Ententes' },
      { key: 'clubs', label: 'Clubs' },
      { key: 'entraineurs', label: 'Entraineurs' },
      { key: 'arbitres', label: 'Arbitres' },
      { key: 'federation', label: 'Membres' },
    ];
  }

  if (user.type === 'club') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'entraineurs', label: 'Entraineurs' },
    ];
  }

  if (user.type === 'ligue') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'ententes', label: 'Ententes' },
      { key: 'clubs', label: 'Clubs' },
      { key: 'entraineurs', label: 'Entraineurs' },
    ];
  }

  if (user.type === 'entente') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'clubs', label: 'Clubs' },
      { key: 'entraineurs', label: 'Entraineurs' },
    ];
  }

  const visible = [];
  if (tabs.includes('judokas')) visible.push({ key: 'judokas', label: 'Judokas' });
  if (tabs.includes('ligues')) visible.push({ key: 'ligues', label: 'Ligues' });
  if (tabs.includes('ententes')) visible.push({ key: 'ententes', label: 'Ententes' });
  if (tabs.includes('clubs')) visible.push({ key: 'clubs', label: 'Clubs' });
  if (tabs.includes('entraineurs')) visible.push({ key: 'entraineurs', label: 'Entraineurs' });
  if (tabs.includes('arbitres')) visible.push({ key: 'arbitres', label: 'Arbitres' });
  if (tabs.includes('federation')) visible.push({ key: 'federation', label: 'Membres' });
  return visible;
}

function getUsersForTab(members, tab) {
  if (tab === 'entraineurs') return members.filter((u) => u.type === 'entraineur');
  if (tab === 'clubs') return members.filter((u) => u.type === 'club');
  if (tab === 'ententes') return members.filter((u) => u.type === 'entente');
  if (tab === 'ligues') return members.filter((u) => u.type === 'ligue');
  if (tab === 'federation') return members.filter((u) => u.type === 'federation' || u.type === 'membre');
  return members;
}

function getSectionTitle(tab, user) {
  if (tab === 'entraineurs' && user.type === 'club') return 'Entraineurs du club';
  return SECTION_TITLES[tab] || 'Liste';
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
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);

  const perms = user?.permissions || {};
  const tabs = perms.dashboardTabs || ['judokas'];
  const lockedClub = perms.clubScope || null;
  const canManageUsers = perms.manageUsers || perms.createUsers;
  const canResetPassword = perms.manageUsers === true;
  const canValidateAccounts = perms.validateAccounts === true;
  const canViewClubDetails = perms.viewClubDetails === true;
  const canViewCards = perms.viewCards === true;
  const readOnlyJudokas = perms.readOnlyJudokas === true;
  const hideJudokaActions = perms.hideJudokaActions === true;
  const canCreateArbitres = perms.createArbitres === true;
  const showHeaderCreate = perms.showHeaderCreate !== false && (perms.createUsers || perms.createTypes?.length > 0);
  const canScanQr = canUseQrScan(user, perms);
  const visibleTabs = useMemo(() => (user ? getVisibleTabs(user, tabs) : []), [user, tabs]);
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
          setUser(u);
          const first = getVisibleTabs(u, u.permissions?.dashboardTabs || ['judokas'])[0];
          setDashboardTab(first?.key || 'judokas');
        }
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setAuthLoading(false);
        }
      });

    const handleLogout = () => setUser(null);
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

      // Hors ligne seulement si les appels essentiels (stats + judokas) échouent
      const coreDown =
        results[0].status === 'rejected' && results[1].status === 'rejected';
      setServerOnline(!coreDown);

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

  // Coordon: rafraîchissement silencieux toutes les 2s pour les validations en temps réel
  useEffect(() => {
    if (!user || !perms.liveRefresh) return undefined;
    const id = setInterval(() => {
      loadData({ silent: true });
    }, 2000);
    return () => clearInterval(id);
  }, [user, perms.liveRefresh, loadData]);

  const searchTerm = searchInput.trim().toLowerCase();

  const filteredJudokas = useMemo(() => {
    if (!searchTerm) return judokas;
    return judokas.filter((j) =>
      matchesSearch(j.nom, searchTerm) ||
      matchesSearch(j.prenom, searchTerm) ||
      matchesSearch(j.club, searchTerm) ||
      matchesSearch(j.numero_carte, searchTerm) ||
      matchesSearch(`${j.prenom} ${j.nom}`, searchTerm)
    );
  }, [judokas, searchTerm]);

  const tabUsers = useMemo(() => {
    let users = getUsersForTab(members, dashboardTab);
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
  }, [members, dashboardTab, searchTerm]);
  const showJudokasTab = perms.viewJudokas !== false && tabs.includes('judokas');
  const showStatsJudokas = perms.viewStats && perms.viewJudokas !== false;
  const showStatsEntraineurs = perms.viewStats && (user?.type === 'admin' || perms.viewJudokas !== false);

  const openNewJudoka = () => {
    if (!perms.createJudokas) {
      showToast('Vous n\'êtes pas autorisé à créer des judokas', 'error');
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
    showToast(`${newJudoka.prenom} ${newJudoka.nom} enregistré — Carte ${newJudoka.numero_carte}`);
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
    const label = USER_TYPES[savedUser.type]?.label || 'Utilisateur';
    if (editingUser) {
      showToast(`${label} mis à jour`);
    } else if (savedUser.statut === 'pending') {
      showToast(`${label} créé — en attente de validation Coordon`);
    } else {
      showToast(`${label} créé — ${savedUser.email}`);
    }
    setCreateType(null);
    setEditingUser(null);
    setView('list');
    await loadData();
  };

  const handleValidateUser = async (u) => {
    try {
      await validateUser(u.id);
      showToast(`${USER_TYPES[u.type]?.label || 'Compte'} validé — compte actif`);
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

  const handleExport = () => {
    if (!perms.export) {
      showToast('Export non autorisé pour votre rôle', 'error');
      return;
    }
    if (filteredJudokas.length === 0) {
      showToast('Aucune donnée à exporter', 'error');
      return;
    }
    exportToCsv(filteredJudokas);
    showToast(`${filteredJudokas.length} judoka(s) exporté(s) en CSV`);
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

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setView('list');
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
    showToast(editingArbitre ? 'Arbitre mis à jour' : `Arbitre créé — ${saved.prenom} ${saved.nom}`);
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
    return (
      <div className="login-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <img src="/fenacoju-logo.png" alt="FENACOJU" className="header-logo-img" width="52" height="52" decoding="async" />
          <div>
            <h1>FENACOJU Base</h1>
            <p>Gestion des Clubs et Judokas Congolais</p>
          </div>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => { setView('list'); setEditing(null); setEditingUser(null); setCreateType(null); }}
          >
            Dashboard
          </button>
          {showHeaderCreate && (
            <button
              className={`nav-btn ${view === 'user-form' && !editingUser ? 'active' : ''}`}
              onClick={openCreateModal}
            >
              Créer
            </button>
          )}
          {perms.canMessage !== false && (
            <button
              className={`nav-btn ${view === 'messages' ? 'active' : ''}`}
              onClick={() => { setView('messages'); setEditing(null); setEditingUser(null); setCreateType(null); }}
            >
              Messages{unreadMessages > 0 ? ` (${unreadMessages})` : ''}
            </button>
          )}
          {canScanQr && (
            <button
              className="nav-btn"
              onClick={() => setShowQrScan(true)}
              disabled={!serverOnline}
            >
              Scan QR
            </button>
          )}
          {perms.export && (
            <button className="nav-btn" onClick={handleExport} disabled={!serverOnline}>
              Exporter
            </button>
          )}
          <div className="header-user">
            <span className="header-user-name">
              {getUserDisplayName(user)}
              <span className="role-badge">{getRoleLabel(user)}</span>
            </span>
            <button className="nav-btn nav-btn-logout" onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </nav>
      </header>

      {!serverOnline && (
        <div className="server-banner">
          {import.meta.env.PROD ? (
            <>
              Serveur temporairement indisponible — le backend Render peut mettre jusqu&apos;à une minute à démarrer.
              Actualisez la page dans quelques secondes.
            </>
          ) : (
            <>
              Serveur hors ligne — Dans le terminal, lancez <code>npm run dev</code> et ouvrez <code>http://localhost:5173</code>
            </>
          )}
        </div>
      )}

      <main className={`container ${loading ? 'is-loading' : ''}`}>
        {view === 'list' && (
          <>
            {perms.viewStats && (
              <div className="stats-grid">
                {showStatsJudokas && (
                  <>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total}</div>
                      <div className="stat-label">Judokas enregistrés</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-value">{stats.actifs}</div>
                      <div className="stat-label">Actifs</div>
                    </div>
                    <div className="stat-card accent">
                      <div className="stat-value">{stats.arbitres ?? 0}</div>
                      <div className="stat-label">Inactifs</div>
                    </div>
                  </>
                )}
                {showStatsEntraineurs && (
                  tabs.includes('entraineurs') ? (
                    <button
                      className={`stat-card stat-label-entraineurs stat-clickable ${dashboardTab === 'entraineurs' ? 'stat-active' : ''}`}
                      onClick={() => { setDashboardTab('entraineurs'); setView('list'); }}
                    >
                      <div className="stat-value">{stats.entraineurs}</div>
                      <div className="stat-label">Entraineurs</div>
                    </button>
                  ) : (
                    <div className="stat-card stat-label-entraineurs">
                      <div className="stat-value">{stats.entraineurs}</div>
                      <div className="stat-label">Entraineurs</div>
                    </div>
                  )
                )}
                {user.type !== 'club' && user.type !== 'entraineur' && (
                  tabs.includes('clubs') ? (
                    <button
                      className={`stat-card stat-clickable ${dashboardTab === 'clubs' ? 'stat-active' : ''}`}
                      onClick={() => { setDashboardTab('clubs'); setView('list'); }}
                    >
                      <div className="stat-value">{stats.clubs}</div>
                      <div className="stat-label">Clubs</div>
                    </button>
                  ) : (
                    <div className="stat-card">
                      <div className="stat-value">{stats.clubs}</div>
                      <div className="stat-label">Clubs</div>
                    </div>
                  )
                )}
                {canValidateAccounts && (stats.pendingAccounts > 0) && (
                  <button
                    className="stat-card accent pending-stat"
                    onClick={() => { setDashboardTab('clubs'); setView('list'); }}
                    type="button"
                  >
                    <div className="stat-value">{stats.pendingAccounts}</div>
                    <div className="stat-label">À valider</div>
                  </button>
                )}
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
                title={user.nom_organisation || user.nom}
                responsable={user.responsable}
                ville={user.ville}
                responsableLabel={user.type === 'ligue' ? 'Responsable de la ligue' : 'Responsable de l\'entente'}
              />
            )}

            {visibleTabs.length > 1 && (
              <div className="dashboard-tabs">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`dashboard-tab ${dashboardTab === tab.key ? 'active' : ''}`}
                    onClick={() => setDashboardTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
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
                      Nouveau judoka
                    </button>
                  )}
                </div>

                <div className="table-card">
                  <div className="table-header">
                    <h2>{user.type === 'entraineur' ? 'Judokas du club' : getSectionTitle('judokas', user)}</h2>
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
                          onClick={handleExportCardsPdf}
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
                        showActions={!readOnlyJudokas && !hideJudokaActions}
                        onViewCard={!readOnlyJudokas && !hideJudokaActions && canViewCards ? setCardJudoka : null}
                        onEdit={!hideJudokaActions && perms.createJudokas ? openEditForm : null}
                        onDelete={!hideJudokaActions && perms.deleteJudokas ? setDeleteTarget : null}
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
                    <h2>{getSectionTitle(dashboardTab, user)}</h2>
                  </div>
                  {loading && members.length === 0 ? (
                    <div className="table-skeleton">
                      {[1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
                    </div>
                  ) : (
                    <Suspense fallback={<PageLoader label="Chargement de la liste..." />}>
                      <UserList
                        users={tabUsers}
                        showClub={dashboardTab === 'entraineurs' && (user.type === 'admin' || user.type === 'ligue' || user.type === 'entente')}
                        detailColumnLabel={dashboardTab === 'federation' ? 'Fonction' : 'Détails'}
                        hideFonctionUnderName={dashboardTab === 'federation'}
                        showViewAction={dashboardTab === 'clubs' && canViewClubDetails}
                        canManage={canManageUsers}
                        canValidate={canValidateAccounts && ['ligues', 'ententes', 'clubs'].includes(dashboardTab)}
                        onView={setViewClub}
                        onEdit={canManageUsers ? openEditUser : null}
                        onDelete={canManageUsers ? setDeleteUserTarget : null}
                        onResetPassword={canResetPassword ? setResetPasswordTarget : null}
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
                    <h2>{getSectionTitle('arbitres', user)}</h2>
                  </div>
                  <Suspense fallback={<PageLoader label="Chargement des arbitres..." />}>
                    <ArbitreList
                      arbitres={arbitres.filter((a) => {
                        if (!searchTerm) return true;
                        return (
                          matchesSearch(`${a.prenom} ${a.nom}`, searchTerm) ||
                          matchesSearch(a.club, searchTerm) ||
                          matchesSearch(a.niveau, searchTerm)
                        );
                      })}
                      canManage={canCreateArbitres || user.type === 'admin'}
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
                <p>Votre fonction ({getRoleLabel(user)}) ne donne pas accès à la liste des judokas.</p>
              </div>
            )}
          </>
        )}

        {view === 'messages' && (
          <Suspense fallback={<PageLoader label="Ouverture des messages..." />}>
            <Messages
              currentUser={user}
              onUnreadChange={setUnreadMessages}
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
              entraineurs={entraineurs}
              allowPhoto={user.type === 'admin' || (user.type === 'federation' && user.fonction === 'Coordon')}
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
