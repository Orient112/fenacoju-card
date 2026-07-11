import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { enforceCreateUser } from './permissions.js';
import { getSupabase, isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const usersPath = path.join(dataDir, 'users.json');
const sessionsPath = path.join(dataDir, 'sessions.json');
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createAdminUser() {
  return {
    id: uuidv4(),
    type: 'admin',
    username: 'admin',
    email: 'admin',
    password: hashPassword('@Fenacoju'),
    nom: 'Administrateur',
    prenom: 'FENACOJU',
    created_at: new Date().toISOString(),
  };
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

// ─── JSON fallback (dev local sans Supabase) ───

function readUsersJson() {
  if (!fs.existsSync(usersPath)) {
    const admin = createAdminUser();
    fs.writeFileSync(usersPath, JSON.stringify([admin], null, 2));
    return [admin];
  }
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  if (!users.some((u) => u.type === 'admin' || u.username === 'admin')) {
    users.unshift(createAdminUser());
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  }
  return users;
}

function writeUsersJson(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function readSessionsJson() {
  if (!fs.existsSync(sessionsPath)) fs.writeFileSync(sessionsPath, JSON.stringify([], null, 2));
  const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
  const now = Date.now();
  const valid = sessions.filter((s) => s.expires_at > now);
  if (valid.length !== sessions.length) fs.writeFileSync(sessionsPath, JSON.stringify(valid, null, 2));
  return valid;
}

function writeSessionsJson(sessions) {
  fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
}

// ─── Supabase ───

export async function ensureAdminExists() {
  if (!isSupabaseEnabled()) return;
  const supabase = getSupabase();
  const { data } = await supabase.from('users').select('id').eq('type', 'admin').limit(1);
  if (data?.length) return;

  const admin = createAdminUser();
  const { error } = await supabase.from('users').insert({
    id: admin.id,
    type: admin.type,
    username: admin.username,
    email: admin.email,
    password: admin.password,
    nom: admin.nom,
    prenom: admin.prenom,
    created_at: admin.created_at,
  });
  if (error) console.error('Erreur création admin Supabase:', error.message);
}

async function readUsers() {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('users').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return readUsersJson();
}

async function readSessions() {
  if (isSupabaseEnabled()) {
    const now = Date.now();
    const supabase = getSupabase();
    await supabase.from('sessions').delete().lt('expires_at', now);
    const { data, error } = await supabase.from('sessions').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return readSessionsJson();
}

async function writeSession(token, userId) {
  const session = { token, user_id: userId, expires_at: Date.now() + SESSION_DURATION_MS };
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('sessions').insert(session);
    if (error) throw new Error(error.message);
    return;
  }
  const sessions = readSessionsJson();
  sessions.push(session);
  writeSessionsJson(sessions);
}

async function removeSession(token) {
  if (isSupabaseEnabled()) {
    await getSupabase().from('sessions').delete().eq('token', token);
    return;
  }
  writeSessionsJson(readSessionsJson().filter((s) => s.token !== token));
}

async function findByLogin(login) {
  const users = await readUsers();
  const term = login.trim().toLowerCase();
  return users.find((u) => u.username?.toLowerCase() === term || u.email?.toLowerCase() === term) || null;
}

// ─── Exports publics (async) ───

export async function getRegisteredClubs() {
  const users = await readUsers();
  return users
    .filter((u) => u.type === 'club' && u.nom_club)
    .map((u) => u.nom_club.trim())
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

export async function isClubRegistered(clubName) {
  if (!clubName?.trim()) return false;
  const term = clubName.trim().toLowerCase();
  const clubs = await getRegisteredClubs();
  return clubs.some((c) => c.toLowerCase() === term);
}

export async function login(identifier, password) {
  const user = await findByLogin(identifier);
  if (!user || user.password !== hashPassword(password)) return null;

  const token = crypto.randomBytes(32).toString('hex');
  await writeSession(token, user.id);
  return { token, user: sanitizeUser(user) };
}

export async function logout(token) {
  if (token) await removeSession(token);
}

export async function getSessionUser(token) {
  if (!token) return null;
  const sessions = await readSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;

  const users = await readUsers();
  const user = users.find((u) => u.id === session.user_id);
  return user ? sanitizeUser(user) : null;
}

export async function createUser(data, creator) {
  const enforced = enforceCreateUser(creator, { ...data });
  const users = await readUsers();

  const emailOrUsername = enforced.email?.trim().toLowerCase() || enforced.username?.trim().toLowerCase();
  if (users.some((u) => u.email?.toLowerCase() === emailOrUsername || u.username?.toLowerCase() === emailOrUsername)) {
    throw new Error('Cet identifiant est déjà utilisé');
  }

  const user = {
    id: uuidv4(),
    type: enforced.type,
    email: emailOrUsername,
    password: hashPassword(enforced.password),
    telephone: enforced.telephone?.trim() || '',
    created_at: new Date().toISOString(),
  };

  if (enforced.type === 'federation') {
    user.nom = enforced.nom?.trim();
    user.prenom = enforced.prenom?.trim();
    user.fonction = enforced.fonction?.trim() || '';
  } else if (enforced.type === 'club') {
    user.nom_club = enforced.nom_club?.trim();
    user.ville = enforced.ville?.trim() || '';
    user.responsable = enforced.responsable?.trim() || '';
    user.documents = enforced.documents || {};
  } else if (enforced.type === 'entraineur') {
    if (!enforced.club?.trim()) throw new Error('Le club est obligatoire');
    if (!(await isClubRegistered(enforced.club))) {
      throw new Error('Le club sélectionné n\'est pas enregistré dans le système');
    }
    user.nom = enforced.nom?.trim();
    user.prenom = enforced.prenom?.trim();
    user.club = enforced.club?.trim() || '';
    user.grade = enforced.grade?.trim() || '';
  }

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('users').insert(user);
    if (error) throw new Error(error.message);
  } else {
    users.push(user);
    writeUsersJson(users);
  }

  return sanitizeUser(user);
}

export async function getAllUsers() {
  const users = await readUsers();
  return users.map(sanitizeUser);
}

export async function getUserById(id) {
  const users = await readUsers();
  const user = users.find((u) => u.id === id);
  return user ? sanitizeUser(user) : null;
}

export async function updateUser(id, data, editor) {
  const users = await readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) throw new Error('Utilisateur introuvable');

  const existing = users[index];
  if (existing.type === 'admin' && editor.type !== 'admin') {
    throw new Error('Modification non autorisée');
  }

  const emailOrUsername = data.email?.trim().toLowerCase();
  if (emailOrUsername && users.some((u, i) => i !== index && (u.email?.toLowerCase() === emailOrUsername || u.username?.toLowerCase() === emailOrUsername))) {
    throw new Error('Cet identifiant est déjà utilisé');
  }

  const updated = { ...existing };

  if (emailOrUsername) updated.email = emailOrUsername;
  if (data.telephone !== undefined) updated.telephone = data.telephone?.trim() || '';

  if (existing.type === 'federation') {
    if (data.nom) updated.nom = data.nom.trim();
    if (data.prenom) updated.prenom = data.prenom.trim();
    if (data.fonction) updated.fonction = data.fonction.trim();
  } else if (existing.type === 'club') {
    if (data.nom_club) updated.nom_club = data.nom_club.trim();
    if (data.ville !== undefined) updated.ville = data.ville?.trim() || '';
    if (data.responsable !== undefined) updated.responsable = data.responsable?.trim() || '';
    if (data.documents) updated.documents = { ...(existing.documents || {}), ...data.documents };
  } else if (existing.type === 'entraineur') {
    if (data.club && !(await isClubRegistered(data.club))) {
      throw new Error('Le club sélectionné n\'est pas enregistré dans le système');
    }
    if (data.nom) updated.nom = data.nom.trim();
    if (data.prenom) updated.prenom = data.prenom.trim();
    if (data.club) updated.club = data.club.trim();
    if (data.grade) updated.grade = data.grade.trim();
  }

  if (data.password) updated.password = hashPassword(data.password);

  if (isSupabaseEnabled()) {
    const { password, ...row } = updated;
    const { error } = await getSupabase().from('users').update({ ...row, password: updated.password }).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    users[index] = updated;
    writeUsersJson(users);
  }

  return sanitizeUser(updated);
}

export async function deleteUser(id, editor) {
  const users = await readUsers();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error('Utilisateur introuvable');
  if (target.type === 'admin') throw new Error('Le compte admin ne peut pas être supprimé');
  if (target.id === editor.id) throw new Error('Vous ne pouvez pas supprimer votre propre compte');

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('users').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    writeUsersJson(users.filter((u) => u.id !== id));
  }
}

export async function resetUserPassword(id, newPassword, editor) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères');
  }

  const users = await readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) throw new Error('Utilisateur introuvable');
  if (users[index].type === 'admin' && editor.type !== 'admin') {
    throw new Error('Réinitialisation non autorisée');
  }

  const hashed = hashPassword(newPassword);

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('users').update({ password: hashed }).eq('id', id);
    if (error) throw new Error(error.message);
    users[index].password = hashed;
  } else {
    users[index].password = hashed;
    writeUsersJson(users);
  }

  return sanitizeUser(users[index]);
}
