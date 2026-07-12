import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  fetchStats,
  fetchJudokas,
  fetchUsers,
  createJudoka,
  updateJudoka,
  deleteJudoka,
  deleteUser,
  fetchCurrentUser,
  logoutUser,
  fetchClubs,
  fetchUnreadMessages,
  getToken,
  USER_TYPES,
} from './api';
import Login from './pages/Login';

const Messages = lazy(() => import('./pages/Messages'));
const JudokaForm = lazy(() => import('./components/JudokaForm'));
const UserForm = lazy(() => import('./components/UserForm'));
const JudokaList = lazy(() => import('./components/JudokaList'));
const UserList = lazy(() => import('./components/UserList'));
const CardModal = lazy(() => import('./components/CardModal'));
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

const FILTERS = {
  all: { label: 'Tous', statut: null, period: null },
  actifs: { label: 'Actifs', statut: 'actif', period: null },
  inactifs: { label: 'Inactifs', statut: 'inactif', period: null },
};

const SECTION_TITLES = {
  judokas: 'Liste des Judokas',
  entraineurs: 'Liste des Entraineurs',
  clubs: 'Liste des Clubs',
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

function applyFilter(judokas, filterKey) {
  const filter = FILTERS[filterKey];
  if (!filter) return judokas;

  let result = [...judokas];

  if (filter.statut) {
    result = result.filter((j) => j.statut === filter.statut);
  }

  if (filter.period === 'month') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    result = result.filter((j) => new Date(j.date_inscription) >= monthStart);
  }

  return result;
}

function getUserDisplayName(user) {
  if (!user) return '';
  if (user.type === 'admin') return 'Administrateur';
  if (user.type === 'club') return user.nom_club;
  return `${user.prenom || ''} ${user.nom || ''}`.trim();
}

function getRoleLabel(user) {
  if (!user) return '';
  if (user.type === 'admin') return 'Admin';
  if (user.type === 'federation') return user.fonction || 'Fédération';
  return USER_TYPES[user.type]?.label || user.type;
}

function getVisibleTabs(user, tabs) {
  if (user.type === 'admin') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'entraineurs', label: 'Entraineurs' },
      { key: 'clubs', label: 'Club' },
      { key: 'federation', label: 'Membres' },
    ];
  }

  if (user.type === 'club') {
    return [
      { key: 'judokas', label: 'Judokas' },
      { key: 'entraineurs', label: 'Entraineurs' },
    ];
  }

  const visible = [];
  if (tabs.includes('judokas')) visible.push({ key: 'judokas', label: 'Judokas' });
  if (tabs.includes('entraineurs')) visible.push({ key: 'entraineurs', label: 'Entraineurs' });
  if (tabs.includes('clubs')) visible.push({ key: 'clubs', label: 'Club' });
  if (tabs.includes('federation')) visible.push({ key: 'federation', label: 'Membres' });
  return visible;
}

function getUsersForTab(members, tab) {
  if (tab === 'entraineurs') return members.filter((u) => u.type === 'entraineur');
  if (tab === 'clubs') return members.filter((u) => u.type === 'club');
  if (tab === 'federation') return members.filter((u) => u.type === 'federation');
  return members;
}

function getSectionTitle(tab, user) {
  if (tab === 'entraineurs' && user.type === 'club') return 'Entraineurs du club';
  return SECTION_TITLES[tab] || 'Liste';
}

