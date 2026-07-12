import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { canMessageUser } from './permissions.js';
import { getUserById } from './users.js';
import { getSupabase, isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesPath = path.join(__dirname, '..', 'data', 'messages.json');

function readMessagesJson() {
  if (!fs.existsSync(messagesPath)) {
    fs.mkdirSync(path.dirname(messagesPath), { recursive: true });
    fs.writeFileSync(messagesPath, JSON.stringify([], null, 2));
  }
  return JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
}

function writeMessagesJson(messages) {
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
}

async function readMessages() {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('messages').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return readMessagesJson();
}

export async function getUserMessages(userId) {
  const messages = await readMessages();
  return messages
    .filter((m) => m.from_id === userId || m.to_id === userId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function getConversation(userId, otherId) {
  const messages = await getUserMessages(userId);
  return messages.filter(
    (m) =>
      (m.from_id === userId && m.to_id === otherId) ||
      (m.from_id === otherId && m.to_id === userId)
  );
}

export async function getUnreadCount(userId) {
  const messages = await readMessages();
  return messages.filter((m) => m.to_id === userId && !m.read).length;
}

export async function markConversationRead(userId, otherId) {
  if (isSupabaseEnabled()) {
    await getSupabase()
      .from('messages')
      .update({ read: true })
      .eq('to_id', userId)
      .eq('from_id', otherId)
      .eq('read', false);
    return;
  }

  const messages = readMessagesJson();
  let changed = false;
  messages.forEach((m) => {
    if (m.to_id === userId && m.from_id === otherId && !m.read) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) writeMessagesJson(messages);
}

export async function sendMessage(sender, recipientId, subject, body) {
  const text = body?.trim();
  if (!recipientId || !text) throw new Error('Destinataire et message requis');

  const recipient = await getUserById(recipientId);
  if (!recipient) throw new Error('Destinataire introuvable');
  if (!canMessageUser(sender, recipient)) {
    throw new Error('Vous n\'êtes pas autorisé à envoyer un message à cet utilisateur');
  }

  const message = {
    id: uuidv4(),
    from_id: sender.id,
    to_id: recipientId,
    subject: subject?.trim() || '',
    body: text,
    read: false,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('messages').insert(message);
    if (error) throw new Error(error.message);
  } else {
    const messages = readMessagesJson();
    messages.push(message);
    writeMessagesJson(messages);
  }

  return message;
}

export async function getMessageContacts(sender, allUsers) {
  const messages = await getUserMessages(sender.id);
  const contactIds = new Set();

  messages.forEach((m) => {
    const otherId = m.from_id === sender.id ? m.to_id : m.from_id;
    const other = allUsers.find((u) => u.id === otherId);
    if (other && canMessageUser(sender, other)) {
      contactIds.add(otherId);
    }
  });

  allUsers.forEach((u) => {
    if (u.id !== sender.id && canMessageUser(sender, u)) {
      contactIds.add(u.id);
    }
  });

  return allUsers
    .filter((u) => contactIds.has(u.id) && canMessageUser(sender, u))
    .sort((a, b) => {
      const nameA = (a.nom_club || `${a.prenom || ''} ${a.nom || ''}`).trim().toLowerCase();
      const nameB = (b.nom_club || `${b.prenom || ''} ${b.nom || ''}`).trim().toLowerCase();
      return nameA.localeCompare(nameB, 'fr');
    });
}
