import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const federationsPath = path.join(dataDir, 'federations.json');
export const DEFAULT_JUDO_FEDERATION_ID = '00000000-0000-4000-8000-000000000001';

function ensureJson() {
  if (!fs.existsSync(federationsPath)) {
    fs.writeFileSync(federationsPath, JSON.stringify([], null, 2));
  }
}

function readJson() {
  ensureJson();
  return JSON.parse(fs.readFileSync(federationsPath, 'utf-8'));
}

function writeJson(list) {
  ensureJson();
  fs.writeFileSync(federationsPath, JSON.stringify(list, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function slugify(nom) {
  return String(nom || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `fed-${uuidv4().slice(0, 8)}`;
}

export function getUserFederationId(user) {
  if (!user || user.type === 'superadmin') return null;
  return user.federation_id || DEFAULT_JUDO_FEDERATION_ID;
}

export async function listFederations() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('federations')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson();
}

export async function getFederationById(id) {
  if (!id) return null;
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('federations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson().find((f) => f.id === id) || null;
}

export async function ensureDefaultJudoFederation() {
  const existing = await getFederationById(DEFAULT_JUDO_FEDERATION_ID);
  if (existing) return existing;

  const row = {
    id: DEFAULT_JUDO_FEDERATION_ID,
    nom: 'Fédération Nationale Congolaise de Judo',
    slug: 'fenacoju-judo',
    logo_url: '',
    admin_user_id: null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase().from('federations').insert(row);
      if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
      return row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }

  const list = readJson();
  if (!list.some((f) => f.id === row.id)) {
    list.push(row);
    writeJson(list);
  }
  return row;
}

/**
 * Crée une fédération + son compte Admin (vide, isolé).
 */
export async function createFederationWithAdmin({
  nom_federation,
  email,
  password,
  nom = 'Administrateur',
  prenom = '',
}, creator) {
  if (creator?.type !== 'superadmin') {
    throw new Error('Seul le SuperAdmin peut créer une fédération / compte Admin');
  }
  const fedName = String(nom_federation || '').trim();
  if (!fedName) throw new Error('Le nom de la fédération est obligatoire');
  const login = String(email || '').trim().toLowerCase();
  if (!login) throw new Error('Identifiant / email Admin obligatoire');
  if (!password || String(password).length < 6) {
    throw new Error('Mot de passe Admin : au moins 6 caractères');
  }

  await ensureDefaultJudoFederation();

  // Vérifier unicité email dans users
  let users = [];
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('users').select('id,email,username');
    if (error) throw new Error(error.message);
    users = data || [];
  } else {
    const usersPath = path.join(dataDir, 'users.json');
    users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf-8')) : [];
  }
  if (users.some((u) => u.email?.toLowerCase() === login || u.username?.toLowerCase() === login)) {
    throw new Error('Cet identifiant Admin est déjà utilisé');
  }

  const federationId = uuidv4();
  const adminId = uuidv4();
  const slug = `${slugify(fedName)}-${federationId.slice(0, 6)}`;

  const federation = {
    id: federationId,
    nom: fedName,
    slug,
    logo_url: '',
    admin_user_id: adminId,
    created_at: new Date().toISOString(),
  };

  const admin = {
    id: adminId,
    type: 'admin',
    username: login,
    email: login,
    password: hashPassword(password),
    nom: String(nom || 'Administrateur').trim(),
    prenom: String(prenom || '').trim(),
    federation_id: federationId,
    statut: 'actif',
    acces_systeme: true,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    try {
      const { error: fedErr } = await getSupabase().from('federations').insert(federation);
      if (fedErr) throw fedErr;
      const { error: userErr } = await getSupabase().from('users').insert(admin);
      if (userErr) {
        await getSupabase().from('federations').delete().eq('id', federationId);
        throw userErr;
      }
      // Settings compétition vides pour cette fédération
      try {
        await getSupabase().from('competition_settings').insert({
          id: Math.floor(Math.random() * 2_000_000_000) + 2,
          federation_id: federationId,
          access_enabled: false,
          public_enabled: false,
          public_token: uuidv4().replace(/-/g, ''),
          nom: '',
          lieu: '',
          description: '',
        });
      } catch {
        // colonne federation_id absente : ignorer, fallback JSON gérera
      }
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) {
        throw new Error(err.message || 'Création fédération impossible');
      }
      // fallback JSON
      const list = readJson();
      list.push(federation);
      writeJson(list);
      const usersPath = path.join(dataDir, 'users.json');
      const localUsers = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf-8')) : [];
      localUsers.push(admin);
      fs.writeFileSync(usersPath, JSON.stringify(localUsers, null, 2));
    }
  } else {
    const list = readJson();
    list.push(federation);
    writeJson(list);
    const usersPath = path.join(dataDir, 'users.json');
    const localUsers = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf-8')) : [];
    localUsers.push(admin);
    fs.writeFileSync(usersPath, JSON.stringify(localUsers, null, 2));
  }

  const { password: _pw, ...safeAdmin } = admin;
  return { federation, admin: safeAdmin };
}

export async function ensureSuperAdminExists() {
  const email = 'orient.kitete112@gmail.com';
  const password = '@Cosmas3108';
  const hashed = hashPassword(password);

  if (isSupabaseEnabled()) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from('users').select('id,type,email').eq('email', email).maybeSingle();
      if (data) {
        if (data.type !== 'superadmin') {
          await supabase.from('users').update({ type: 'superadmin', federation_id: null, statut: 'actif' }).eq('id', data.id);
        }
        return;
      }
      const { data: byUser } = await supabase.from('users').select('id').eq('username', email).maybeSingle();
      if (byUser) {
        await supabase.from('users').update({
          type: 'superadmin',
          email,
          username: email,
          password: hashed,
          federation_id: null,
          statut: 'actif',
        }).eq('id', byUser.id);
        return;
      }
      await supabase.from('users').insert({
        id: uuidv4(),
        type: 'superadmin',
        username: email,
        email,
        password: hashed,
        nom: 'Kitete',
        prenom: 'Orient',
        statut: 'actif',
        acces_systeme: true,
        federation_id: null,
        created_at: new Date().toISOString(),
      });
      return;
    } catch (err) {
      if (!/relation|does not exist|schema cache|type|check/i.test(err.message || '')) {
        console.warn('ensureSuperAdminExists Supabase:', err.message);
      }
    }
  }

  const usersPath = path.join(dataDir, 'users.json');
  const users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf-8')) : [];
  const idx = users.findIndex((u) => u.email?.toLowerCase() === email || u.username?.toLowerCase() === email);
  if (idx !== -1) {
    users[idx] = {
      ...users[idx],
      type: 'superadmin',
      email,
      username: email,
      password: hashed,
      federation_id: null,
      statut: 'actif',
      acces_systeme: true,
    };
  } else {
    users.unshift({
      id: uuidv4(),
      type: 'superadmin',
      username: email,
      email,
      password: hashed,
      nom: 'Kitete',
      prenom: 'Orient',
      statut: 'actif',
      acces_systeme: true,
      federation_id: null,
      created_at: new Date().toISOString(),
    });
  }
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

export async function updateFederation(id, patch = {}) {
  const existing = await getFederationById(id);
  if (!existing) throw new Error('Fédération introuvable');

  let next = { ...existing };
  if (patch.nom !== undefined) {
    const nom = String(patch.nom || '').trim();
    if (!nom) throw new Error('Le nom de la fédération est obligatoire');
    next.nom = nom;
  }
  if (patch.slug !== undefined) {
    next.slug = slugify(patch.slug) || next.slug;
  }
  if (patch.logo_url !== undefined) {
    next.logo_url = String(patch.logo_url || '').trim();
  }
  if (patch.admin_user_id !== undefined) {
    next.admin_user_id = patch.admin_user_id || null;
  }

  if (isSupabaseEnabled()) {
    try {
      const payload = {
        nom: next.nom,
        slug: next.slug,
        logo_url: next.logo_url || '',
        admin_user_id: next.admin_user_id,
      };
      let { data, error } = await getSupabase()
        .from('federations')
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && /logo_url|column|schema cache/i.test(error.message || '')) {
        const { logo_url: _l, ...withoutLogo } = payload;
        ({ data, error } = await getSupabase()
          .from('federations')
          .update(withoutLogo)
          .eq('id', id)
          .select('*')
          .maybeSingle());
      }
      if (error) throw error;
      next = { ...next, ...(data || {}) };
      if (patch.admin_password) {
        await updateFederationAdminPassword(next, patch.admin_password);
      }
      return next;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }

  const list = readJson();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) throw new Error('Fédération introuvable');
  list[idx] = next;
  writeJson(list);
  if (patch.admin_password) {
    await updateFederationAdminPassword(next, patch.admin_password);
  }
  return next;
}