function matchesSearch(value, term) {
  return (value || '').toLowerCase().includes(term);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('list');
  const [dashboardTab, setDashboardTab] = useState('judokas');
  const [stats, setStats] = useState({ total: 0, actifs: 0, clubs: 0, entraineurs: 0 });
  const [judokas, setJudokas] = useState([]);
  const [members, setMembers] = useState([]);
  const [registeredClubs, setRegisteredClubs] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [createType, setCreateType] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cardJudoka, setCardJudoka] = useState(null);
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
  const canViewCards = perms.viewCards !== false;
  const visibleTabs = useMemo(() => (user ? getVisibleTabs(user, tabs) : []), [user, tabs]);
  const entraineurs = useMemo(() => members.filter((m) => m.type === 'entraineur'), [members]);

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

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const needsUsers = user.type === 'admin' || perms.viewUsers || user.type === 'club';
      const requests = [fetchStats(), fetchJudokas(), fetchClubs()];
      if (needsUsers) requests.push(fetchUsers());

      const results = await Promise.allSettled(requests);
      const hasFailure = results.some((r) => r.status === 'rejected');

      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setJudokas(results[1].value);
      if (results[2].status === 'fulfilled') setRegisteredClubs(results[2].value || []);

      const usersResult = results[3];
      if (usersResult?.status === 'fulfilled') setMembers(usersResult.value || []);

      if (hasFailure) {
        setServerOnline(false);
        showToast('Connexion au serveur lente ou indisponible. Réessayez dans un instant.', 'error');
      } else {
        setServerOnline(true);
        fetchUnreadMessages()
          .then((r) => setUnreadMessages(r.count || 0))
          .catch(() => {});
      }
    } catch {
      setServerOnline(false);
      showToast('Erreur de connexion au serveur.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, user, perms.viewUsers]);

  useEffect(() => {
    if (user) loadData();
  }, [loadData, user]);

  const searchTerm = searchInput.trim().toLowerCase();

  const filteredJudokas = useMemo(() => {
    let result = applyFilter(judokas, activeFilter);
    if (!searchTerm) return result;
    return result.filter((j) =>
      matchesSearch(j.nom, searchTerm) ||
      matchesSearch(j.prenom, searchTerm) ||
      matchesSearch(j.club, searchTerm) ||
      matchesSearch(j.numero_carte, searchTerm) ||
      matchesSearch(`${j.prenom} ${j.nom}`, searchTerm)
    );
  }, [judokas, activeFilter, searchTerm]);

  const tabUsers = useMemo(() => {
    let users = getUsersForTab(members, dashboardTab);
    if (!searchTerm) return users;
    return users.filter((u) => {
      const name = u.type === 'club'
        ? u.nom_club
        : `${u.prenom || ''} ${u.nom || ''}`.trim();
      return (
        matchesSearch(name, searchTerm) ||
        matchesSearch(u.email, searchTerm) ||
        matchesSearch(u.club, searchTerm) ||
        matchesSearch(u.telephone, searchTerm) ||
        matchesSearch(u.fonction, searchTerm)
      );
    });
  }, [members, dashboardTab, searchTerm]);
  const showJudokasTab = perms.viewJudokas !== false && tabs.includes('judokas');
  const showUserTabs = ['entraineurs', 'clubs', 'federation'].includes(dashboardTab);

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

  const handleCreateTypeSelect = (type) => {
    setShowCreateModal(false);
    setCreateType(type);
    setEditing(null);
    setEditingUser(null);
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
    showToast(editingUser ? `${label} mis à jour` : `${label} créé — ${savedUser.email}`);
    setCreateType(null);
    setEditingUser(null);
    setView('list');
    await loadData();
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

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setView('list');
  };

  const handleStatClick = (filterKey) => {
    setActiveFilter(filterKey);
    setDashboardTab('judokas');
    setView('list');
  };

  const openCreateModal = () => {
    if (!perms.createUsers && !perms.createTypes?.length) {
      showToast('Vous n\'êtes pas autorisé à créer des utilisateurs', 'error');
      return;
    }
    setShowCreateModal(true);
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
            <h1>FENACOJU Card</h1>
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
          {(perms.createUsers || perms.createTypes?.length > 0) && (
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
          Serveur hors ligne — Dans le terminal, arrêtez les anciens processus puis lancez <code>npm run dev</code> et ouvrez <code>http://localhost:5173</code>
        </div>
      )}

      <main className={`container ${loading ? 'is-loading' : ''}`}>
        {view === 'list' && (
          <>
            {perms.viewStats && (
              <div className="stats-grid">
                {showJudokasTab && (
                  <>
                    <button
                      className={`stat-card stat-clickable ${activeFilter === 'all' ? 'stat-active' : ''}`}
                      onClick={() => handleStatClick('all')}
                    >
                      <div className="stat-value">{stats.total}</div>
                      <div className="stat-label">Judokas enregistrés</div>
                    </button>
                    <button
                      className={`stat-card success stat-clickable ${activeFilter === 'actifs' ? 'stat-active' : ''}`}
                      onClick={() => handleStatClick('actifs')}
                    >
                      <div className="stat-value">{stats.actifs}</div>
                      <div className="stat-label">Actifs</div>
                    </button>
                    <button
                      className={`stat-card accent stat-clickable ${activeFilter === 'inactifs' ? 'stat-active' : ''}`}
                      onClick={() => handleStatClick('inactifs')}
                    >
                      <div className="stat-value">{stats.total - stats.actifs}</div>
                      <div className="stat-label">Inactifs</div>
                    </button>
                  </>
                )}
                {(user.type === 'admin' || tabs.includes('entraineurs')) && (
                  <button
                    className={`stat-card stat-label-entraineurs stat-clickable ${dashboardTab === 'entraineurs' ? 'stat-active' : ''}`}
                    onClick={() => { setDashboardTab('entraineurs'); setView('list'); }}
                  >
                    <div className="stat-value">{stats.entraineurs}</div>
                    <div className="stat-label">Entraineurs</div>
                  </button>
                )}
                {user.type !== 'club' && user.type !== 'entraineur' && (
                  <button
                    className={`stat-card stat-clickable ${dashboardTab === 'clubs' ? 'stat-active' : ''}`}
                    onClick={() => { setDashboardTab('clubs'); setView('list'); }}
                  >
                    <div className="stat-value">{stats.clubs}</div>
                    <div className="stat-label">Clubs</div>
                  </button>
                )}
              </div>
            )}

            {visibleTabs.length > 0 && (
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
                <div className="filter-bar">
                  {Object.entries(FILTERS).map(([key, f]) => (
                    <button
                      key={key}
                      className={`filter-chip ${activeFilter === key ? 'active' : ''}`}
                      onClick={() => setActiveFilter(key)}
                    >
                      {f.label}
                    </button>
                  ))}
                  {activeFilter !== 'all' && (
                    <button className="filter-chip clear" onClick={() => setActiveFilter('all')}>
                      Effacer filtre
                    </button>
                  )}
                </div>

                <div className="search-bar">
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Rechercher par nom, club, n° de carte..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button className="btn btn-outline" onClick={loadData} disabled={loading}>
                    {loading ? 'Chargement...' : 'Actualiser'}
                  </button>
                  {perms.createJudokas && (
                    <button className="btn btn-accent" onClick={openNewJudoka}>
                      Nouveau judoka
                    </button>
                  )}
                </div>

                <div className="table-card">
                  <div className="table-header">
                    <h2>{getSectionTitle('judokas', user)}</h2>
                  </div>
                  {loading && judokas.length === 0 ? (
                    <div className="table-skeleton">
                      {[1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
                    </div>
                  ) : (
                    <Suspense fallback={<PageLoader label="Chargement de la liste..." />}>
                      <JudokaList
                        judokas={filteredJudokas}
                        onViewCard={canViewCards ? setCardJudoka : null}
                        onEdit={perms.createJudokas ? openEditForm : null}
                        onDelete={perms.deleteJudokas ? setDeleteTarget : null}
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
                  <button className="btn btn-outline" onClick={loadData} disabled={loading}>
                    {loading ? 'Chargement...' : 'Actualiser'}
                  </button>
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
                        showClub={dashboardTab === 'entraineurs' && user.type === 'admin'}
                        detailColumnLabel={dashboardTab === 'federation' ? 'Fonction' : 'Détails'}
                        hideFonctionUnderName={dashboardTab === 'federation'}
                        showViewAction={dashboardTab === 'clubs'}
                        canManage={canManageUsers}
                        onView={setViewClub}
                        onEdit={canManageUsers ? openEditUser : null}
                        onDelete={canManageUsers ? setDeleteUserTarget : null}
                        onResetPassword={canManageUsers ? setResetPasswordTarget : null}
                      />
                    </Suspense>
                  )}
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
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={() => { setEditing(null); setView('list'); }}
            />
          </Suspense>
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
      </main>

      {showCreateModal && (
        <Suspense fallback={null}>
          <CreateTypeModal
            allowedTypes={perms.createTypes}
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

      {viewClub && (
        <Suspense fallback={null}>
          <ClubDetailModal club={viewClub} onClose={() => setViewClub(null)} />
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
          message={`Voulez-vous vraiment supprimer ${deleteUserTarget.nom_club || `${deleteUserTarget.prenom} ${deleteUserTarget.nom}`} ?`}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeleteUserTarget(null)}
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
