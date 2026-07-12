export const FENACOJU_BLUE = '#0072bb';

const SENIOR_FEDERATION_TABS = ['judokas', 'entraineurs', 'clubs'];

export const FEDERATION_ROLES = {
  'Coordon': {
    viewUsers: true, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: true, createJudokas: true, export: true, deleteJudokas: true, manageAll: true, manageUsers: true,
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  'Coordon Adjoint': {
    viewUsers: true, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: true, createJudokas: true, export: true, deleteJudokas: true, manageUsers: true,
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  'Secrétaire Général': {
    viewUsers: true, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: false, createJudokas: false, export: false, deleteJudokas: false,
    manageAll: true, manageUsers: false, refreshList: false,
    dashboardTabs: SENIOR_FEDERATION_TABS, scanQr: true,
    createTypes: [],
  },
  'Directeur Technique': {
    viewUsers: true, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: false, createJudokas: true, export: true, deleteJudokas: false,
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  'Responsable Affiliation': {
    viewUsers: true, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: true, createJudokas: false, export: true, deleteJudokas: false,
    createTypes: ['club'],
    dashboardTabs: SENIOR_FEDERATION_TABS,
  },
  'Membre': {
    viewUsers: false, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: false, createJudokas: false, export: false, deleteJudokas: false,
    dashboardTabs: ['judokas'],
  },
  'Assistant (e)': {
    viewUsers: false, viewJudokas: true, viewStats: true, viewCards: false,
    createUsers: false, createJudokas: true, export: true, deleteJudokas: false,
    dashboardTabs: ['judokas'],
  },
};

const DEFAULT_FEDERATION = {
  viewUsers: false, viewJudokas: true, viewStats: true, viewCards: false,
  createUsers: false, createJudokas: false, export: false, deleteJudokas: false,
  dashboardTabs: ['judokas'],
};

export function getUserClub(user) {
  if (!user) return null;
  if (user.type === 'club') return user.nom_club;
  if (user.type === 'entraineur') return user.club;
  return null;
}

export function getPermissions(user) {
  if (!user) return {};

  if (user.type === 'admin') {
    return {
      viewUsers: true, viewJudokas: true, viewStats: true, viewCards: true,
      createUsers: true, createJudokas: true, export: true, deleteJudokas: true,
      manageAll: true, manageUsers: true, createTypes: ['federation', 'club', 'entraineur'],
      dashboardTabs: ['judokas', 'entraineurs', 'clubs', 'federation'],
      canMessage: true, scanQr: true,
    };
  }

  if (user.type === 'club') {
    return {
      viewUsers: true, viewJudokas: true, viewStats: true, viewCards: true,
      createUsers: true, createJudokas: true, export: true, deleteJudokas: true,
      createTypes: ['entraineur'],
      dashboardTabs: ['judokas', 'entraineurs'],
      clubScope: user.nom_club,
      canMessage: true,
    };
  }

  if (user.type === 'entraineur') {
    return {
      viewUsers: false, viewJudokas: true, viewStats: true, viewCards: true,
      createUsers: false, createJudokas: true, export: true, deleteJudokas: true,
      createTypes: [],
      dashboardTabs: ['judokas'],
      clubScope: user.club,
      canMessage: true,
    };
  }

  if (user.type === 'federation') {
    const role = FEDERATION_ROLES[user.fonction] || DEFAULT_FEDERATION;
    return {
      ...role,
      createTypes: role.createTypes || (role.createUsers ? ['federation', 'club', 'entraineur'] : []),
      dashboardTabs: role.dashboardTabs || ['judokas'],
      federationRole: user.fonction,
      canMessage: true,
    };
  }

  return { ...DEFAULT_FEDERATION, canMessage: true };
}

function matchClub(a, b) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function filterJudokas(judokas, user) {
  const perms = getPermissions(user);
  if (!perms.viewJudokas) return [];

  if (user.type === 'admin' || user.type === 'federation') {
    return judokas;
  }

  const club = getUserClub(user);
  return judokas.filter((j) => matchClub(j.club, club));
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

  if (user.type === 'admin' || (user.type === 'federation' && perms.manageAll)) {
    return users;
  }

  if (user.type === 'federation') {
    const tabs = perms.dashboardTabs || [];
    return users.filter((u) => {
      if (tabs.includes('entraineurs') && u.type === 'entraineur') return true;
      if (tabs.includes('clubs') && u.type === 'club') return true;
      if (tabs.includes('federation') && u.type === 'federation') return true;
      return false;
    });
  }

  if (user.type === 'club') {
    const club = user.nom_club;
    return users.filter((u) => u.type === 'entraineur' && matchClub(u.club, club));
  }

  return [];
}

export function computeStats(judokas, users, user) {
  const perms = getPermissions(user);
  const filteredJudokas = filterJudokas(judokas, user);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredUsers = filterUsers(users, user);
  const entraineurs = filteredUsers.filter((u) => u.type === 'entraineur').length;
  const clubAccounts = filteredUsers.filter((u) => u.type === 'club').length;
  const clubs = user.type === 'club'
    ? 1
    : (user.type === 'admin' || perms.manageAll)
      ? clubAccounts
      : new Set(filteredJudokas.map((j) => j.club)).size;

  return {
    total: filteredJudokas.length,
    actifs: filteredJudokas.filter((j) => j.statut === 'actif').length,
    clubs,
    clubAccounts,
    thisMonth: filteredJudokas.filter((j) => new Date(j.date_inscription) >= monthStart).length,
    entraineurs,
  };
}

export function canCreateType(user, type) {
  const perms = getPermissions(user);
  return perms.createTypes?.includes(type) ?? false;
}

export function canAccessJudoka(user, judoka) {
  const filtered = filterJudokas([judoka], user);
  return filtered.length > 0;
}

export function canViewJudokaCard(user) {
  const perms = getPermissions(user);
  return perms.viewCards !== false;
}

export function canMessageUser(sender, recipient) {
  if (!sender || !recipient || sender.id === recipient.id) return false;
  if (sender.type === 'admin') return recipient.type !== 'admin';
  if (recipient.type === 'admin') return true;
  if (sender.type === 'federation') return true;
  if (sender.type === 'club' || sender.type === 'entraineur') {
    return recipient.type === 'federation';
  }
  return false;
}

export function enforceJudokaClub(user, club) {
  if (user.type === 'admin' || user.type === 'federation') return club;
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

  return data;
}
