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
  computeStats,
  canAccessJudoka,
  enforceJudokaClub,
  canMessageUser,
} from './permissions.js';
import { saveUploadedFile, deleteStoredFile } from './storage.js';
import { isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

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
  { name: 'doc_affiliation', maxCount: 1 },
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

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use('/uploads', express.static(uploadsDir));

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) app.use(express.static(distPath));

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

    const result = await login(loginId, password);
    if (!result) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    res.json({ ...result, permissions: getPermissions(result.user) });
  } catch (err) {
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

app.post('/api/users', handleClubDocsUpload, async (req, res) => {
  try {
    const body = { ...req.body };
    const documents = await extractClubDocuments(req.files);
    if (Object.keys(documents).length) body.documents = documents;

    if (!body.type || !body.password) {
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
    res.json(computeStats(judokas, users, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/judokas', async (req, res) => {
  try {
    const search = req.query.search || '';
    let judokas = await getAllJudokas(search);
    judokas = filterJudokas(judokas, req.user);
    res.json(judokas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/judokas/:id', async (req, res) => {
  try {
    const judoka = await getJudokaById(req.params.id);
    if (!judoka) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, judoka)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json(judoka);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/judokas', upload.single('photo'), async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.createJudokas) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créer des judokas' });
    }

    const body = req.body;
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.date_naissance || !body.club?.trim() || !body.grade) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const club = enforceJudokaClub(req.user, body.club?.trim());
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

app.put('/api/judokas/:id', upload.single('photo'), async (req, res) => {
  try {
    const existing = await getJudokaById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, existing)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const body = req.body;
    if (!body.nom?.trim() || !body.prenom?.trim() || !body.date_naissance || !body.club?.trim() || !body.grade) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const club = enforceJudokaClub(req.user, body.club?.trim());
    if (!(await isClubRegistered(club))) {
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
      photo,
      entraineur_id: body.entraineur_id?.trim() || '',
      entraineur_nom: body.entraineur_nom?.trim() || '',
      date_inscription: body.date_inscription || existing.date_inscription,
      statut: body.statut || 'actif',
    });

    res.json(await getJudokaById(req.params.id));
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.delete('/api/judokas/:id', async (req, res) => {
  try {
    const perms = getPermissions(req.user);
    if (!perms.deleteJudokas) return res.status(403).json({ error: 'Suppression non autorisée' });

    const existing = await getJudokaById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Judoka introuvable' });
    if (!canAccessJudoka(req.user, existing)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    if (existing.photo) await deleteStoredFile(existing.photo);
    await deleteJudoka(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (fs.existsSync(distPath)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function startServer() {
  try {
    await ensureAdminExists();
    const server = app.listen(PORT, () => {
      console.log(`Serveur FENACOJU Card démarré sur http://localhost:${PORT}`);
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

startServer();
