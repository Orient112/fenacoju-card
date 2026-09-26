import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllJudokas,
  getJudokaById,
  getJudokaByCardNumber,
  createJudoka,
  updateJudoka,
  deleteJudoka,
  generateCardNumber,
} from './database.js';
import {
  login,
  logout,
  getSessionUser,
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  resetUserPassword,
  setUserAccountStatut,
  getRegisteredClubs,
  isClubRegistered,
  ensureAdminExists,
} from './users.js';
import {
  getUserMessages,
  getConversation,
  getUnreadCount,
  sendMessage,
  getMessageContacts,
  markConversationRead,
} from './messages.js';
import { authMiddleware } from './middleware.js';
import {
  getPermissions,
  filterJudokas,
  filterUsers,
  filterArbitres,
  computeStats,
  canAccessJudoka,
  enforceJudokaClub,
  canMessageUser,
  canValidateAccounts,
  getScopedClubNames,
  NO_LOGIN_TYPES,
  canToggleCompetitionAccess,
  canManageCompetition,
  isDirecteurCompetition,
} from './permissions.js';
import {
  getAllArbitres,
  getArbitreById,
  createArbitre,
  updateArbitre,
  deleteArbitre,
  ARBITRE_NIVEAUX,
} from './arbitres.js';
import { saveUploadedFile, deleteStoredFile } from './storage.js';
import { isSupabaseEnabled } from './supabase.js';
import { uploadsDir } from './paths.js';
import {
  getCompetitionSettings,
  updateCompetitionSettings,
  getCompetitionRegistrations,
  createCompetitionRegistration,
  createCompetitionTeamRoster,
  chargeTeamFromIndividuel,
  updateCompetitionRegistration,
  updateCompetitionRegistrationWeight,
  deleteCompetitionRegistration,
  deleteCompetitionPublicLink,
  resetCompetitionCompletely,
  findDuplicateCompetitionRegistration,
  toPublicCompetition,
  toPublicRegistration,
  parseCategoriesPoids,
  parseCompetitionClubs,
  isCompetitionConfigured,
} from './competition.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;


const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function handlePhotoUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'La taille du fichier dépasse 5 Mo. Choisissez une photo plus légère.'
        : (err.message || 'Erreur lors du chargement de la photo');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const docUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/heic', 'image/heif', 'application/pdf', 'application/octet-stream',
    ];
    const ok = allowed.includes(file.mimetype) || file.mimetype.startsWith('image/');
    cb(ok ? null : new Error(`Type de fichier non supporté: ${file.mimetype}`), ok);
  },
});

const clubDocFields = [
  { name: 'doc_diplome_responsable', maxCount: 1 },
  { name: 'doc_pv_entente', maxCount: 1 },
  { name: 'doc_affiliation', maxCount: 1 },
  { name: 'doc_autorisation_exploitation', maxCount: 1 },
  { name: 'doc_statuts', maxCount: 1 },
  { name: 'doc_agrement', maxCount: 1 },
];

