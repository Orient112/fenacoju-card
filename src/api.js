const TOKEN_KEY = 'fenacoju_token';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** Render free peut mettre ~30–50s à démarrer (cold start). */
const DEFAULT_TIMEOUT_MS = import.meta.env.PROD ? 45000 : 15000;
const AUTH_TIMEOUT_MS = import.meta.env.PROD ? 45000 : 10000;

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Le serveur met trop de temps à répondre. Réessayez dans quelques secondes.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Préfixe les chemins /uploads/ avec l'URL du backend en production. */
export function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return apiUrl(url);
  return url;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetchWithTimeout(apiUrl(url), { ...options, headers });

  if (res.status === 401 && !url.includes('/auth/login')) {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
  }

  return res;
}

export async function loginUser(identifier, password) {
  const res = await fetchWithTimeout(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur de connexion');
  }

  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function logoutUser() {
  const token = getToken();
  if (token) {
    await fetchWithTimeout(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearToken();
}

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) return null;

  const res = await fetchWithTimeout(apiUrl('/api/auth/me'), {
    headers: { Authorization: `Bearer ${token}` },
  }, AUTH_TIMEOUT_MS);

  if (!res.ok) {
    clearToken();
    return null;
  }

  return res.json();
}

export async function createUser(data) {
  const isFormData = data instanceof FormData;
  const res = await apiFetch('/api/users', {
    method: 'POST',
    body: isFormData ? data : JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la création');
  }

  return res.json();
}

export async function updateUser(id, data) {
  const isFormData = data instanceof FormData;
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    body: isFormData ? data : JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la mise à jour');
  }

  return res.json();
}

export async function deleteUser(id) {
  const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la suppression');
  }
  return res.json();
}

export async function validateUser(id) {
  const res = await apiFetch(`/api/users/${id}/validate`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la validation');
  }
  return res.json();
}

export async function rejectUser(id) {
  const res = await apiFetch(`/api/users/${id}/reject`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors du rejet');
  }
  return res.json();
}

export async function resetUserPassword(id, password) {
  const res = await apiFetch(`/api/users/${id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la réinitialisation');
  }

  return res.json();
}

export async function fetchUsers(search = '') {
  const res = await apiFetch(`/api/users?search=${encodeURIComponent(search)}`);
  if (!res.ok) throw new Error('Impossible de charger les utilisateurs');
  return res.json();
}

export function getUserClub(user) {
  if (!user) return null;
  if (user.type === 'club') return user.nom_club;
  if (user.type === 'entraineur') return user.club;
  return null;
}

export async function fetchClubs() {
  const res = await apiFetch('/api/clubs');
  if (!res.ok) throw new Error('Impossible de charger les clubs');
  return res.json();
}

export async function fetchStats() {
  const res = await apiFetch('/api/stats');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Impossible de charger les statistiques');
  }
  return res.json();
}

export async function fetchJudokas(search = '') {
  const res = await apiFetch(`/api/judokas?search=${encodeURIComponent(search)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Impossible de charger les judokas');
  }
  return res.json();
}

export async function fetchArbitres(search = '') {
  const res = await apiFetch(`/api/arbitres?search=${encodeURIComponent(search)}`);
  if (!res.ok) {
    // Endpoint optionnel : ne bloque pas le dashboard si table absente
    console.warn('Arbitres indisponibles', res.status);
    return [];
  }
  return res.json();
}

export async function createArbitre(data) {
  const res = await apiFetch('/api/arbitres', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la création de l\'arbitre');
  }
  return res.json();
}

export async function updateArbitre(id, data) {
  const res = await apiFetch(`/api/arbitres/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la mise à jour');
  }
  return res.json();
}

export async function deleteArbitre(id) {
  const res = await apiFetch(`/api/arbitres/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la suppression');
  }
  return res.json();
}

export async function fetchJudoka(id) {
  const res = await apiFetch(`/api/judokas/${id}`);
  if (!res.ok) throw new Error('Judoka introuvable');
  return res.json();
}

