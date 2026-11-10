import 'dotenv/config';
import dotenv from 'dotenv';
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
  findJudokaByIdentity,
} from './database.js';
import { validateCategoryAge, categoryFromBirthDate, parseCategoriesAge } from './categoryAge.js';
import {
  addGradeHistory,
  actorLabel,
  approveGradeRequest,
  clearBlackBeltGradeHistory,
  confirmTransferByFederation,
  createGradeRequest,
  createTransfer,
  getGradeHistory,
  getGradeRequests,
  getJudokaEvents,
  getTransfers,
  isBlackBeltGrade,
  isClubAllowedGrade,
  isMarronOrBlackGrade,
  nextBlackBeltGrade,
  rejectGradeRequest,
  rejectTransfer,
  validateTransferByEntente,
  validateTransferByLigue,
} from './judokaLifecycle.js';
import {
  createGradeExam,
  getExamSubmissions,
  getGradeExamById,
  getGradeExamByToken,
  gradeExamSubmission,
  listGradeExams,
  listGradeExamSubmissionsWithExam,
  publicExamLookup,
  publicExamSubmit,
  publicExamSummary,
  resetGradePassationHistory,
} from './gradeExams.js';
import {
  archiveGradePassationReset,
  getGradePassationArchiveById,
  listGradePassationArchives,
} from './gradeHistoryArchive.js';
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
  setUserCompetitionAccess,
  listFederationPaymentAccounts,
  setUserPaymentCredentials,
  clearUserPaymentCredentials,
  resolveCompetitionPaymentCredentials,
  getRegisteredClubs,
  isClubRegistered,
  ensureRegisteredClub,
  ensureAdminExists,
  updateOwnProfile,
  changeOwnPassword,
  updateOwnPhoto,
} from './users.js';
import {
  getUserMessages,
  getConversation,
  getUnreadCount,
  sendMessage,
  getMessageContacts,
  markConversationRead,
  deleteMessageForUser,
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
  getDescendantUsers,
  getAccountStatut,
  NO_LOGIN_TYPES,
  canToggleCompetitionAccess,
  canManageCompetition,
  isDirecteurCompetition,
  getUserFederationId,
} from './permissions.js';
import {
  listFederations,
  createFederationWithAdmin,
  getFederationById,
  updateFederation,
  deleteFederation,
  getSuperAdminStats,
  resetFederationAdminPassword,
  getFederationBrandingForUser,
  setFederationActive,
  isFederationEnabled,
} from './federations.js';
import {
  getFederationSettingsForUser,
  saveFederationSettings,
  saveFederationSettingsById,
  getFederationSettingsById,
  getFederationRolesCatalog,
  applySettingsToPermissions,
} from './federationSettings.js';
import { enrichJudokasWithHierarchy, ensureOrgCodes } from './orgHierarchy.js';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import {
  getAllArbitres,
  getArbitreById,
  createArbitre,
  updateArbitre,
  deleteArbitre,
  ARBITRE_NIVEAUX,
} from './arbitres.js';
import { saveUploadedFile, deleteStoredFile } from './storage.js';
import { uploadsDir } from './paths.js';
import {
  getCompetitionSettings,
  getCompetitionSettingsByPublicToken,
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
  competitionOwnerKey,
  ententeOwnerKey,
  ligueOwnerKey,
} from './competition.js';
import {
  collectSimplyPayPayment,
  initiateSimplyPayPayment,
  checkSimplyPayStatus,
  isSimplyPayConfigured,
  normalizeCongoPhone,
} from './simplyPay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Garantit le chargement du .env à la racine du projet (local + certains hébergeurs)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