async function updateFederationAdminPassword(federation, password) {
  const pwd = String(password || '');
  if (pwd.length < 6) throw new Error('Mot de passe Admin : au moins 6 caractères');
  const hashed = hashPassword(pwd);
  const adminId = federation.admin_user_id;
  if (isSupabaseEnabled()) {
    try {
      if (adminId) {
        const { error } = await getSupabase().from('users').update({ password: hashed }).eq('id', adminId);
        if (error) throw error;
        return;
      }
      const { error } = await getSupabase()
        .from('users')
        .update({ password: hashed })
        .eq('federation_id', federation.id)
        .eq('type', 'admin');
      if (error) throw error;
      return;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  const usersPath = path.join(dataDir, 'users.json');
  if (!fs.existsSync(usersPath)) return;
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  let changed = false;
  for (const u of users) {
    if (u.type === 'admin' && (u.id === adminId || u.federation_id === federation.id)) {
      u.password = hashed;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

export async function deleteFederation(id) {
  if (id === DEFAULT_JUDO_FEDERATION_ID) {
    throw new Error('La fédération Judo par défaut ne peut pas être supprimée');
  }
  const existing = await getFederationById(id);
  if (!existing) throw new Error('Fédération introuvable');

  if (isSupabaseEnabled()) {
    try {
      // Soft cleanup: supprimer admin + fédération (données métier restent orphelines ou cascade)
      if (existing.admin_user_id) {
        await getSupabase().from('users').delete().eq('id', existing.admin_user_id);
      }
      await getSupabase().from('users').delete().eq('federation_id', id).eq('type', 'admin');
      const { error } = await getSupabase().from('federations').delete().eq('id', id);
      if (error) throw error;
      return { success: true, id };
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }

  const list = readJson().filter((f) => f.id !== id);
  writeJson(list);
  const usersPath = path.join(dataDir, 'users.json');
  if (fs.existsSync(usersPath)) {
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
    const nextUsers = users.filter((u) => !(u.type === 'admin' && u.federation_id === id));
    fs.writeFileSync(usersPath, JSON.stringify(nextUsers, null, 2));
  }
  return { success: true, id };
}

/** Stats globales SuperAdmin (toutes fédérations). */
export async function getSuperAdminStats() {
  const federations = await listFederations();
  let users = [];
  let judokas = [];
  let arbitres = [];

  if (isSupabaseEnabled()) {
    try {
      const supabase = getSupabase();
      const [u, j, a] = await Promise.all([
        supabase.from('users').select('id,type,federation_id,statut'),
        supabase.from('judokas').select('id,federation_id,statut'),
        supabase.from('arbitres').select('id,federation_id,statut'),
      ]);
      users = u.data || [];
      judokas = j.data || [];
      arbitres = a.data || [];
    } catch (err) {
      console.warn('getSuperAdminStats:', err.message);
    }
  } else {
    const usersPath = path.join(dataDir, 'users.json');
    const judokasPath = path.join(dataDir, 'judokas.json');
    const arbitresPath = path.join(dataDir, 'arbitres.json');
    users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf-8')) : [];
    judokas = fs.existsSync(judokasPath) ? JSON.parse(fs.readFileSync(judokasPath, 'utf-8')) : [];
    arbitres = fs.existsSync(arbitresPath) ? JSON.parse(fs.readFileSync(arbitresPath, 'utf-8')) : [];
  }

  const nonSuper = users.filter((u) => u.type !== 'superadmin');
  const fedIdOf = (row) => row.federation_id || DEFAULT_JUDO_FEDERATION_ID;

  const by_federation = federations.map((f) => {
    const fUsers = nonSuper.filter((u) => fedIdOf(u) === f.id);
    const fJudokas = judokas.filter((j) => fedIdOf(j) === f.id);
    const fArbitres = arbitres.filter((a) => fedIdOf(a) === f.id);
    return {
      id: f.id,
      nom: f.nom,
      slug: f.slug,
      logo_url: f.logo_url || '',
      judokas: fJudokas.length,
      judokas_actifs: fJudokas.filter((j) => (j.statut || 'actif') === 'actif').length,
      clubs: fUsers.filter((u) => u.type === 'club' && (u.statut || 'actif') === 'actif').length,
      ligues: fUsers.filter((u) => u.type === 'ligue').length,
      ententes: fUsers.filter((u) => u.type === 'entente').length,
      entraineurs: fUsers.filter((u) => u.type === 'entraineur').length,
      arbitres: fArbitres.length,
      admin: fUsers.find((u) => u.type === 'admin') || null,
    };
  });

  return {
    federations: federations.length,
    admins: nonSuper.filter((u) => u.type === 'admin').length,
    judokas: judokas.length,
    judokas_actifs: judokas.filter((j) => (j.statut || 'actif') === 'actif').length,
    clubs: nonSuper.filter((u) => u.type === 'club' && (u.statut || 'actif') === 'actif').length,
    ligues: nonSuper.filter((u) => u.type === 'ligue').length,
    ententes: nonSuper.filter((u) => u.type === 'entente').length,
    entraineurs: nonSuper.filter((u) => u.type === 'entraineur').length,
    arbitres: arbitres.length,
    by_federation,
  };
}

export async function assignLegacyDataToDefaultFederation(getAllUsersFn) {
  await ensureDefaultJudoFederation();
  const fedId = DEFAULT_JUDO_FEDERATION_ID;

  if (isSupabaseEnabled()) {
    try {
      const supabase = getSupabase();
      await supabase.from('users').update({ federation_id: fedId }).is('federation_id', null).neq('type', 'superadmin');
      await supabase.from('judokas').update({ federation_id: fedId }).is('federation_id', null);
      await supabase.from('arbitres').update({ federation_id: fedId }).is('federation_id', null);
      await supabase.from('competition_registrations').update({ federation_id: fedId }).is('federation_id', null);
      await supabase.from('competition_settings').update({ federation_id: fedId }).is('federation_id', null);
      const users = typeof getAllUsersFn === 'function' ? await getAllUsersFn() : [];
      const admin = users.find((u) => u.type === 'admin');
      if (admin) {
        await supabase.from('federations').update({ admin_user_id: admin.id }).eq('id', fedId);
      }
    } catch (err) {
      console.warn('assignLegacyDataToDefaultFederation:', err.message);
    }
    return;
  }

  // JSON : judokas / users
  const usersPath = path.join(dataDir, 'users.json');
  if (fs.existsSync(usersPath)) {
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
    let changed = false;
    for (const u of users) {
      if (u.type !== 'superadmin' && !u.federation_id) {
        u.federation_id = fedId;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    const admin = users.find((u) => u.type === 'admin');
    if (admin) {
      const list = readJson();
      const f = list.find((x) => x.id === fedId);
      if (f) {
        f.admin_user_id = admin.id;
        writeJson(list);
      }
    }
  }
  const judokasPath = path.join(dataDir, 'judokas.json');
  if (fs.existsSync(judokasPath)) {
    const judokas = JSON.parse(fs.readFileSync(judokasPath, 'utf-8'));
    let changed = false;
    for (const j of judokas) {
      if (!j.federation_id) {
        j.federation_id = fedId;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(judokasPath, JSON.stringify(judokas, null, 2));
  }
}