export async function resolveJudokaFromQrPayload(payload) {
  const params = new URLSearchParams();
  if (payload?.id) params.set('id', payload.id);
  if (payload?.carte) params.set('carte', payload.carte);

  if (!params.toString()) {
    throw new Error('QR Code non reconnu');
  }

  const res = await apiFetch(`/api/judokas/resolve/qr?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error || (res.status === 404 ? 'Judoka introuvable dans le système' : 'Impossible de vérifier le QR Code');
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

export async function createJudoka(formData) {
  const res = await apiFetch('/api/judokas', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la création');
  }
  return res.json();
}

export async function updateJudoka(id, formData) {
  const res = await apiFetch(`/api/judokas/${id}`, { method: 'PUT', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la mise à jour');
  }
  return res.json();
}

export async function deleteJudoka(id) {
  const res = await apiFetch(`/api/judokas/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erreur lors de la suppression');
  return res.json();
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function calcAge(dateNaissance) {
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function getCardValidityYear(judoka) {
  const base = judoka.date_inscription || judoka.created_at?.split('T')[0];
  if (!base) return new Date().getFullYear() + 1;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return new Date().getFullYear() + 1;
  return d.getFullYear() + 1;
}

export async function uploadClubDocuments(userId, docs) {
  const formData = new FormData();
  Object.entries(docs).forEach(([key, file]) => {
    if (file) formData.append(key, file);
  });
  const res = await apiFetch(`/api/users/${userId}/documents`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors du téléversement des documents');
  }
  return res.json();
}

export async function fetchMessageContacts() {
  const res = await apiFetch('/api/messages/contacts');
  if (!res.ok) throw new Error('Impossible de charger les contacts');
  return res.json();
}

export async function fetchConversation(userId) {
  const res = await apiFetch(`/api/messages/conversation/${userId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Impossible de charger la conversation');
  }
  return res.json();
}

export async function sendMessage(toId, subject, body) {
  const res = await apiFetch('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to_id: toId, subject, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de l\'envoi');
  }
  return res.json();
}

export async function fetchUnreadMessages() {
  const res = await apiFetch('/api/messages/unread');
  if (!res.ok) return { count: 0 };
  return res.json();
}

export const FENACOJU_BLUE = '#1D4393';

export const FEDERATION_FONCTIONS = [
  'Coordon',
  'Coordon Adjoint',
  'Secrétaire Général',
  'Directeur Technique',
  'Responsable Affiliation',
  'Membre',
  'Assistant (e)',
];

/** Fonctions attribuables aux fiches Membres (sans connexion) */
export const MEMBRE_FONCTIONS = FEDERATION_FONCTIONS.filter((f) => f !== 'Coordon');

export const ARBITRE_NIVEAUX = ['National', 'Intercontinental', 'International'];

export const USER_TYPES = {
  federation: { label: 'Compte Fédération (connexion)', description: 'Compte connecté (ex. Coordon) avec identifiant et mot de passe' },
  membre: { label: 'Membre de la Fédération', description: 'Fiche membre sans accès au système — fonction fédérale' },
  ligue: { label: 'Ligue', description: 'Créer un compte Ligue (validé par le Coordon)' },
  entente: { label: 'Entente', description: 'Créer un compte Entente sous une Ligue' },
  club: { label: 'Club', description: 'Enregistrer un club affilié (validé par le Coordon)' },
  entraineur: { label: 'Entraineur', description: 'Fiche entraineur / coach (sans connexion)' },
};

export const ACCOUNT_STATUT_LABELS = {
  pending: 'En attente',
  actif: 'Actif',
  rejete: 'Rejeté',
};

export const GRADES = [
  'Blanche',
  'Blanche-Jaune',
  'Jaune',
  'Jaune-Orange',
  'Orange',
  'Orange-Verte',
  'Verte',
  'Verte-Bleue',
  'Bleue',
  'Bleue-Marron',
  'Marron',
  'Noire 1er Dan',
  'Noire 2ème Dan',
  'Noire 3ème Dan',
  'Noire 4ème Dan',
  'Noire 5ème Dan',
];

export const CATEGORIES = [
  'Mini-poussins',
  'Poussins',
  'Benjamins',
  'Minimes',
  'Cadets',
  'Juniors',
  'Seniors',
  'Vétérans',
];
