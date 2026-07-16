export const FENACOJU_BLUE = '#0072bb';

const SENIOR_FEDERATION_TABS = ['judokas', 'entraineurs', 'arbitres', 'clubs', 'ententes', 'ligues'];

const CLUB_ONLY_TABS = ['clubs'];

export const ACCOUNT_STATUTS = ['pending', 'actif', 'rejete'];

export const NO_LOGIN_TYPES = ['entraineur', 'membre'];

export const FEDERATION_ROLES = {
  Coordon: {
    viewUsers: true,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: true,
    createJudokas: false,
    createArbitres: true,
    export: true,
    deleteJudokas: false,
    manageAll: true,
    manageUsers: true,
    validateAccounts: true,
    hideJudokaActions: true,
    liveRefresh: true,
    dashboardTabs: [...SENIOR_FEDERATION_TABS, 'federation'],
    createTypes: ['ligue', 'federation', 'membre'],
    scanQr: true,
    viewClubDetails: true,
  },
  'Coordon Adjoint': {
    viewUsers: true,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: false,
    export: false,
    deleteJudokas: false,
    manageAll: true,
    manageUsers: false,
    refreshList: false,
    dashboardTabs: CLUB_ONLY_TABS,
    createTypes: [],
  },
  'Secrétaire Général': {
    viewUsers: true,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: false,
    export: false,
    deleteJudokas: false,
    manageAll: true,
    manageUsers: false,
    refreshList: false,
    dashboardTabs: CLUB_ONLY_TABS,
    scanQr: true,
    createTypes: [],
  },
  'Directeur Technique': {
    viewUsers: true,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: true,
    export: true,
    deleteJudokas: false,
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  'Responsable Affiliation': {
    viewUsers: true,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: false,
    export: true,
    deleteJudokas: false,
    createTypes: [],
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  Membre: {
    viewUsers: false,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: false,
    export: false,
    deleteJudokas: false,
    dashboardTabs: ['judokas'],
  },
  'Assistant (e)': {
    viewUsers: false,
    viewJudokas: true,
    viewStats: true,
    viewCards: false,
    createUsers: false,
    createJudokas: true,
    export: true,
    deleteJudokas: false,
    dashboardTabs: ['judokas'],
  },
};

const DEFAULT_FEDERATION = {
  viewUsers: false,
  viewJudokas: true,
  viewStats: true,
  viewCards: false,
  createUsers: false,
  createJudokas: false,
  export: false,
  deleteJudokas: false,
  dashboardTabs: ['judokas'],
};

export function isCoordon(user) {
  return user?.type === 'federation' && user?.fonction === 'Coordon';
}

export function canLoginAs(user) {
  if (!user) return false;
  if (NO_LOGIN_TYPES.includes(user.type)) return false;
  if (user.acces_systeme === false) return false;
  return true;
}

export function getAccountStatut(user) {
  return user?.statut || 'actif';
}

export function isAccountActive(user) {
  if (!user) return false;
  if (user.type === 'admin') return true;
  return getAccountStatut(user) === 'actif';
}

export function getOrgName(user) {
  if (!user) return '';
  if (user.type === 'club') return user.nom_club || '';
  if (user.type === 'ligue' || user.type === 'entente') {
    return user.nom_organisation || user.nom || '';
  }
  return `${user.prenom || ''} ${user.nom || ''}`.trim();
}

export function getUserClub(user) {
  if (!user) return null;
  if (user.type === 'club') return user.nom_club;
  if (user.type === 'entraineur') return user.club;
  return null;
}

function matchClub(a, b) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function getDescendantUsers(allUsers, rootId) {
  const byParent = new Map();
  for (const u of allUsers) {
    if (!u.parent_id) continue;
    if (!byParent.has(u.parent_id)) byParent.set(u.parent_id, []);
    byParent.get(u.parent_id).push(u);
  }

  const result = [];
  const queue = [...(byParent.get(rootId) || [])];
  while (queue.length) {
    const current = queue.shift();
    result.push(current);
    const children = byParent.get(current.id) || [];
    queue.push(...children);
  }
  return result;
}

export function getScopedClubNames(allUsers, user) {
  if (!user) return [];
  if (user.type === 'club') return user.nom_club ? [user.nom_club] : [];
  if (user.type === 'entraineur') return user.club ? [user.club] : [];

  if (user.type === 'admin' || isCoordon(user) || (user.type === 'federation' && getPermissions(user).manageAll)) {
    return allUsers
      .filter((u) => u.type === 'club' && getAccountStatut(u) === 'actif' && u.nom_club)
      .map((u) => u.nom_club);
  }

  if (user.type === 'ligue' || user.type === 'entente') {
    return getDescendantUsers(allUsers, user.id)
      .filter((u) => u.type === 'club' && getAccountStatut(u) === 'actif' && u.nom_club)
      .map((u) => u.nom_club);
  }

  return [];
}

export function getPermissions(user) {
  if (!user) return {};

  if (user.type === 'admin') {
    return {
      viewUsers: true,
      viewJudokas: true,
      viewStats: true,
      viewCards: true,
      createUsers: true,
      createJudokas: true,
      createArbitres: true,
      export: true,
      deleteJudokas: true,
      manageAll: true,
      manageUsers: true,
      validateAccounts: true,
      createTypes: ['federation', 'ligue', 'entente', 'club', 'entraineur', 'membre'],
      dashboardTabs: ['judokas', 'ligues', 'ententes', 'clubs', 'entraineurs', 'arbitres', 'federation'],
      canMessage: true,
      scanQr: true,
      viewClubDetails: true,
      showHeaderCreate: true,
    };
  }

  if (user.type === 'ligue') {
    return {
      viewUsers: true,
      viewJudokas: true,
      viewStats: true,
      viewCards: false,
      createUsers: true,
      createJudokas: false,
      createArbitres: false,
      export: false,
      deleteJudokas: false,
      manageUsers: false,
      createTypes: ['entente'],
      dashboardTabs: ['judokas', 'ententes', 'clubs', 'entraineurs'],
      canMessage: true,
      viewClubDetails: true,
      orgScope: true,
      showHeaderCreate: false,
      liveRefresh: true,
    };
  }

  if (user.type === 'entente') {
    return {
      viewUsers: true,
      viewJudokas: true,
      viewStats: true,
      viewCards: false,
      createUsers: true,
      createJudokas: false,
      createArbitres: false,
      export: false,
      deleteJudokas: false,
      manageUsers: false,
      createTypes: ['club'],
      dashboardTabs: ['judokas', 'clubs', 'entraineurs'],
      canMessage: true,
      viewClubDetails: true,
      orgScope: true,
      showHeaderCreate: false,
      liveRefresh: true,
    };
  }

  if (user.type === 'club') {
    return {
      viewUsers: true,
      viewJudokas: true,
      viewStats: true,
      viewCards: false,
      createUsers: true,
      createJudokas: true,
      createArbitres: false,
      export: false,
      deleteJudokas: false,
      readOnlyJudokas: false,
      createTypes: ['entraineur'],
      dashboardTabs: ['judokas', 'entraineurs'],
      clubScope: user.nom_club,
      canMessage: true,
      showHeaderCreate: false,
    };
  }

  if (user.type === 'entraineur' || user.type === 'membre') {
    return {
      viewUsers: false,
      viewJudokas: false,
      viewStats: false,
      viewCards: false,
      createUsers: false,
      createJudokas: false,
      export: false,
      deleteJudokas: false,
      createTypes: [],
      dashboardTabs: [],
      canMessage: false,
    };
  }

  if (user.type === 'federation') {
    const role = FEDERATION_ROLES[user.fonction] || DEFAULT_FEDERATION;
    const tabs = role.dashboardTabs || ['judokas'];
    return {
      ...role,
      createTypes: role.createTypes || [],
      dashboardTabs: tabs,
      federationRole: user.fonction,
      canMessage: true,
      viewClubDetails: tabs.includes('clubs') || role.viewClubDetails === true,
      showHeaderCreate: (role.createTypes || []).length > 0 || role.createUsers === true,
    };
  }

  return { ...DEFAULT_FEDERATION, canMessage: true };
}

export function filterJudokas(judokas, user, allUsers = []) {
  const perms = getPermissions(user);
  if (!perms.viewJudokas) return [];

  if (user.type === 'admin' || (user.type === 'federation' && (perms.manageAll || isCoordon(user)))) {
    return judokas;
  }

  if (user.type === 'federation') {
    return judokas;
  }

  if (user.type === 'ligue' || user.type === 'entente') {
    const clubs = getScopedClubNames(allUsers, user).map((c) => c.toLowerCase());
    return judokas.filter((j) => clubs.includes((j.club || '').trim().toLowerCase()));
  }

  const club = getUserClub(user);
  return judokas.filter((j) => matchClub(j.club, club));
}

export function filterArbitres(arbitres, user, allUsers = []) {
  const perms = getPermissions(user);
  if (!perms.dashboardTabs?.includes('arbitres') && !perms.createArbitres && user.type !== 'admin') {
    if (!perms.viewUsers) return [];
  }

  if (user.type === 'admin' || isCoordon(user) || (user.type === 'federation' && perms.manageAll)) {
    return arbitres;
  }

  if (user.type === 'entente' || user.type === 'ligue') {
    const clubs = getScopedClubNames(allUsers, user).map((c) => c.toLowerCase());
    const descendantIds = new Set(getDescendantUsers(allUsers, user.id).map((u) => u.id));
    descendantIds.add(user.id);
    return arbitres.filter(
      (a) =>
        descendantIds.has(a.parent_id) ||
        (a.club && clubs.includes(a.club.trim().toLowerCase()))
    );
  }

  if (user.type === 'club') {
    return arbitres.filter((a) => matchClub(a.club, user.nom_club));
  }

  return [];
}

export function filterUsers(users, user) {
  const perms = getPermissions(user);
  if (!perms.viewUsers && user.type !== 'admin') {
    if (user.type === 'club') {
      const club = user.nom_club;
      return users.filter((u) => u.type === 'entraineur' && matchClub(u.club, club));
    }
    return [];
  }

  if (user.type === 'admin' || isCoordon(user) || (user.type === 'federation' && perms.manageAll)) {
    return users;
  }

  if (user.type === 'ligue' || user.type === 'entente') {
    const descendants = getDescendantUsers(users, user.id);
    const ids = new Set(descendants.map((u) => u.id));
    const clubNames = getScopedClubNames(users, user).map((c) => c.toLowerCase());

    return users.filter((u) => {
      if (ids.has(u.id)) return true;
      if (u.type === 'entraineur' && u.club && clubNames.includes(u.club.trim().toLowerCase())) return true;
      return false;
    });
  }

  if (user.type === 'federation') {
    const tabs = perms.dashboardTabs || [];
    return users.filter((u) => {
      if (tabs.includes('entraineurs') && u.type === 'entraineur') return true;
      if (tabs.includes('clubs') && u.type === 'club') return true;
      if (tabs.includes('ententes') && u.type === 'entente') return true;
      if (tabs.includes('ligues') && u.type === 'ligue') return true;
      if (tabs.includes('federation') && (u.type === 'federation' || u.type === 'membre')) return true;
      return false;
    });
  }

  if (user.type === 'club') {
    const club = user.nom_club;
    return users.filter((u) => u.type === 'entraineur' && matchClub(u.club, club));
  }

  return [];
}

export function computeStats(judokas, users, user, arbitres = []) {
  const perms = getPermissions(user);
  const filteredJudokas = filterJudokas(judokas, user, users);
  const filteredArbitres = filterArbitres(arbitres, user, users);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredUsers = filterUsers(users, user);
  const entraineurs = filteredUsers.filter((u) => u.type === 'entraineur').length;
  const clubAccounts = filteredUsers.filter((u) => u.type === 'club').length;
  const pendingLigues = filteredUsers.filter((u) => u.type === 'ligue' && getAccountStatut(u) === 'pending').length;
  const pendingEntentes = filteredUsers.filter((u) => u.type === 'entente' && getAccountStatut(u) === 'pending').length;
  const pendingClubs = filteredUsers.filter((u) => u.type === 'club' && getAccountStatut(u) === 'pending').length;
  const pendingAccounts = pendingLigues + pendingEntentes + pendingClubs;

  const clubs = user.type === 'club'
    ? 1
    : (user.type === 'admin' || perms.manageAll || user.type === 'ligue' || user.type === 'entente')
      ? clubAccounts
      : new Set(filteredJudokas.map((j) => j.club)).size;

  return {
    total: filteredJudokas.length,
    actifs: filteredJudokas.filter((j) => j.statut === 'actif').length,
    clubs,
    clubAccounts,
    ligues: filteredUsers.filter((u) => u.type === 'ligue').length,
    liguesActives: filteredUsers.filter((u) => u.type === 'ligue' && getAccountStatut(u) === 'actif').length,
    ententes: filteredUsers.filter((u) => u.type === 'entente').length,
    ententesActives: filteredUsers.filter((u) => u.type === 'entente' && getAccountStatut(u) === 'actif').length,
    clubsActifs: filteredUsers.filter((u) => u.type === 'club' && getAccountStatut(u) === 'actif').length,
    federationMembers: filteredUsers.filter((u) => u.type === 'federation' || u.type === 'membre').length,
    pendingLigues,
    pendingEntentes,
    pendingClubs,
    pendingAccounts,
    arbitres: filteredArbitres.length,
    thisMonth: filteredJudokas.filter((j) => new Date(j.date_inscription) >= monthStart).length,
    entraineurs,
  };
}

export function canCreateType(user, type) {
  const perms = getPermissions(user);
  return perms.createTypes?.includes(type) ?? false;
}

export function canAccessJudoka(user, judoka, allUsers = []) {
  const filtered = filterJudokas([judoka], user, allUsers);
  return filtered.length > 0;
}

export function canViewJudokaCard(user) {
  const perms = getPermissions(user);
  return perms.viewCards !== false;
}

export function canValidateAccounts(user) {
  return getPermissions(user).validateAccounts === true;
}

export function canMessageUser(sender, recipient) {
  if (!sender || !recipient || sender.id === recipient.id) return false;
  if (NO_LOGIN_TYPES.includes(sender.type) || NO_LOGIN_TYPES.includes(recipient.type)) return false;

  if (recipient.type === 'admin') {
    return isCoordon(sender);
  }

  if (sender.type === 'admin') {
    return recipient.type !== 'admin';
  }

  if (sender.type === 'federation' || sender.type === 'ligue' || sender.type === 'entente') {
    return recipient.type !== 'admin' || isCoordon(sender);
  }

  if (sender.type === 'club') {
    return ['federation', 'ligue', 'entente'].includes(recipient.type);
  }

  return false;
}

export function enforceJudokaClub(user, club) {
  if (user.type === 'admin' || user.type === 'federation') return club;
  if (user.type === 'ligue' || user.type === 'entente') {
    return club;
  }
  const userClub = getUserClub(user);
  if (!userClub) throw new Error('Club non autorisé');
  if (!matchClub(club, userClub)) throw new Error('Vous ne pouvez gérer que les judokas de votre club');
  return userClub;
}

export function enforceCreateUser(user, data) {
  if (!canCreateType(user, data.type)) {
    throw new Error('Vous n\'êtes pas autorisé à créer ce type d\'utilisateur');
  }

  if (user.type === 'club' && data.type === 'entraineur') {
    data.club = user.nom_club;
  }

  if (user.type === 'ligue' && data.type === 'entente') {
    data.parent_id = user.id;
  }

  if (user.type === 'entente' && data.type === 'club') {
    data.parent_id = user.id;
  }

  if (isCoordon(user) && (data.type === 'ligue' || data.type === 'membre' || data.type === 'federation')) {
    data.parent_id = user.id;
  }

  if (user.type === 'admin' && ['ligue', 'entente', 'club', 'membre', 'entraineur'].includes(data.type) && !data.parent_id) {
    data.parent_id = user.id;
  }

  return data;
}