const corsOrigins = (process.env.CORS_ORIGIN || [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://fenacoju-card.vercel.app',
  'https://fight-management.com',
  'https://www.fight-management.com',
].join(','))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    if (/^https:\/\/fenacoju-card(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return cb(null, true);
    if (/^https:\/\/(www\.)?fight-management\.com$/i.test(origin)) return cb(null, true);
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
    simplyPay: isSimplyPayConfigured(),
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
    const [federation_settings, federation_branding] = await Promise.all([
      getFederationSettingsForUser(result.user),
      getFederationBrandingForUser(result.user),
    ]);

    res.json({
      ...result,
      permissions: applySettingsToPermissions(getPermissions(result.user, federation_settings), federation_settings),
      federation_settings,
      federation_branding,
    });
  } catch (err) {
    if (
      err.code === 'PENDING_ACCOUNT'
      || err.code === 'REJECTED_ACCOUNT'
      || err.code === 'NO_LOGIN'
      || err.code === 'FEDERATION_DISABLED'
    ) {
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
    const [federation_settings, federation_branding] = await Promise.all([
      getFederationSettingsForUser(user),
      getFederationBrandingForUser(user),
    ]);
    res.json({
      ...user,
      permissions: applySettingsToPermissions(getPermissions(user, federation_settings), federation_settings),
      federation_settings,
      federation_branding,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Résout une compétition publique (Directeur ou Entente) via son token. */
async function resolvePublicCompetition(token) {
  const settings = await getCompetitionSettingsByPublicToken(token);
  if (!settings || settings.public_token !== String(token || '').trim()) return null;
  return settings;
}

function publicCompetitionScope(settings) {
  return {
    federationId: settings?.federation_id || null,
    ownerKey: settings?.owner_key || 'federation',
  };
}

async function competitionPaymentCredentials(settings) {
  return resolveCompetitionPaymentCredentials(settings);
}

function paymentUnavailableMessage(settings) {
  const ownerKey = String(settings?.owner_key || 'federation');
  if (ownerKey.startsWith('entente:')) {
    return 'Paiement indisponible : ajoutez le short code et la clé API de cette Entente (SuperAdmin → Fédérations → Paiement)';
  }
  return 'Paiement indisponible : configurez le short code et la clé API du Directeur Compétition (SuperAdmin → Paiement)';
}

app.get('/api/public/competition/:token', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const { federationId, ownerKey } = publicCompetitionScope(settings);
    const registrations = await getCompetitionRegistrations(federationId, ownerKey);
    const teamCounts = {};
    const teamMembers = [];
    for (const r of registrations) {
      const mode = r.mode_inscription === 'equipe' || String(r.taille || '').startsWith('__mode_equipe__') ? 'equipe' : 'individuel';
      if (mode !== 'equipe') continue;
      const club = (r.club || '').trim() || 'Sans club';
      const poids = String(r.poids || '').trim();
      if (poids) {
        if (!teamCounts[club]) teamCounts[club] = {};
        teamCounts[club][poids] = (teamCounts[club][poids] || 0) + 1;
      }
      teamMembers.push(toPublicRegistration(r));
    }
    const base = {
      nom: settings.nom,
      date_debut: settings.date_debut,
      date_fin: settings.date_fin || '',
      lieu: settings.lieu,
      description: settings.description || '',
      logo_url: settings.logo_url || '',
      public_token: settings.public_token,
      categories_poids: settings.categories_poids || [],
      categories_age: settings.categories_age || [],
      allow_hors_systeme: Boolean(settings.allow_hors_systeme),
      competition_clubs: settings.competition_clubs || [],
      team_counts: teamCounts,
      team_members: teamMembers,
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
      team_members: teamMembers,
    });
    if (!pub) return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    res.json(pub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Judokas d'un club pour sélection équipe (inscription publique Par équipe) */
app.get('/api/public/competition/:token/club-judokas', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !settings.public_enabled || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }
    const club = String(req.query.club || '').trim().toLowerCase();
    if (!club) return res.status(400).json({ error: 'Club obligatoire' });
    const allowed = (settings.competition_clubs || [])
      .filter((c) => c.cadre === 'equipe')
      .some((c) => String(c.nom || '').trim().toLowerCase() === club);
    if (!allowed) {
      return res.status(400).json({ error: 'Ce club n\'est pas enregistré en Par équipe' });
    }
    const all = await getAllJudokas();
    const list = all
      .filter((j) => String(j.club || '').trim().toLowerCase() === club && (j.statut || 'actif') === 'actif')
      .map((j) => ({
        id: j.id,
        nom: j.nom,
        prenom: j.prenom,
        sexe: j.sexe === 'F' ? 'F' : 'M',
        date_naissance: j.date_naissance,
        grade: j.grade,
        categorie: j.categorie,
        poids: j.poids || '',
        numero_carte: j.numero_carte,
        club: j.club,
      }))
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/competition/:token/registrations', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    // Pesée autorisée même si les inscriptions sont clôturées (token valide requis)
    if (!settings || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }
    const { federationId, ownerKey } = publicCompetitionScope(settings);
    const registrations = await getCompetitionRegistrations(federationId, ownerKey);
    const competition = toPublicCompetition(
      settings,
      { registrations_count: registrations.length, closed: !settings.public_enabled },
      { forWeigh: true },
    );
    if (!competition) {
      return res.status(404).json({ error: 'Page de pesée indisponible' });
    }
    res.json({
      competition,
      registrations: registrations.map(toPublicRegistration),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/public/competition/:token/registrations/:id/poids', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    // Pesée autorisée même si les inscriptions sont clôturées (token valide requis)
    if (!settings || !isCompetitionConfigured(settings)) {
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
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !settings.public_enabled || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const judoka = await getJudokaByCardNumber(req.params.cardId);
    if (!judoka) return res.status(404).json({ error: 'Aucun judoka trouvé avec cet identifiant' });

    const clubKey = String(judoka.club || '').trim().toLowerCase();
    const allowedClubs = (settings.competition_clubs || []).map((c) => String(c.nom || '').trim().toLowerCase());
    if (allowedClubs.length && !allowedClubs.includes(clubKey)) {
      return res.status(403).json({ error: 'Ce club n\'est pas autorisé pour cette compétition' });
    }

    const { federationId, ownerKey } = publicCompetitionScope(settings);
    const duplicate = await findDuplicateCompetitionRegistration({
      deja_enregistre: true,
      judoka_id: judoka.id,
      numero_carte: judoka.numero_carte,
      federation_id: federationId,
      owner_key: ownerKey,
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

/** Initie un push Mobile Money SimplyPaye (requête courte - adapté Vercel). */
app.post('/api/public/competition/:token/pay/initiate', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !settings.public_enabled) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }
    const credentials = await competitionPaymentCredentials(settings);
    if (!isSimplyPayConfigured(credentials)) {
      return res.status(503).json({ error: paymentUnavailableMessage(settings) });
    }

    const body = req.body || {};
    const phone = normalizeCongoPhone(body.telephone || body.phone || '');
    if (!phone) {
      return res.status(400).json({ error: 'Saisissez un numéro Mobile Money valide' });
    }
    const amount = Math.max(0, Number(body.amount ?? body.montant) || 0);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Montant de paiement invalide' });
    }
    const currency = String(body.currency || body.monnaie || 'CDF').toUpperCase() === 'USD'
      ? 'USD'
      : 'CDF';
    const reference = String(body.reference || `COMP-${Date.now()}`).slice(0, 64);

    const initiated = await initiateSimplyPayPayment({
      phone,
      amount,
      currency,
      reference,
      credentials,
    });

    res.json({
      orderNumber: initiated.orderNumber,
      reference: initiated.reference,
      phone: initiated.phone,
      amount: initiated.amount,
      currency: initiated.currency,
      message: initiated.message,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Initiation du paiement impossible' });
  }
});

/** Vérifie le statut d'un paiement SimplyPaye (polling côté client). */
app.get('/api/public/competition/:token/pay/status/:orderNumber', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !settings.public_enabled) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }
    const credentials = await competitionPaymentCredentials(settings);
    if (!isSimplyPayConfigured(credentials)) {
      return res.status(503).json({ error: paymentUnavailableMessage(settings) });
    }

    const status = await checkSimplyPayStatus(req.params.orderNumber, credentials);
    res.json({
      success: status.success,
      pending: status.pending,
      failed: status.failed,
      outcome: status.outcome,
      code: status.code,
      status: status.status,
      message: status.message,
      reference: status.reference,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Vérification impossible' });
  }
});

app.post('/api/public/competition/:token/register', async (req, res) => {
  try {
    const settings = await resolvePublicCompetition(req.params.token);
    if (!settings || !settings.public_enabled || !isCompetitionConfigured(settings)) {
      return res.status(404).json({ error: 'Formulaire de compétition indisponible' });
    }

    const { federationId, ownerKey } = publicCompetitionScope(settings);
    const scopeMeta = { federation_id: federationId, owner_key: ownerKey };
    const paymentCredentials = await competitionPaymentCredentials(settings);
    const body = req.body || {};
    const modeInscription = body.mode_inscription === 'equipe' ? 'equipe' : 'individuel';

    // Athlètes hors système : désactivé par défaut (paramétrable dans Paramètres de Compétition)
    if (modeInscription === 'individuel' && !settings.allow_hors_systeme) {
      const isNewAthlete = Array.isArray(body.batch) && body.batch.length
        ? body.batch.some((item) => !item?.deja_enregistre && !item?.judoka_id)
        : (!body.deja_enregistre && !body.judoka_id);
      if (isNewAthlete) {
        return res.status(403).json({
          error: 'Les inscriptions d\'athlètes hors système ne sont pas autorisées pour cette compétition',
        });
      }
    }

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
      const payCurrency = String(body.paiement?.monnaie || settings.frais_monnaie || 'CDF').toUpperCase() === 'USD'
        ? 'USD'
        : 'CDF';
      const unitFee = Math.max(0, Number(
        payCurrency === 'USD' ? settings.frais_individuel_usd : settings.frais_individuel_cdf
      ) || Number(settings.frais_individuel) || 0);
      const totalDue = unitFee * body.batch.length;

      let paymentMeta = {
        paiement_statut: 'en_attente',
        montant_paye: 0,
        mode_paiement: '',
      };

      if (totalDue > 0) {
        if (!body.paiement || typeof body.paiement !== 'object') {
          return res.status(402).json({ error: 'Le paiement est obligatoire pour finaliser l\'inscription' });
        }
        if (String(body.paiement.mode || '').trim() !== 'mobile_money') {
          return res.status(400).json({
            error: 'Pour les inscriptions payantes, utilisez Mobile Money (push PIN SimplyPaye)',
          });
        }
        const phone = normalizeCongoPhone(body.paiement.telephone || '');
        if (!phone) {
          return res.status(400).json({ error: 'Saisissez un numéro Mobile Money valide' });
        }
        if (!isSimplyPayConfigured(paymentCredentials)) {
          return res.status(503).json({ error: paymentUnavailableMessage(settings) });
        }

        const existingOrder = String(body.paiement.orderNumber || body.paiement.order_number || '').trim();
        let paid;
        if (existingOrder) {
          const status = await checkSimplyPayStatus(existingOrder, paymentCredentials);
          if (!status.success) {
            return res.status(402).json({
              error: status.message || 'Paiement non confirmé. Validez le push PIN puis réessayez.',
            });
          }
          paid = { orderNumber: existingOrder, phone };
        } else {
          paid = await collectSimplyPayPayment({
            phone,
            amount: totalDue,
            currency: payCurrency,
            reference: `COMP-IND-${settings.public_token || 'fenacoju'}-${Date.now()}`.slice(0, 64),
            credentials: paymentCredentials,
          });
        }

        paymentMeta = {
          paiement_statut: 'paye',
          montant_paye: totalDue,
          mode_paiement: `mobile_money|${phone}|${paid.orderNumber}`,
        };
      } else if (body.paiement && typeof body.paiement === 'object') {
        paymentMeta = {
          paiement_statut: 'paye',
          montant_paye: 0,
          mode_paiement: String(body.paiement.mode || 'gratuit').trim(),
        };
      }

      for (const item of body.batch) {
        const registration = await createCompetitionRegistration({
          ...item,
          mode_inscription: 'individuel',
          poids: '',
          paiement_statut: paymentMeta.paiement_statut,
          mode_paiement: paymentMeta.mode_paiement,
          montant_paye: paymentMeta.paiement_statut === 'paye' ? unitFee : 0,
          ...scopeMeta,
        });
        created.push(registration);
      }
      return res.status(201).json({ count: created.length, registrations: created });
    }

    if (modeInscription === 'equipe' && Array.isArray(body.members)) {
      const payCurrency = String(body.paiement?.monnaie || settings.frais_monnaie || 'CDF').toUpperCase() === 'USD'
        ? 'USD'
        : 'CDF';
      const defaultTeamFee = Math.max(0, Number(
        payCurrency === 'USD' ? settings.frais_equipe_usd : settings.frais_equipe_cdf
      ) || Number(settings.frais_equipe) || 0);

      let teamPaiement = null;
      if (defaultTeamFee > 0) {
        if (!body.paiement || typeof body.paiement !== 'object') {
          return res.status(402).json({ error: 'Le paiement est obligatoire pour finaliser l\'inscription équipe' });
        }
        if (String(body.paiement.mode || '').trim() !== 'mobile_money') {
          return res.status(400).json({
            error: 'Pour les inscriptions payantes, utilisez Mobile Money (push PIN SimplyPaye)',
          });
        }
        const phone = normalizeCongoPhone(body.paiement.telephone || payPhone || '');
        if (!phone) {
          return res.status(400).json({ error: 'Saisissez un numéro Mobile Money valide' });
        }
        if (!isSimplyPayConfigured(paymentCredentials)) {
          return res.status(503).json({ error: paymentUnavailableMessage(settings) });
        }

        const existingOrder = String(body.paiement.orderNumber || body.paiement.order_number || '').trim();
        let paid;
        if (existingOrder) {
          const status = await checkSimplyPayStatus(existingOrder, paymentCredentials);
          if (!status.success) {
            return res.status(402).json({
              error: status.message || 'Paiement non confirmé. Validez le push PIN puis réessayez.',
            });
          }
          paid = { orderNumber: existingOrder, phone };
        } else {
          paid = await collectSimplyPayPayment({
            phone,
            amount: defaultTeamFee,
            currency: payCurrency,
            reference: `COMP-EQ-${String(body.club || 'club').slice(0, 20)}-${Date.now()}`.slice(0, 64),
            credentials: paymentCredentials,
          });
        }

        teamPaiement = {
          statut: 'paye',
          montant: defaultTeamFee,
          mode: `mobile_money|${phone}|${paid.orderNumber}`,
          telephone: phone,
          monnaie: payCurrency,
        };
      } else if (body.paiement && typeof body.paiement === 'object') {
        teamPaiement = {
          statut: 'paye',
          montant: 0,
          mode: String(body.paiement.mode || 'gratuit').trim(),
          telephone: normalizeCongoPhone(body.paiement.telephone || '') || '',
          monnaie: payCurrency,
        };
      }

      const roster = await createCompetitionTeamRoster({
        club: body.club,
        sexe: body.sexe,
        members: body.members,
        allowedCategories: settings.categories_poids || [],
        allowExisting: Boolean(body.allow_existing),
        paiement: teamPaiement,
        ...scopeMeta,
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
        ...scopeMeta,
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
        ...scopeMeta,
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
      ...scopeMeta,
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
      ...scopeMeta,
    });
    res.status(201).json(registration);
  } catch (err) {
    const msg = err.message || 'Erreur lors de l\'inscription';
    let status = 400;
    if (/déjà inscrit/i.test(msg)) status = 409;
    else if (/paiement|mobile money|push|simply|délai|validez/i.test(msg)) status = 402;
    res.status(status).json({ error: msg });
  }
});

/** Vérification publique d'un ID athlète (page Login - Mon ID) */
app.post('/api/public/judoka-id/verify', async (req, res) => {
  try {
    const carte = String(req.body?.numero_carte || '').trim();
    if (!carte) return res.status(400).json({ error: 'Saisissez votre ID unique' });
    const judoka = await getJudokaByCardNumber(carte);
    if (!judoka) {
      return res.json({ found: false });
    }
    res.json({
      found: true,
      numero_carte: judoka.numero_carte || carte,
      nom: judoka.nom || '',
      prenom: judoka.prenom || '',
      club: judoka.club || '',
      grade: judoka.grade || '',
      statut: judoka.statut || '',
      photo: judoka.photo || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Lien de Test — examen ceinture noire (public) */
app.get('/api/public/grade-exam/:token', async (req, res) => {
  try {
    const exam = await getGradeExamByToken(req.params.token);
    if (!exam) return res.status(404).json({ error: 'Lien de test introuvable' });
    if (exam.statut === 'closed') {
      return res.status(410).json({
        error: 'Ce lien de test n\'est plus accessible : tous les athlètes ont confirmé leur examen',
        closed: true,
      });
    }
    res.json(await publicExamSummary(exam));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/public/grade-exam/:token/lookup', async (req, res) => {
  try {
    const data = await publicExamLookup(req.params.token, req.body?.numero_carte);
    res.json(data);
  } catch (err) {
    const msg = err.message || 'Accès impossible';
    const status = /plus accessible/i.test(msg) ? 410 : 400;
    res.status(status).json({ error: msg });
  }
});

app.post('/api/public/grade-exam/:token/submit', async (req, res) => {
  try {
    const submission = await publicExamSubmit(req.params.token, {
      numero_carte: req.body?.numero_carte,
      answers: req.body?.answers,
      timed_out: Boolean(req.body?.timed_out),
    });
    res.status(201).json(submission);
  } catch (err) {
    const msg = err.message || 'Envoi impossible';
    const status = /plus accessible/i.test(msg) ? 410 : 400;
    res.status(status).json({ error: msg });
  }
});

app.use('/api', authMiddleware);

app.get('/api/federation/settings', async (req, res) => {
  try {
    if (req.user.type === 'superadmin') {
      return res.status(403).json({ error: 'Non applicable au SuperAdmin' });
    }
    const settings = await getFederationSettingsForUser(req.user);
    res.json({
      ...settings,
      roles_catalog: getFederationRolesCatalog(settings),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/federation/settings', async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Réservé au compte Admin de la fédération' });
    }
    const settings = await saveFederationSettings(req.user, req.body || {});
    res.json({
      ...settings,
      roles_catalog: getFederationRolesCatalog(settings),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/federations/:id/settings', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const settings = await getFederationSettingsById(req.params.id);
    res.json({
      ...settings,
      roles_catalog: getFederationRolesCatalog(settings),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/federations/:id/settings', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const settings = await saveFederationSettingsById(req.params.id, req.body || {});
    res.json({
      ...settings,
      roles_catalog: getFederationRolesCatalog(settings),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    let settings = await getCompetitionSettings(fedId, ownerKey);
    const perms = getPermissions(req.user);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);

    // Entente / Ligue : le flag durable sur le compte prime
    const orgAccess = (req.user.type === 'entente' || req.user.type === 'ligue')
      && Boolean(req.user.competition_access);
    if (orgAccess && !settings.access_enabled) {
      settings = await updateCompetitionSettings(
        { access_enabled: true, federation_id: fedId, owner_key: ownerKey },
        fedId,
        ownerKey
      );
    }

    const accessEnabled = (req.user.type === 'entente' || req.user.type === 'ligue')
      ? (orgAccess || Boolean(settings.access_enabled))
      : Boolean(settings.access_enabled);

    const accessOk = canToggle
      || ((isDirecteurCompetition(req.user)
        || req.user.type === 'entente'
        || req.user.type === 'ligue') && accessEnabled);

    if (!canToggle && !perms.canManageCompetition && !perms.canToggleEntenteCompetition) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    let competitionClubs = settings.competition_clubs || [];
    let scopedClubs = [];
    if (req.user.type === 'entente' || req.user.type === 'ligue') {
      const users = await getAllUsers();
      scopedClubs = getScopedClubNames(users, req.user)
        .map((nom) => String(nom || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'fr'));
      const allowed = new Set(scopedClubs.map((c) => c.toLowerCase()));
      competitionClubs = competitionClubs.filter((c) => allowed.has(String(c.nom || '').trim().toLowerCase()));
    }

    res.json({
      ...settings,
      access_enabled: accessEnabled,
      competition_clubs: competitionClubs,
      scoped_clubs: scopedClubs,
      configured: isCompetitionConfigured(settings),
      access_ok: accessOk,
      can_toggle_access: canToggle,
      can_edit: accessOk && (canToggle || canManage),
      scope_entente: req.user.type === 'entente',
      scope_ligue: req.user.type === 'ligue',
      owner_key: ownerKey,
      scope_label: req.user.type === 'ligue'
        ? `LIGUE - ${req.user.nom_organisation || req.user.nom || 'Ligue'}`
        : req.user.type === 'entente'
          ? `ENTENTE - ${req.user.nom_organisation || req.user.nom || 'Entente'}`
          : 'FENACOJU · Directeur Compétition',
      federation_id: fedId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Ligue : liste des ententes filles + état d'activation compétition */
app.get('/api/competition/ententes-access', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.canToggleEntenteCompetition && !canToggleCompetitionAccess(req.user)) {
      return res.status(403).json({ error: 'Réservé à la Ligue (ou Admin / Coordon)' });
    }
    const fedId = getUserFederationId(req.user);
    const users = await getAllUsers();
    const ententes = (req.user.type === 'ligue'
      ? getDescendantUsers(users, req.user.id)
      : users
    ).filter((u) => u.type === 'entente' && getAccountStatut(u) === 'actif');

    const items = [];
    for (const entente of ententes) {
      const ownerKey = ententeOwnerKey(entente.id);
      const settings = await getCompetitionSettings(fedId, ownerKey);
      // Source de vérité durable : flag sur le compte Entente
      const accessEnabled = Boolean(entente.competition_access) || Boolean(settings.access_enabled);
      if (Boolean(entente.competition_access) && !settings.access_enabled) {
        await updateCompetitionSettings(
          { access_enabled: true, federation_id: fedId, owner_key: ownerKey },
          fedId,
          ownerKey
        );
      }
      items.push({
        id: entente.id,
        nom: entente.nom_organisation || entente.nom || 'Entente',
        org_code: entente.org_code || '',
        access_enabled: accessEnabled,
        configured: isCompetitionConfigured(settings),
      });
    }
    res.json({ ententes: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/competition/ententes-access', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.canToggleEntenteCompetition && !canToggleCompetitionAccess(req.user)) {
      return res.status(403).json({ error: 'Réservé à la Ligue (ou Admin / Coordon)' });
    }
    const enabled = Boolean(req.body?.access_enabled);
    const users = await getAllUsers();
    const ligueDescendants = req.user.type === 'ligue'
      ? getDescendantUsers(users, req.user.id)
      : null;

    const eligibleEntentes = (req.user.type === 'ligue'
      ? ligueDescendants
      : users
    ).filter((u) => u.type === 'entente' && getAccountStatut(u) === 'actif');

    let targetIds = [];
    if (Array.isArray(req.body?.entente_ids) && req.body.entente_ids.length) {
      targetIds = req.body.entente_ids.map((id) => String(id || '').trim()).filter(Boolean);
    } else if (req.body?.all === true) {
      targetIds = eligibleEntentes.map((u) => u.id);
    } else if (req.body?.entente_id) {
      targetIds = [String(req.body.entente_id).trim()];
    }
    if (!targetIds.length) {
      return res.status(400).json({ error: 'entente_id, entente_ids ou all requis' });
    }

    const eligibleSet = new Set(eligibleEntentes.map((u) => u.id));
    const results = [];

    for (const ententeId of targetIds) {
      if (!eligibleSet.has(ententeId)) {
        results.push({ entente_id: ententeId, error: 'Entente hors périmètre ou inactive' });
        continue;
      }
      const entente = users.find((u) => u.id === ententeId);
      const fedId = getUserFederationId(req.user) || getUserFederationId(entente);
      const ownerKey = ententeOwnerKey(ententeId);

      // Flag durable indépendant par Entente (plusieurs peuvent être actives en parallèle)
      await setUserCompetitionAccess(ententeId, enabled);
      const settings = enabled
        ? await updateCompetitionSettings({ access_enabled: true, federation_id: fedId, owner_key: ownerKey }, fedId, ownerKey)
        : await resetCompetitionCompletely({ access_enabled: false, federationId: fedId, ownerKey });

      results.push({
        entente_id: ententeId,
        access_enabled: enabled,
        configured: isCompetitionConfigured(settings),
        reset: !enabled,
      });
    }

    // Compat mono-toggle
    if (results.length === 1 && !results[0].error) {
      return res.json(results[0]);
    }
    res.json({
      access_enabled: enabled,
      count: results.filter((r) => !r.error).length,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Admin / Coordon : activer la compétition d'une Ligue */
app.put('/api/competition/ligues-access', async (req, res) => {
  try {
    if (!canToggleCompetitionAccess(req.user) && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Réservé à l\'Admin / Coordon de la fédération' });
    }
    const ligueId = String(req.body?.ligue_id || '').trim();
    if (!ligueId) return res.status(400).json({ error: 'ligue_id requis' });
    const enabled = Boolean(req.body?.access_enabled);

    const users = await getAllUsers();
    const ligue = users.find((u) => u.id === ligueId && u.type === 'ligue');
    if (!ligue) return res.status(404).json({ error: 'Ligue introuvable' });
    if (getAccountStatut(ligue) !== 'actif') {
      return res.status(400).json({ error: 'Ligue inactive' });
    }

    const callerFed = getUserFederationId(req.user);
    const ligueFed = getUserFederationId(ligue);
    if (callerFed && ligueFed && String(callerFed) !== String(ligueFed) && req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Ligue hors périmètre de votre fédération' });
    }

    const fedId = callerFed || ligueFed;
    const ownerKey = ligueOwnerKey(ligueId);
    await setUserCompetitionAccess(ligueId, enabled);
    const settings = enabled
      ? await updateCompetitionSettings({ access_enabled: true, federation_id: fedId, owner_key: ownerKey }, fedId, ownerKey)
      : await resetCompetitionCompletely({ access_enabled: false, federationId: fedId, ownerKey });

    res.json({
      ligue_id: ligueId,
      access_enabled: enabled,
      configured: isCompetitionConfigured(settings),
      reset: !enabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** SuperAdmin : stats globales + fédérations */
app.get('/api/federations/stats', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    res.json(await getSuperAdminStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/federations', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const federations = await listFederations();
    const users = await getAllUsers();
    const admins = users.filter((u) => u.type === 'admin');
    res.json({
      federations: federations.map((f) => ({
        ...f,
        admin: admins.find((a) => a.id === f.admin_user_id || a.federation_id === f.id) || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/federations', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const result = await createFederationWithAdmin(req.body || {}, req.user);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/federations/:id', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const updated = await updateFederation(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** SuperAdmin : comptes compétition + credentials SimplyPaye */
app.get('/api/federations/:id/payment-accounts', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const fed = await getFederationById(req.params.id);
    if (!fed) return res.status(404).json({ error: 'Fédération introuvable' });
    const accounts = await listFederationPaymentAccounts(req.params.id);
    res.json({ federation: { id: fed.id, nom: fed.nom }, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/federations/:id/payment-accounts/:userId', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const fed = await getFederationById(req.params.id);
    if (!fed) return res.status(404).json({ error: 'Fédération introuvable' });
    const target = await getUserById(req.params.userId);
    if (!target || target.federation_id !== fed.id) {
      return res.status(404).json({ error: 'Compte introuvable dans cette fédération' });
    }
    const updated = await setUserPaymentCredentials(
      req.params.userId,
      {
        merchantCode: req.body?.payment_merchant_code ?? req.body?.merchant_code,
        apiKey: req.body?.payment_api_key ?? req.body?.api_key,
      },
      req.user
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/federations/:id/payment-accounts/:userId', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const fed = await getFederationById(req.params.id);
    if (!fed) return res.status(404).json({ error: 'Fédération introuvable' });
    const target = await getUserById(req.params.userId);
    if (!target || target.federation_id !== fed.id) {
      return res.status(404).json({ error: 'Compte introuvable dans cette fédération' });
    }
    const updated = await clearUserPaymentCredentials(req.params.userId, req.user);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/federations/:id/logo', upload.single('logo'), async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Choisissez un fichier image (JPG, PNG ou WebP)' });
    }
    const existing = await getFederationById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Fédération introuvable' });
    const logoUrl = await saveUploadedFile(req.file, 'federation-logos');
    if (existing.logo_url && existing.logo_url !== logoUrl) {
      try { await deleteStoredFile(existing.logo_url); } catch { /* ignore */ }
    }
    const updated = await updateFederation(req.params.id, { logo_url: logoUrl });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Impossible de charger le logo' });
  }
});

app.delete('/api/federations/:id/logo', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const existing = await getFederationById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Fédération introuvable' });
    if (existing.logo_url) {
      try { await deleteStoredFile(existing.logo_url); } catch { /* ignore */ }
    }
    const updated = await updateFederation(req.params.id, { logo_url: '' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Impossible de retirer le logo' });
  }
});

app.post('/api/federations/:id/reset-admin-password', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const result = await resetFederationAdminPassword(req.params.id, req.body?.password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/federations/:id/toggle-active', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const existing = await getFederationById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Fédération introuvable' });
    const nextActif = req.body?.actif !== undefined
      ? Boolean(req.body.actif)
      : !isFederationEnabled(existing);
    const updated = await setFederationActive(req.params.id, nextActif);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/federations/:id', async (req, res) => {
  try {
    if (req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Réservé au SuperAdmin' });
    }
    const result = await deleteFederation(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/competition/access', async (req, res) => {
  try {
    if (!canToggleCompetitionAccess(req.user)) {
      return res.status(403).json({ error: 'Seul Admin ou Coordon peut activer la compétition du Directeur' });
    }
    const enabled = Boolean(req.body?.access_enabled);
    const fedId = getUserFederationId(req.user);
    const ownerKey = 'federation';

    // Off : efface toute la compétition Directeur (params, inscrits, ancien lien)
    // On : réactive l'accès pour une nouvelle compétition vide
    const settings = enabled
      ? await updateCompetitionSettings({ access_enabled: true, federation_id: fedId, owner_key: ownerKey }, fedId, ownerKey)
      : await resetCompetitionCompletely({ access_enabled: false, federationId: fedId, ownerKey });

    res.json({
      access_enabled: settings.access_enabled,
      configured: isCompetitionConfigured(settings),
      reset: !enabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function orgCompetitionUnlocked(user, settings) {
  if (user?.type !== 'entente' && user?.type !== 'ligue') {
    return Boolean(settings?.access_enabled);
  }
  return Boolean(user.competition_access) || Boolean(settings?.access_enabled);
}

app.put('/api/competition', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    let current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);

    if ((req.user.type === 'entente' || req.user.type === 'ligue')
      && req.user.competition_access && !current.access_enabled) {
      current = await updateCompetitionSettings(
        { access_enabled: true, federation_id: fedId, owner_key: ownerKey },
        fedId,
        ownerKey
      );
    }

    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({
        error: canManage
          ? 'La Compétition n\'est pas activée'
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
    if (body.categories_age !== undefined) {
      patch.categories_age = parseCategoriesAge(body.categories_age);
    }
    if (body.allow_hors_systeme !== undefined) {
      patch.allow_hors_systeme = Boolean(body.allow_hors_systeme);
    }
    if (body.competition_clubs !== undefined) {
      let clubs = parseCompetitionClubs(body.competition_clubs);
      if (req.user.type === 'entente' || req.user.type === 'ligue') {
        const users = await getAllUsers();
        const allowed = new Set(getScopedClubNames(users, req.user).map((c) => c.toLowerCase()));
        clubs = clubs.filter((c) => allowed.has(String(c.nom || '').trim().toLowerCase()));
      }
      patch.competition_clubs = clubs;
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
    if (body.logo_url !== undefined) {
      patch.logo_url = String(body.logo_url || '').trim();
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

    const settings = await updateCompetitionSettings({ ...patch, federation_id: fedId, owner_key: ownerKey }, fedId, ownerKey);
    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/competition/logo', upload.single('logo'), async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Choisissez un fichier image (JPG, PNG ou WebP)' });
    }
    const logoUrl = await saveUploadedFile(req.file, 'competition-logos');
    if (current.logo_url && current.logo_url !== logoUrl) {
      try { await deleteStoredFile(current.logo_url); } catch { /* ignore */ }
    }
    const settings = await updateCompetitionSettings({ logo_url: logoUrl, federation_id: fedId, owner_key: ownerKey }, fedId, ownerKey);
    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
      logo_url: settings.logo_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Impossible de charger le logo' });
  }
});

app.delete('/api/competition/logo', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (current.logo_url) {
      try { await deleteStoredFile(current.logo_url); } catch { /* ignore */ }
    }
    const settings = await updateCompetitionSettings({ logo_url: '', owner_key: ownerKey }, fedId, ownerKey);
    res.json({
      ...settings,
      configured: isCompetitionConfigured(settings),
      logo_url: '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Impossible de retirer le logo' });
  }
});

app.delete('/api/competition/public-link', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (current.public_enabled) {
      return res.status(400).json({
        error: 'Désactivez d\'abord le lien (Off) avant de le supprimer définitivement',
      });
    }
    const settings = await deleteCompetitionPublicLink(fedId, ownerKey);
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
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    let list = await getCompetitionRegistrations(fedId, ownerKey);
    if (req.user.type === 'entente' || req.user.type === 'ligue') {
      const users = await getAllUsers();
      const allowed = new Set(getScopedClubNames(users, req.user).map((c) => c.toLowerCase()));
      list = list.filter((r) => allowed.has(String(r.club || '').trim().toLowerCase()));
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/competition/registrations/charge-team', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const body = req.body || {};
    if (req.user.type === 'entente' || req.user.type === 'ligue') {
      const users = await getAllUsers();
      const allowed = new Set(getScopedClubNames(users, req.user).map((c) => c.toLowerCase()));
      const club = String(body.club || '').trim().toLowerCase();
      if (club && !allowed.has(club)) {
        return res.status(403).json({
          error: req.user.type === 'ligue'
            ? 'Club hors du périmètre de votre ligue'
            : 'Club hors du périmètre de votre entente',
        });
      }
    }
    const result = await chargeTeamFromIndividuel({
      club: body.club,
      members: Array.isArray(body.members) ? body.members : [],
      federation_id: fedId,
      owner_key: ownerKey,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/competition/registrations', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const body = req.body || {};

    let allowedClubSet = null;
    if (req.user.type === 'entente' || req.user.type === 'ligue') {
      const users = await getAllUsers();
      allowedClubSet = new Set(getScopedClubNames(users, req.user).map((c) => c.toLowerCase()));
    }

    const toPayload = (item = {}) => {
      const club = String(item.club || '').trim();
      if (allowedClubSet && club && !allowedClubSet.has(club.toLowerCase())) {
        throw new Error(
          req.user.type === 'ligue'
            ? `Club « ${club} » hors du périmètre de votre ligue`
            : `Club « ${club} » hors du périmètre de votre entente`
        );
      }
      return {
        nom: item.nom,
        prenom: item.prenom,
        date_naissance: item.date_naissance || '',
        sexe: item.sexe === 'F' ? 'F' : 'M',
        club,
        grade: item.grade || '',
        categorie: item.categorie || '',
        poids: item.poids || '',
        telephone: item.telephone || '',
        email: item.email || '',
        judoka_id: item.judoka_id || null,
        numero_carte: item.numero_carte || '',
        deja_enregistre: Boolean(item.deja_enregistre),
        mode_inscription: 'individuel',
        paiement_statut: item.paiement_statut || 'en_attente',
        montant_paye: Math.max(0, Number(item.montant_paye) || 0),
        mode_paiement: String(item.mode_paiement || '').trim(),
        federation_id: fedId,
        owner_key: ownerKey,
      };
    };

    if (Array.isArray(body.batch) && body.batch.length) {
      const created = [];
      for (const item of body.batch) {
        created.push(await createCompetitionRegistration(toPayload(item)));
      }
      return res.status(201).json({ count: created.length, registrations: created });
    }

    const registration = await createCompetitionRegistration(toPayload(body));
    res.status(201).json(registration);
  } catch (err) {
    const status = /déjà inscrit|obligatoire|accepte uniquement|âge|naissance/i.test(err.message || '')
      ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

app.delete('/api/competition/registrations/:id', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
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
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const updated = await updateCompetitionRegistration(req.params.id, {
      nom: req.body?.nom,
      prenom: req.body?.prenom,
      poids: req.body?.poids,
      club: req.body?.club,
      categorie: req.body?.categorie,
      sexe: req.body?.sexe,
      role_equipe: req.body?.role_equipe,
      date_naissance: req.body?.date_naissance,
    });
    res.json(updated);
  } catch (err) {
    const status = /introuvable|obligatoire|accepte uniquement|âge/i.test(err.message || '') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** Génère licences (cartes) depuis inscriptions compétition + enregistre clubs si besoin. */
app.post('/api/competition/licences', async (req, res) => {
  try {
    const fedId = getUserFederationId(req.user);
    const ownerKey = competitionOwnerKey(req.user);
    const current = await getCompetitionSettings(fedId, ownerKey);
    const canToggle = canToggleCompetitionAccess(req.user);
    const canManage = canManageCompetition(req.user);
    if (!canToggle && !(canManage && orgCompetitionUnlocked(req.user, current))) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const ids = Array.isArray(req.body?.registration_ids)
      ? req.body.registration_ids.map((id) => String(id)).filter(Boolean)
      : [];
    if (!ids.length) {
      return res.status(400).json({ error: 'Sélectionnez au moins un judoka' });
    }

    const allRegs = await getCompetitionRegistrations(fedId, ownerKey);
    const selected = allRegs.filter((r) => ids.includes(String(r.id)));
    if (!selected.length) {
      return res.status(400).json({ error: 'Aucune inscription correspondante' });
    }

    const clubsCreated = [];
    const clubsReused = [];
    const judokas = [];
    const skipped = [];

    for (const reg of selected) {
      const clubName = String(reg.club || '').trim();
      if (!clubName) {
        skipped.push({ id: reg.id, reason: 'Club manquant' });
        continue;
      }
      if (!reg.nom?.trim() || !reg.prenom?.trim()) {
        skipped.push({ id: reg.id, reason: 'Nom/prénom manquants' });
        continue;
      }
      if (!reg.date_naissance) {
        skipped.push({ id: reg.id, reason: 'Date de naissance manquante' });
        continue;
      }

      const before = await isClubRegistered(clubName);
      await ensureRegisteredClub(clubName, req.user);
      if (before) {
        if (!clubsReused.includes(clubName)) clubsReused.push(clubName);
      } else if (!clubsCreated.includes(clubName)) {
        clubsCreated.push(clubName);
      }

      let judoka = null;
      if (reg.judoka_id) {
        judoka = await getJudokaById(reg.judoka_id);
      }
      if (!judoka) {
        judoka = await findJudokaByIdentity({
          nom: reg.nom,
          prenom: reg.prenom,
          date_naissance: reg.date_naissance,
          club: clubName,
        });
      }

      if (!judoka) {
        const categorie = categoryFromBirthDate(reg.date_naissance)
          || String(reg.categorie || '').trim()
          || '';
        const id = uuidv4();
        const numero_carte = await generateCardNumber();
        await createJudoka({
          id,
          numero_carte,
          nom: String(reg.nom).trim(),
          prenom: String(reg.prenom).trim(),
          date_naissance: String(reg.date_naissance).slice(0, 10),
          sexe: reg.sexe === 'F' ? 'F' : 'M',
          club: clubName,
          grade: String(reg.grade || '').trim() || 'Blanche',
          categorie,
          numero_licence: '',
          telephone: String(reg.telephone || '').trim(),
          email: String(reg.email || '').trim(),
          taille: '',
          poids: String(reg.poids || '').trim(),
          photo: '',
          entraineur_id: '',
          entraineur_nom: '',
          date_inscription: new Date().toISOString().split('T')[0],
          statut: 'actif',
        });
        judoka = await getJudokaById(id);
      }

      if (judoka) {
        judokas.push(judoka);
        if (!reg.judoka_id || reg.numero_carte !== judoka.numero_carte) {
          try {
            await updateCompetitionRegistration(reg.id, {
              judoka_id: judoka.id,
              numero_carte: judoka.numero_carte,
              deja_enregistre: true,
            });
          } catch {
            // colonnes optionnelles
          }
        }
      }
    }

    res.json({
      count: judokas.length,
      judokas,
      clubs_created: clubsCreated,
      clubs_reused: clubsReused,
      skipped,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Génération des licences impossible' });
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
    if (!canValidateAccounts(req.user) && req.user.type !== 'admin') {
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
    if (!canValidateAccounts(req.user) && req.user.type !== 'admin') {
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
    const users = await getAllUsers();
    if (!canMessageUser(req.user, other, users) && !canMessageUser(other, req.user, users)) {
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

const messageAttachmentUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ];
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
    const ok = allowedMime.includes(file.mimetype) || allowedExt.includes(ext);
    cb(ok ? null : new Error('Formats autorisés : DOC, PDF, JPG, PNG'), ok);
  },
});

app.post('/api/messages/with-attachment', (req, res) => {
  messageAttachmentUpload.single('attachment')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (maximum 20 Mo)'
        : (err.message || 'Fichier non accepté');
      return res.status(400).json({ error: msg });
    }
    try {
      const toId = req.body?.to_id;
      const subject = req.body?.subject || '';
      const body = req.body?.body || '';
      let attachment = null;
      if (req.file) {
        const url = await saveUploadedFile(req.file, 'message-attachments');
        attachment = {
          url,
          name: req.file.originalname || 'fichier',
          type: req.file.mimetype || '',
        };
      }
      const message = await sendMessage(req.user, toId, subject, body, attachment);
      res.status(201).json(message);
    } catch (e) {
      res.status(403).json({ error: e.message });
    }
  });
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    const result = await deleteMessageForUser(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    const status = /introuvable/i.test(err.message || '') ? 404 : 403;
    res.status(status).json({ error: err.message });
  }
});

app.put('/api/account', async (req, res) => {
  try {
    const updated = await updateOwnProfile(req.user.id, req.body || {});
    res.json({ ...updated, permissions: getPermissions(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/account/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const updated = await changeOwnPassword(req.user.id, currentPassword, newPassword);
    res.json({ ...updated, permissions: getPermissions(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/account/photo', handlePhotoUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo requise' });
    const current = await getUserById(req.user.id);
    const photoUrl = await saveUploadedFile(req.file, 'avatars');
    if (current?.photo) {
      try { await deleteStoredFile(current.photo); } catch { /* ignore */ }
    }
    const updated = await updateOwnPhoto(req.user.id, photoUrl);
    res.json({ ...updated, permissions: getPermissions(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/account/photo', async (req, res) => {
  try {
    const current = await getUserById(req.user.id);
    if (current?.photo) {
      try { await deleteStoredFile(current.photo); } catch { /* ignore */ }
    }
    const updated = await updateOwnPhoto(req.user.id, '');
    res.json({ ...updated, permissions: getPermissions(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
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

async function withOrgCodes(users) {
  const { users: coded, updates } = ensureOrgCodes(users || []);
  if (updates.length && isSupabaseEnabled()) {
    await Promise.all(updates.map(async (upd) => {
      try {
        await getSupabase().from('users').update({ org_code: upd.org_code }).eq('id', upd.id);
      } catch {
        // migration org_code non appliquée
      }
    }));
  }
  return coded;
}

app.get('/api/judokas', async (req, res) => {
  try {
    const search = req.query.search || '';
    const users = await withOrgCodes(await getAllUsers());
    let judokas = await getAllJudokas(search);
    judokas = filterJudokas(judokas, req.user, users);
    res.json(enrichJudokasWithHierarchy(judokas, users));
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
    const users = await withOrgCodes(await getAllUsers());
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json(enrichJudokasWithHierarchy([judoka], users)[0]);
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

    const categorie = categoryFromBirthDate(body.date_naissance) || body.categorie?.trim() || '';
    const ageError = validateCategoryAge(categorie, body.date_naissance);
    if (ageError) {
      return res.status(400).json({ error: ageError });
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
      categorie,
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
      federation_id: getUserFederationId(req.user),
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
    const gradeOnly = (perms.manageGrades || perms.manageClubGrades)
      && !perms.createJudokas
      && !perms.manageUsers
      && req.user.type !== 'admin';
    const isGradePassation = String(body.passation_grade || '') === '1' || gradeOnly;
    if (gradeOnly || (isGradePassation && (perms.manageGrades || perms.manageClubGrades || perms.createJudokas))) {
      const reussi = String(body.passation_reussie ?? '1') !== '0';
      const nextGrade = String(body.grade || '').trim() || String(existing.grade || '').trim();
      if (reussi) {
        if (!nextGrade) {
          return res.status(400).json({ error: 'Le nouveau grade est requis' });
        }
        if (nextGrade === existing.grade) {
          return res.status(400).json({ error: 'Choisissez un grade différent du grade actuel' });
        }
      }
      const toBlack = reussi && isBlackBeltGrade(nextGrade);
      const fromBlack = isBlackBeltGrade(existing.grade);
      if (reussi && (toBlack || fromBlack) && !perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
        return res.status(403).json({
          error: 'La passation vers/depuis la ceinture noire est réservée au Responsable Grade',
        });
      }
      if (reussi && !toBlack && !isClubAllowedGrade(nextGrade) && req.user.type === 'club') {
        return res.status(400).json({ error: 'Grade non autorisé pour une passation Club' });
      }
      if (reussi && req.user.type === 'club' && toBlack) {
        return res.status(403).json({ error: 'Les Clubs ne peuvent pas attribuer la ceinture noire' });
      }
      if (toBlack && (perms.manageBlackBelts || perms.manageGrades) && !String(body.instructeur_nom || '').trim()) {
        return res.status(400).json({ error: 'Désignez un instructeur pour l\'examen ceinture noire' });
      }

      if (reussi) {
        await updateJudoka(req.params.id, { grade: nextGrade });
      }
      const datePassation = String(body.date_passation || body.passation_date || '').trim();
      await addGradeHistory({
        judoka_id: existing.id,
        grade_from: existing.grade || '',
        grade_to: reussi ? nextGrade : (existing.grade || nextGrade || ''),
        reussi,
        date_passation: datePassation || null,
        instructeur_id: body.instructeur_id || null,
        instructeur_nom: String(body.instructeur_nom || '').trim(),
        points: body.points,
        note: String(body.note || '').trim(),
        changed_by: req.user.id,
        changed_by_name: actorLabel(req.user),
      });
      return res.json(await getJudokaById(req.params.id));
    }
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.date_naissance || !body.club?.trim() || !body.grade) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const categorie = categoryFromBirthDate(body.date_naissance) || body.categorie?.trim() || '';
    const ageError = validateCategoryAge(categorie, body.date_naissance);
    if (ageError) {
      return res.status(400).json({ error: ageError });
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
      categorie,
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

/** Fiche de suivi + historique mouvements */
app.get('/api/judokas/:id/fiche', async (req, res) => {
  try {
    const users = await getAllUsers();
    const judoka = await getJudokaById(req.params.id);
    if (!judoka) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const [events, grades, transfers] = await Promise.all([
      getJudokaEvents(judoka.id),
      getGradeHistory({ judokaId: judoka.id }),
      getTransfers({ judokaId: judoka.id }),
    ]);
    res.json({ judoka, events, grades, transfers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Historique passations ceintures (Responsable Grade) */
app.get('/api/grades/history', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.viewGradeHistory && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const blackOnly = String(req.query.black || '') === '1';
    const history = await getGradeHistory({ blackOnly });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Demandes de passation ceinture noire */
app.get('/api/grades/requests', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    const canView = perms.viewGradeHistory || perms.manageBlackBelts || perms.manageGrades
      || perms.manageClubGrades || req.user.type === 'admin' || perms.requestTransfers;
    if (!canView && req.user.type !== 'club') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const statut = req.query.statut || null;
    const fedId = req.user.type === 'admin' || req.user.type === 'superadmin'
      ? null
      : (req.user.federation_id || null);
    let list = await getGradeRequests({
      statut: statut || undefined,
      federationId: fedId || undefined,
    });
    if (req.user.type === 'club') {
      const club = String(req.user.nom_club || '').trim().toLowerCase();
      list = list.filter((r) => String(r.judoka_club || '').trim().toLowerCase() === club
        || String(r.requested_by || '') === String(req.user.id));
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grades/requests/pending-count', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.viewGradeHistory && !perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.json({ count: 0 });
    }
    const fedId = req.user.type === 'admin' || req.user.type === 'superadmin'
      ? null
      : (req.user.federation_id || null);
    const list = await getGradeRequests({
      statut: 'pending',
      federationId: fedId || undefined,
    });
    res.json({ count: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grades/requests', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageClubGrades && !perms.createJudokas && req.user.type !== 'admin' && !perms.manageGrades) {
      return res.status(403).json({ error: 'Demande non autorisée' });
    }
    const users = await getAllUsers();
    const judoka = await getJudokaById(req.body?.judoka_id);
    if (!judoka) return res.status(404).json({ error: 'Athlète introuvable' });
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (!isMarronOrBlackGrade(judoka.grade)) {
      return res.status(400).json({ error: 'Réservé aux athlètes Marron ou ceinture noire' });
    }
    const requestedTo = String(req.body?.grade_to || '').trim() || nextBlackBeltGrade(judoka.grade);
    if (!requestedTo) {
      return res.status(400).json({ error: 'Aucune ceinture supérieure disponible' });
    }
    const request = await createGradeRequest({
      judoka_id: judoka.id,
      grade_from: judoka.grade,
      grade_to: requestedTo,
      date_passation: req.body?.date_passation || null,
      note: req.body?.note || '',
      requested_by: req.user.id,
      requested_by_name: actorLabel(req.user),
      judoka_nom: judoka.nom || '',
      judoka_prenom: judoka.prenom || '',
      judoka_club: judoka.club || '',
      judoka_numero_carte: judoka.numero_carte || '',
      federation_id: judoka.federation_id || req.user.federation_id || null,
    });
    res.status(201).json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/grades/requests/:id/approve', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Validation réservée au Responsable Grade' });
    }
    const updated = await approveGradeRequest(req.params.id, req.user, {
      instructeur_nom: req.body?.instructeur_nom || '',
      points: req.body?.points,
      note: req.body?.note || '',
      applyGradeChange: async (request) => {
        await updateJudoka(request.judoka_id, { grade: request.grade_to });
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/grades/requests/:id/reject', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Rejet réservé au Responsable Grade' });
    }
    const updated = await rejectGradeRequest(req.params.id, req.user, req.body?.motif || '');
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Examens ceinture noire (Lien de Test) */
app.get('/api/grades/exams', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.viewGradeHistory && !perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const fedId = req.user.type === 'admin' || req.user.type === 'superadmin'
      ? null
      : (req.user.federation_id || null);
    const list = await listGradeExams({ federationId: fedId || undefined });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grades/exam-submissions', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.viewGradeHistory && !perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const fedId = req.user.type === 'admin' || req.user.type === 'superadmin'
      ? null
      : (req.user.federation_id || null);
    const list = await listGradeExamSubmissionsWithExam({ federationId: fedId || undefined });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grades/exams', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Réservé au Responsable Grade' });
    }
    const exam = await createGradeExam({
      instructeur_nom: req.body?.instructeur_nom,
      questions: req.body?.questions,
      athletes: req.body?.athletes,
      request_ids: req.body?.request_ids,
      chronometre_enabled: req.body?.chronometre_enabled,
      chronometre_minutes: req.body?.chronometre_minutes,
      federation_id: req.user.federation_id || null,
      created_by: req.user.id,
      created_by_name: actorLabel(req.user),
    });
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/grades/history/reset', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    // Réservé au Responsable Grade (pas l'Admin fédération)
    if (req.user.type === 'admin' || req.user.type === 'superadmin') {
      return res.status(403).json({ error: 'Réinitialisation réservée au Responsable Grade' });
    }
    if (!perms.manageBlackBelts && !perms.manageGrades) {
      return res.status(403).json({ error: 'Réinitialisation réservée au Responsable Grade' });
    }
    const fedId = req.user.federation_id || null;
    const examsReset = await resetGradePassationHistory({ federationId: fedId || undefined });
    const historyReset = await clearBlackBeltGradeHistory();
    const archive = await archiveGradePassationReset({
      federation_id: fedId,
      reset_by: req.user.id,
      reset_by_name: actorLabel(req.user),
      exams: examsReset.exams || [],
      submissions: examsReset.submissions || [],
      grade_history: historyReset.items || [],
    });
    res.json({
      ok: true,
      exams_removed: examsReset.exams_removed || 0,
      history_removed: historyReset.removed || 0,
      archive_id: archive?.id || null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Archives des historiques réinitialisés (Admin fédération) */
app.get('/api/grades/history/archives', async (req, res) => {
  try {
    if (req.user.type !== 'admin' && req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Accès réservé à l\'Admin de la fédération' });
    }
    const fedId = req.user.type === 'superadmin'
      ? (req.query.federation_id || null)
      : (req.user.federation_id || null);
    const list = await listGradePassationArchives({ federationId: fedId || undefined });
    res.json(list.map((a) => ({
      id: a.id,
      federation_id: a.federation_id,
      reset_by: a.reset_by,
      reset_by_name: a.reset_by_name,
      created_at: a.created_at,
      exams_count: a.exams_count ?? (a.exams || []).length,
      submissions_count: a.submissions_count ?? (a.submissions || []).length,
      history_count: a.history_count ?? (a.grade_history || []).length,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grades/history/archives/:id', async (req, res) => {
  try {
    if (req.user.type !== 'admin' && req.user.type !== 'superadmin') {
      return res.status(403).json({ error: 'Accès réservé à l\'Admin de la fédération' });
    }
    const archive = await getGradePassationArchiveById(req.params.id);
    if (!archive) return res.status(404).json({ error: 'Archive introuvable' });
    if (
      req.user.type === 'admin'
      && archive.federation_id
      && req.user.federation_id
      && String(archive.federation_id) !== String(req.user.federation_id)
    ) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json(archive);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grades/exams/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.viewGradeHistory && !perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const exam = await getGradeExamById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });
    const submissions = await getExamSubmissions(exam.id);
    res.json({ exam, submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grades/exams/:id/submissions/:submissionId/grade', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.manageBlackBelts && !perms.manageGrades && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Notation réservée au Responsable Grade' });
    }
    const updated = await gradeExamSubmission(
      req.params.id,
      req.params.submissionId,
      {
        scores: req.body?.scores,
        reussi: req.body?.reussi,
        note: req.body?.note || '',
      },
      req.user,
      {
        applyGradeChange: async (request) => {
          await updateJudoka(request.judoka_id, { grade: request.grade_to });
        },
      }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function filterTransfersForUser(list, user, users, perms) {
  let scoped = list;
  if (user.type === 'club') {
    const club = String(user.nom_club || '').trim().toLowerCase();
    scoped = scoped.filter((t) =>
      String(t.club_from || '').toLowerCase() === club
      || String(t.club_to || '').toLowerCase() === club
    );
  } else if (user.type === 'ligue' || user.type === 'entente') {
    const clubs = new Set(getScopedClubNames(users, user).map((c) => c.toLowerCase()));
    scoped = scoped.filter((t) =>
      clubs.has(String(t.club_from || '').toLowerCase())
      || clubs.has(String(t.club_to || '').toLowerCase())
    );
  } else if (user.type === 'federation' || user.type === 'admin') {
    const fedId = user.federation_id || null;
    if (fedId && user.type === 'federation') {
      const clubs = new Set(
        users
          .filter((u) => u.type === 'club' && u.federation_id === fedId && u.nom_club)
          .map((u) => String(u.nom_club).trim().toLowerCase())
      );
      scoped = scoped.filter((t) =>
        clubs.has(String(t.club_from || '').toLowerCase())
        || clubs.has(String(t.club_to || '').toLowerCase())
      );
    }
  } else if (!perms.validateTransfers && !perms.manageAll && user.type !== 'admin') {
    if (!perms.requestTransfers) return null;
  }
  return scoped;
}

function pendingTransferStatusesForUser(perms) {
  const statuses = [];
  if (perms.validateTransfersEntente) statuses.push('pending_entente');
  if (perms.validateTransfersLigue) statuses.push('pending_ligue');
  if (perms.validateTransfers) statuses.push('pending_federation');
  return statuses;
}

/** Nombre de transferts en attente d'action pour le compte connecté */
app.get('/api/transfers/pending-count', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    const statuses = pendingTransferStatusesForUser(perms);
    if (statuses.length === 0) {
      return res.json({ count: 0, by_statut: {} });
    }
    const users = await getAllUsers();
    let list = await getTransfers();
    const scoped = filterTransfersForUser(list, req.user, users, perms);
    if (scoped === null) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const pending = scoped.filter((t) => statuses.includes(t.statut));
    const byStatut = {};
    for (const s of statuses) {
      byStatut[s] = pending.filter((t) => t.statut === s).length;
    }
    res.json({ count: pending.length, by_statut: byStatut });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Transferts */
app.get('/api/transfers', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    const users = await getAllUsers();
    let list = await getTransfers({
      statut: req.query.statut || null,
      judokaId: req.query.judoka_id || null,
    });
    const scoped = filterTransfersForUser(list, req.user, users, perms);
    if (scoped === null) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    list = scoped;

    const judokaIds = [...new Set(list.map((t) => t.judoka_id).filter(Boolean))];
    const judokaMap = new Map();
    await Promise.all(judokaIds.map(async (id) => {
      try {
        const j = await getJudokaById(id);
        if (j) judokaMap.set(id, j);
      } catch {
        /* ignore */
      }
    }));
    const enriched = list.map((t) => {
      const j = judokaMap.get(t.judoka_id);
      return {
        ...t,
        judoka_nom: j ? `${j.prenom || ''} ${j.nom || ''}`.trim() : '',
        judoka_prenom: j?.prenom || '',
        judoka_name: j ? `${j.prenom || ''} ${j.nom || ''}`.trim() : '',
        judoka_numero_carte: j?.numero_carte || '',
        judoka_id_label: j?.numero_carte || t.judoka_id || '',
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transfers', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.requestTransfers && req.user.type !== 'admin' && !perms.manageAll) {
      return res.status(403).json({ error: 'Demande de transfert non autorisée' });
    }
    const users = await getAllUsers();
    const judoka = await getJudokaById(req.body?.judoka_id);
    if (!judoka) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, judoka, users)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const clubTo = String(req.body?.club_to || '').trim();
    if (!(await isClubRegistered(clubTo))) {
      return res.status(400).json({ error: 'Le club de destination n\'est pas enregistré' });
    }
    const transfer = await createTransfer({
      judoka_id: judoka.id,
      club_from: judoka.club,
      club_to: clubTo,
      motif: req.body?.motif || '',
      requested_by: req.user.id,
      requested_by_name: actorLabel(req.user),
    });
    res.status(201).json(transfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transfers/:id/validate-entente', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.validateTransfersEntente && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Validation Entente non autorisée' });
    }
    const transfer = await validateTransferByEntente(req.params.id, req.user);
    res.json(transfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transfers/:id/validate-ligue', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.validateTransfersLigue && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Validation Ligue non autorisée' });
    }
    const transfer = await validateTransferByLigue(req.params.id, req.user);
    res.json(transfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transfers/:id/confirm-federation', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.validateTransfers && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Confirmation Fédération non autorisée (Secrétaire Général / Coordon)' });
    }
    const transfer = await confirmTransferByFederation(req.params.id, req.user, {
      applyClubChange: async (t) => {
        await updateJudoka(t.judoka_id, { club: t.club_to });
      },
    });
    res.json(transfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transfers/:id/reject', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    const canReject = perms.validateTransfersEntente
      || perms.validateTransfersLigue
      || perms.validateTransfers
      || req.user.type === 'admin';
    if (!canReject) return res.status(403).json({ error: 'Rejet non autorisé' });
    const transfer = await rejectTransfer(req.params.id, req.user, req.body?.motif || '');
    res.json(transfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