function handleClubDocsUpload(req, res, next) {
  docUpload.fields(clubDocFields)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (maximum 10 Mo par document)'
        : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

async function extractClubDocuments(files) {
  const documents = {};
  if (!files) return documents;
  for (const [field, fileList] of Object.entries(files)) {
    if (fileList?.[0]) {
      documents[field] = await saveUploadedFile(fileList[0], 'documents');
    }
  }
  return documents;
}

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173,https://fenacoju-card.vercel.app')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    if (/^https:\/\/fenacoju-card(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use('/uploads', express.static(uploadsDir));

const distPath = path.join(__dirname, '..', 'dist');
if (!process.env.VERCEL && fs.existsSync(distPath)) app.use(express.static(distPath));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    storage: isSupabaseEnabled() ? 'supabase' : 'local',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = identifier || email;
    if (!loginId || !password) {
      return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    }

    await ensureAdminExists();
    const result = await login(loginId, password);
    if (!result) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    res.json({ ...result, permissions: getPermissions(result.user) });
  } catch (err) {
    if (err.code === 'PENDING_ACCOUNT' || err.code === 'REJECTED_ACCOUNT' || err.code === 'NO_LOGIN') {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) await logout(token);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const user = await getSessionUser(token);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    res.json({ ...user, permissions: getPermissions(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/competition/:token', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    if (settings.public_token !== req.params.token || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const registrations = await getCompetitionRegistrations();
    const teamCounts = {};
    for (const r of registrations) {
      const mode = r.mode_inscription === 'equipe' || String(r.taille || '').startsWith('__mode_equipe__') ? 'equipe' : 'individuel';
      if (mode !== 'equipe') continue;
      const club = (r.club || '').trim() || 'Sans club';
      const poids = String(r.poids || '').trim();
      if (!poids) continue;
      if (!teamCounts[club]) teamCounts[club] = {};
      teamCounts[club][poids] = (teamCounts[club][poids] || 0) + 1;
    }
    const base = {
      nom: settings.nom,
      date_debut: settings.date_debut,
      date_fin: settings.date_fin || '',
      lieu: settings.lieu,
      description: settings.description || '',
      public_token: settings.public_token,
      categories_poids: settings.categories_poids || [],
      competition_clubs: settings.competition_clubs || [],
      team_counts: teamCounts,
      registrations_count: registrations.length,
      closed: !settings.public_enabled,
    };

    if (!settings.public_enabled) {
      return res.json(base);
    }

    const pub = toPublicCompetition(settings, {
      registrations_count: registrations.length,
      closed: false,
      categories_poids: settings.categories_poids || [],
      competition_clubs: settings.competition_clubs || [],
      team_counts: teamCounts,
    });
    if (!pub) return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    res.json(pub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/competition/:token/registrations', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    if (!settings.public_enabled || settings.public_token !== req.params.token) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }
    if (!isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }
    const registrations = await getCompetitionRegistrations();
    res.json({
      competition: toPublicCompetition(settings, { registrations_count: registrations.length }),
      registrations: registrations.map(toPublicRegistration),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/public/competition/:token/registrations/:id/poids', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    if (!settings.public_enabled || settings.public_token !== req.params.token) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }
    if (!isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }

    const updated = await updateCompetitionRegistrationWeight(req.params.id, req.body?.poids);
    res.json(toPublicRegistration(updated));
  } catch (err) {
    const status = /introuvable|obligatoire/i.test(err.message || '') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/public/competition/:token/judoka/:cardId', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    if (!settings.public_enabled || settings.public_token !== req.params.token) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }
    if (!isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const judoka = await getJudokaByCardNumber(req.params.cardId);
    if (!judoka) return res.status(404).json({ error: 'Aucun judoka trouvé avec cet identifiant' });

    const duplicate = await findDuplicateCompetitionRegistration({
      deja_enregistre: true,
      judoka_id: judoka.id,
      numero_carte: judoka.numero_carte,
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Ce judoka est déjà inscrit à cette compétition' });
    }

    res.json({
      id: judoka.id,
      numero_carte: judoka.numero_carte,
      nom: judoka.nom,
      prenom: judoka.prenom,
      date_naissance: judoka.date_naissance,
      sexe: judoka.sexe,
      club: judoka.club,
      grade: judoka.grade,
      categorie: judoka.categorie,
      poids: judoka.poids,
      taille: judoka.taille,
      telephone: judoka.telephone,
      email: judoka.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/public/competition/:token/register', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    if (!settings.public_enabled || settings.public_token !== req.params.token) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }
    if (!isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const body = req.body || {};
    const modeInscription = body.mode_inscription === 'equipe' ? 'equipe' : 'individuel';
    const payMode = body.paiement && typeof body.paiement === 'object'
      ? String(body.paiement.mode || '').trim()
      : '';
    const payPhone = body.paiement && typeof body.paiement === 'object'
      ? String(body.paiement.telephone || '').trim()
      : '';
    const payInfo = body.paiement && typeof body.paiement === 'object' ? {
      paiement_statut: 'paye',
      montant_paye: Math.max(0, Number(body.paiement.montant) || 0),
      mode_paiement: payMode === 'mobile_money' && payPhone
        ? `mobile_money|${payPhone}`
        : payMode,
    } : {};

    if (modeInscription === 'individuel' && Array.isArray(body.batch) && body.batch.length) {
      const created = [];
      const unitFee = Math.max(0, Number(
        settings.frais_monnaie === 'USD' ? settings.frais_individuel_usd : settings.frais_individuel_cdf
      ) || Number(settings.frais_individuel) || 0);
      for (const item of body.batch) {
        const registration = await createCompetitionRegistration({
          ...item,
          mode_inscription: 'individuel',
          poids: '',
          paiement_statut: payInfo.paiement_statut || 'en_attente',
          mode_paiement: payInfo.mode_paiement || '',
          montant_paye: payInfo.paiement_statut === 'paye' ? unitFee : 0,
        });
        created.push(registration);
      }
      return res.status(201).json({ count: created.length, registrations: created });
    }

    if (modeInscription === 'equipe' && Array.isArray(body.members)) {
      const roster = await createCompetitionTeamRoster({
        club: body.club,
        sexe: body.sexe,
        members: body.members,
        allowedCategories: settings.categories_poids || [],
        allowExisting: Boolean(body.allow_existing),
        paiement: body.paiement ? {
          statut: 'paye',
          montant: body.paiement.montant ?? (
            settings.frais_monnaie === 'USD' ? settings.frais_equipe_usd : settings.frais_equipe_cdf
          ) ?? settings.frais_equipe,
          mode: payMode === 'mobile_money' && payPhone
            ? `mobile_money|${payPhone}`
            : (body.paiement.mode || payMode),
          telephone: payPhone,
        } : null,
      });
      return res.status(201).json(roster);
    }

    let judokaId = body.judoka_id || null;
    let numeroCarte = body.numero_carte || '';

    if (modeInscription === 'equipe') {
      const cats = (settings.categories_poids || []).map((c) => String(c).trim());
      if (!cats.length) {
        return res.status(400).json({ error: 'Aucune catégorie de poids n\'est définie pour le mode Par équipe' });
      }
      const poids = String(body.poids || '').trim();
      if (!poids || !cats.includes(poids)) {
        return res.status(400).json({ error: 'Choisissez une catégorie de poids valide' });
      }
    }

    if (body.deja_enregistre) {
      const judoka = await getJudokaByCardNumber(body.numero_carte || body.judoka_id);
      if (!judoka) {
        return res.status(404).json({ error: 'Aucun judoka trouvé avec cet identifiant' });
      }
      judokaId = judoka.id;
      numeroCarte = judoka.numero_carte;

      const duplicate = await findDuplicateCompetitionRegistration({
        deja_enregistre: true,
        judoka_id: judokaId,
        numero_carte: numeroCarte,
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Ce judoka est déjà inscrit à cette compétition' });
      }

      const registration = await createCompetitionRegistration({
        judoka_id: judokaId,
        numero_carte: numeroCarte,
        nom: body.nom || judoka.nom,
        prenom: body.prenom || judoka.prenom,
        date_naissance: body.date_naissance || judoka.date_naissance,
        sexe: body.sexe || judoka.sexe,
        club: body.club || judoka.club,
        grade: body.grade || judoka.grade,
        categorie: body.categorie || judoka.categorie,
        poids: modeInscription === 'equipe' ? String(body.poids || '').trim() : '',
        taille: '',
        telephone: body.telephone || judoka.telephone,
        email: body.email || judoka.email,
        deja_enregistre: true,
        mode_inscription: modeInscription,
        ...payInfo,
      });
      return res.status(201).json(registration);
    }

    const duplicate = await findDuplicateCompetitionRegistration({
      deja_enregistre: false,
      nom: body.nom,
      prenom: body.prenom,
      date_naissance: body.date_naissance,
      club: body.club,
      email: body.email,
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Ce judoka est déjà inscrit à cette compétition' });
    }

    const registration = await createCompetitionRegistration({
      ...body,
      judoka_id: null,
      numero_carte: '',
      poids: modeInscription === 'equipe' ? String(body.poids || '').trim() : '',
      taille: '',
      deja_enregistre: false,
      mode_inscription: modeInscription,
      ...payInfo,
    });
    res.status(201).json(registration);
  } catch (err) {
    const status = /déjà inscrit/i.test(err.message || '') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.use('/api', authMiddleware);

app.get('/api/clubs', async (_req, res) => {
  try {
    res.json(await getRegisteredClubs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/permissions', (req, res) => {
  res.json(getPermissions(req.user));
});

app.get('/api/competition', async (req, res) => {
  try {
    const settings = await getCompetitionSettings();
    const perms = getPermissions(req.user);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    const accessOk = canToggle || (isDirecteurCompetition(req.user) && settings.access_enabled);

    if (!canToggle && !perms.canManageCompetition) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
      access_ok: accessOk,
      can_toggle_access: canToggle,
      can_edit: accessOk && (canToggle || canManage),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/competition/access', async (req, res) => {
  try {
    if (!canToggleCompetitionAccess(req.user)) {
      return res.status(403).json({ error: 'Seul Admin ou Coordon peut activer la compétition' });
    }
    const enabled = Boolean(req.body?.access_enabled);

    // Off : efface toute la compétition (params, inscrits, ancien lien)
    // On : réactive l'accès pour une nouvelle compétition vide
    const settings = enabled
      ? await updateCompetitionSettings({ access_enabled: true })
      : await resetCompetitionCompletely({ access_enabled: false });

    res.json({
      access_enabled: settings.access_enabled,
      configured: isCompetitionConfigured(settings),
      reset: !enabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/competition', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);

    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({
        error: isDirector
          ? 'Le bouton Compétition n\'est pas encore activé par Admin / Coordon'
          : 'Accès non autorisé',
      });
    }

    const body = req.body || {};
    const patch = {};

    if (body.nom !== undefined) patch.nom = String(body.nom).trim();
    if (body.date_debut !== undefined) patch.date_debut = body.date_debut || '';
    if (body.date_fin !== undefined) patch.date_fin = body.date_fin || '';
    if (body.lieu !== undefined) patch.lieu = String(body.lieu).trim();
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.categories_poids !== undefined) {
      patch.categories_poids = parseCategoriesPoids(body.categories_poids);
    }
    if (body.categories_poids_individuel !== undefined) {
      patch.categories_poids_individuel = parseCategoriesPoids(body.categories_poids_individuel);
    }
    if (body.competition_clubs !== undefined) {
      patch.competition_clubs = parseCompetitionClubs(body.competition_clubs);
    }
    if (body.frais_monnaie !== undefined) {
      patch.frais_monnaie = String(body.frais_monnaie).toUpperCase() === 'USD' ? 'USD' : 'CDF';
    }
    if (body.frais_individuel_cdf !== undefined || body.frais_individuel !== undefined) {
      patch.frais_individuel_cdf = Math.max(0, Number(body.frais_individuel_cdf ?? body.frais_individuel) || 0);
    }
    if (body.frais_individuel_usd !== undefined) {
      patch.frais_individuel_usd = Math.max(0, Number(body.frais_individuel_usd) || 0);
    }
    if (body.frais_equipe_cdf !== undefined || body.frais_equipe !== undefined) {
      patch.frais_equipe_cdf = Math.max(0, Number(body.frais_equipe_cdf ?? body.frais_equipe) || 0);
    }
    if (body.frais_equipe_usd !== undefined) {
      patch.frais_equipe_usd = Math.max(0, Number(body.frais_equipe_usd) || 0);
    }
    if (body.public_enabled !== undefined) {
      const next = { ...current, ...patch };
      if (body.public_enabled && !isCompetitionConfigured(next)) {
        return res.status(400).json({
          error: 'Paramétrez d\'abord la compétition (nom, date, lieu) avant de rendre le formulaire public',
        });
      }
      patch.public_enabled = Boolean(body.public_enabled);
    }

    const settings = await updateCompetitionSettings(patch);
    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/competition/public-link', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);
    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (current.public_enabled) {
      return res.status(400).json({
        error: 'Désactivez d\'abord le lien (Off) avant de le supprimer définitivement',
      });
    }
    const settings = await deleteCompetitionPublicLink();
    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
      registrations_cleared: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/competition/registrations', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);
    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json(await getCompetitionRegistrations());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/competition/registrations/charge-team', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);
    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const body = req.body || {};
    const result = await chargeTeamFromIndividuel({
      club: body.club,
      members: Array.isArray(body.members) ? body.members : [],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/competition/registrations/:id', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);
    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const result = await deleteCompetitionRegistration(req.params.id);
    res.json(result);
  } catch (err) {
    const status = /introuvable/i.test(err.message || '') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.put('/api/competition/registrations/:id', async (req, res) => {
  try {
    const current = await getCompetitionSettings();
    const canToggle = canToggleCompetitionAccess(req.user);
    const isDirector = isDirecteurCompetition(req.user);
    if (!canToggle && !(isDirector && current.access_enabled)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const updated = await updateCompetitionRegistration(req.params.id, {
      nom: req.body?.nom,
      prenom: req.body?.prenom,
      poids: req.body?.poids,
      club: req.body?.club,
      categorie: req.body?.categorie,
      role_equipe: req.body?.role_equipe,
    });
    res.json(updated);
  } catch (err) {
    const status = /introuvable|obligatoire/i.test(err.message || '') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/users', handleClubDocsUpload, async (req, res) => {
  try {
    const body = { ...req.body };
    const documents = await extractClubDocuments(req.files);
    if (Object.keys(documents).length) body.documents = documents;

    if (!body.type) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    if (!NO_LOGIN_TYPES.includes(body.type) && !body.password) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const user = await createUser(body, req.user);
    res.status(201).json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const search = req.query.search || '';
    let users = await getAllUsers();

    if (search) {
      const term = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.nom?.toLowerCase().includes(term) ||
          u.prenom?.toLowerCase().includes(term) ||
          u.nom_club?.toLowerCase().includes(term) ||
          u.nom_organisation?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.club?.toLowerCase().includes(term)
      );
    }

    res.json(filterUsers(users, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const filtered = filterUsers([target], req.user);
    if (!filtered.length) return res.status(403).json({ error: 'Accès non autorisé' });
    res.json(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageUsers && !perms.createUsers) {
      return res.status(403).json({ error: 'Modification non autorisée' });
    }

    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const user = await updateUser(req.params.id, req.body, req.user);
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.post('/api/users/:id/documents', handleClubDocsUpload, async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageUsers && !perms.createUsers) {
      return res.status(403).json({ error: 'Téléversement non autorisé' });
    }

    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (target.type !== 'club') {
      return res.status(400).json({ error: 'Seuls les clubs peuvent avoir des documents' });
    }

    const documents = await extractClubDocuments(req.files);
    if (!Object.keys(documents).length) {
      return res.status(400).json({ error: 'Aucun document fourni' });
    }

    const user = await updateUser(req.params.id, { documents }, req.user);
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.put('/api/users/:id/reset-password', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageUsers && !perms.createUsers) {
      return res.status(403).json({ error: 'Réinitialisation non autorisée' });
    }

    const user = await resetUserPassword(req.params.id, req.body.password, req.user);
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageUsers && !perms.createUsers) {
      return res.status(403).json({ error: 'Suppression non autorisée' });
    }

    await deleteUser(req.params.id, req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.post('/api/users/:id/validate', async (req, res) => {
  try {
    if (!canValidateAccounts(req.user)) {
      return res.status(403).json({ error: 'Validation non autorisée' });
    }
    const user = await setUserAccountStatut(req.params.id, 'actif', req.user);
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.post('/api/users/:id/reject', async (req, res) => {
  try {
    if (!canValidateAccounts(req.user)) {
      return res.status(403).json({ error: 'Rejet non autorisé' });
    }
    const user = await setUserAccountStatut(req.params.id, 'rejete', req.user);
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/messages/unread', async (req, res) => {
  try {
    res.json({ count: await getUnreadCount(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/contacts', async (req, res) => {
  try {
    const users = await getAllUsers();
    const contacts = await getMessageContacts(req.user, users);
    const messages = await getUserMessages(req.user.id);
    const enriched = contacts.map((c) => {
      const conv = messages.filter(
        (m) => (m.from_id === req.user.id && m.to_id === c.id) || (m.from_id === c.id && m.to_id === req.user.id)
      );
      const last = conv[conv.length - 1];
      const unread = conv.filter((m) => m.to_id === req.user.id && !m.read).length;
      return { ...c, lastMessage: last || null, unread };
    });
    enriched.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return tb - ta;
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/conversation/:userId', async (req, res) => {
  try {
    const other = await getUserById(req.params.userId);
    if (!other) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!canMessageUser(req.user, other) && !canMessageUser(other, req.user)) {
      return res.status(403).json({ error: 'Conversation non autorisée' });
    }
    await markConversationRead(req.user.id, other.id);
    res.json(await getConversation(req.user.id, other.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { to_id, subject, body } = req.body;
    const message = await sendMessage(req.user, to_id, subject, body);
    res.status(201).json(message);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const judokas = await getAllJudokas();
    const users = await getAllUsers();
    let arbitres = [];
    try {
      arbitres = await getAllArbitres();
    } catch (err) {
      console.warn('Stats sans arbitres:', err.message);
    }
    res.json(computeStats(judokas, users, req.user, arbitres));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/arbitres', async (req, res) => {
  try {
    const users = await getAllUsers();
    let arbitres = await getAllArbitres(req.query.search || '');
    arbitres = filterArbitres(arbitres, req.user, users);
    res.json(arbitres);
  } catch (err) {
    console.warn('GET /api/arbitres:', err.message);
    res.json([]);
  }
});

app.post('/api/arbitres', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.createArbitres) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créer des arbitres' });
    }

    const body = req.body;
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.niveau) {
      return res.status(400).json({ error: 'Nom, prénom et niveau requis' });
    }
    if (!ARBITRE_NIVEAUX.includes(body.niveau)) {
      return res.status(400).json({ error: 'Niveau d\'arbitre invalide' });
    }

    const arbitre = await createArbitre({
      nom: body.nom.trim(),
      prenom: body.prenom.trim(),
      niveau: body.niveau,
      telephone: body.telephone?.trim() || '',
      email: body.email?.trim() || '',
      club: body.club?.trim() || '',
      grade: body.grade?.trim() || '',
      parent_id: req.user.id,
      statut: 'actif',
    });
    res.status(201).json(arbitre);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.put('/api/arbitres/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.createArbitres && !perms.manageUsers) {
      return res.status(403).json({ error: 'Modification non autorisée' });
    }
    const existing = await getArbitreById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Arbitre introuvable' });

    const users = await getAllUsers();
    const allowed = filterArbitres([existing], req.user, users);
    if (!allowed.length) return res.status(403).json({ error: 'Accès non autorisé' });

    const body = req.body;
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.niveau) {
      return res.status(400).json({ error: 'Nom, prénom et niveau requis' });
    }
    if (!ARBITRE_NIVEAUX.includes(body.niveau)) {
      return res.status(400).json({ error: 'Niveau d\'arbitre invalide' });
    }

    const updated = await updateArbitre(req.params.id, {
      nom: body.nom.trim(),
      prenom: body.prenom.trim(),
      niveau: body.niveau,
      telephone: body.telephone?.trim() || '',
      email: body.email?.trim() || '',
      club: body.club?.trim() || '',
      grade: body.grade?.trim() || '',
      statut: body.statut || 'actif',
    });
    res.json(updated);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.delete('/api/arbitres/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.createArbitres && !perms.manageUsers && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Suppression non autorisée' });
    }
    const existing = await getArbitreById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Arbitre introuvable' });

    const users = await getAllUsers();
    const allowed = filterArbitres([existing], req.user, users);
    if (!allowed.length) return res.status(403).json({ error: 'Accès non autorisé' });

    await deleteArbitre(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/judokas', async (req, res) => {
  try {
    const search = req.query.search || '';
    const users = await getAllUsers();
    let judokas = await getAllJudokas(search);
    judokas = filterJudokas(judokas, req.user, users);
    res.json(judokas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/judokas/resolve/qr', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.scanQr) {
      return res.status(403).json({ error: 'Scan QR non autorisé pour votre rôle' });
    }

    const id = (req.query.id || '').trim();
    const carte = (req.query.carte || '').trim();

    if (!id && !carte) {
      return res.status(400).json({ error: 'Identifiant QR invalide' });
    }

    let judoka = null;
    if (id) judoka = await getJudokaById(id);
    if (!judoka && carte) judoka = await getJudokaByCardNumber(carte);

    if (!judoka) {
      return res.status(404).json({ error: 'Judoka introuvable dans le système', found: false });
    }

    const users = await getAllUsers();
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé à ce judoka', found: false });
    }

    res.json(judoka);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/judokas/:id', async (req, res) => {
  try {
    const judoka = await getJudokaById(req.params.id);
    if (!judoka) return res.status(404).json({ error: 'Judoka introuvable' });
    const users = await getAllUsers();
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json(judoka);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/judokas', handlePhotoUpload, async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.createJudokas) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créer des judokas' });
    }

    const body = req.body;
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.date_naissance || !body.club?.trim() || !body.grade) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const users = await getAllUsers();
    const club = enforceJudokaClub(req.user, body.club?.trim());
    if (req.user.type === 'ligue' || req.user.type === 'entente') {
      const allowed = getScopedClubNames(users, req.user);
      if (!allowed.some((c) => c.trim().toLowerCase() === club.trim().toLowerCase())) {
        return res.status(403).json({ error: 'Club hors de votre périmètre' });
      }
    }
    if (!(await isClubRegistered(club))) {
      return res.status(400).json({ error: 'Ce club n\'est pas enregistré dans le système. Créez d\'abord le club.' });
    }

    const id = uuidv4();
    const numero_carte = await generateCardNumber();
    const photo = req.file ? await saveUploadedFile(req.file, 'photos') : '';

    await createJudoka({
      id,
      numero_carte,
      nom: body.nom?.trim(),
      prenom: body.prenom?.trim(),
      date_naissance: body.date_naissance,
      sexe: body.sexe,
      club,
      grade: body.grade,
      categorie: body.categorie?.trim() || '',
      numero_licence: body.numero_licence?.trim() || '',
      telephone: body.telephone?.trim() || '',
      email: body.email?.trim() || '',
      taille: body.taille?.toString().trim() || '',
      poids: body.poids?.toString().trim() || '',
      photo,
      entraineur_id: body.entraineur_id?.trim() || '',
      entraineur_nom: body.entraineur_nom?.trim() || '',
      date_inscription: body.date_inscription || new Date().toISOString().split('T')[0],
      statut: 'actif',
    });

    res.status(201).json(await getJudokaById(id));
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.put('/api/judokas/:id', handlePhotoUpload, handleUpdateJudoka);
// POST : plus fiable via le proxy Vercel (PUT multipart souvent bloqué / timeout)
app.post('/api/judokas/:id', handlePhotoUpload, handleUpdateJudoka);

async function handleUpdateJudoka(req, res) {
  try {
    const perms = getPermissions(req.user);
    const canUpdateJudoka = req.user.type === 'admin'
      || perms.createJudokas
      || perms.manageUsers
      || perms.manageGrades;
    if (perms.readOnlyJudokas || !canUpdateJudoka) {
      return res.status(403).json({ error: 'Modification non autorisée' });
    }

    const users = await getAllUsers();
    const existing = await getJudokaById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, existing, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const body = req.body;
    const gradeOnly = perms.manageGrades && !perms.createJudokas && !perms.manageUsers && req.user.type !== 'admin';
    if (gradeOnly) {
      const nextGrade = String(body.grade || '').trim();
      if (!nextGrade) {
        return res.status(400).json({ error: 'Le nouveau grade est requis' });
      }
      await updateJudoka(req.params.id, { grade: nextGrade });
      return res.json(await getJudokaById(req.params.id));
    }
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.date_naissance || !body.club?.trim() || !body.grade) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const club = enforceJudokaClub(req.user, body.club?.trim());
    const clubUnchanged =
      club.trim().toLowerCase() === (existing.club || '').trim().toLowerCase();
    if (!clubUnchanged && !(await isClubRegistered(club))) {
      return res.status(400).json({ error: 'Ce club n\'est pas enregistré dans le système' });
    }

    let photo = existing.photo;
    if (req.file) {
      if (existing.photo) await deleteStoredFile(existing.photo);
      photo = await saveUploadedFile(req.file, 'photos');
    }

    await updateJudoka(req.params.id, {
      nom: body.nom?.trim(),
      prenom: body.prenom?.trim(),
      date_naissance: body.date_naissance,
      sexe: body.sexe,
      club,
      grade: body.grade,
      categorie: body.categorie?.trim() || '',
      numero_licence: body.numero_licence?.trim() || '',
      telephone: body.telephone?.trim() || '',
      email: body.email?.trim() || '',
      taille: body.taille?.toString().trim() || '',
      poids: body.poids?.toString().trim() || '',
      photo,
      entraineur_id: body.entraineur_id?.trim() || '',
      entraineur_nom: body.entraineur_nom?.trim() || '',
      date_inscription: body.date_inscription || existing.date_inscription,
      statut: body.statut || 'actif',
    });

    res.json(await getJudokaById(req.params.id));
  } catch (err) {
    const status = /autorisé|autorisée/i.test(err.message || '') ? 403 : 500;
    res.status(status).json({ error: err.message || 'Erreur lors de la mise à jour' });
  }
}

app.delete('/api/judokas/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.deleteJudokas) return res.status(403).json({ error: 'Suppression non autorisée' });

    const users = await getAllUsers();
    const existing = await getJudokaById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, existing, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    if (existing.photo) await deleteStoredFile(existing.photo);
    await deleteJudoka(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (!process.env.VERCEL && fs.existsSync(distPath)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function startServer() {
  try {
    await ensureAdminExists();
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Serveur FENACOJU Card démarré sur le port ${PORT}`);
      console.log(`Stockage: ${isSupabaseEnabled() ? 'Supabase' : 'local (JSON)'}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Le port ${PORT} est déjà utilisé. Relancez avec: npm run dev`);
        process.exit(1);
      }
      throw err;
    });
  } catch (err) {
    console.error('Erreur démarrage serveur:', err.message);
    process.exit(1);
  }
}

export default app;

if (!process.env.VERCEL) {
  startServer();
} else {
  ensureAdminExists().catch((err) => {
    console.error('Erreur initialisation admin:', err.message);
  });
}
