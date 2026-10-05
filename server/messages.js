import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { canMessageUser } from './permissions.js';
import { getUserById } from './users.js';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const messagesPath = path.join(dataDir, 'messages.json');

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

function normalizeHiddenFor(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return [];
}

function isHiddenForUser(message, userId) {
  return normalizeHiddenFor(message?.hidden_for).includes(String(userId));
}

async function persistMessageUpdate(messageId, patch) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('messages').update(patch).eq('id', messageId);
    if (error) {
      if (/hidden_for|schema cache|column/i.test(error.message || '')) {
        console.warn('Colonne messages.hidden_for absente — exécutez migration_messages_hidden.sql');
        throw new Error('Suppression indisponible : migration base de données requise');
      }
      throw new Error(error.message);
    }
    return;
  }
  const messages = readMessagesJson();
  const index = messages.findIndex((m) => m.id === messageId);
  if (index === -1) throw new Error('Message introuvable');
  messages[index] = { ...messages[index], ...patch };
  writeMessagesJson(messages);
}

async function persistMessageDelete(messageId) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('messages').delete().eq('id', messageId);
    if (error) throw new Error(error.message);
    return;
  }
  writeMessagesJson(readMessagesJson().filter((m) => m.id !== messageId));
}

export async function getUserMessages(userId) {
  const messages = await readMessages();
  return messages
    .filter((m) => (m.from_id === userId || m.to_id === userId) && !isHiddenForUser(m, userId))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function getConversation(userId, otherId) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('messages')
      .select('*')
      .or(`and(from_id.eq.${userId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${userId})`)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).filter((m) => !isHiddenForUser(m, userId));
  }

  const messages = await getUserMessages(userId);
  return messages.filter(
    (m) =>
      (m.from_id === userId && m.to_id === otherId) ||
      (m.from_id === otherId && m.to_id === userId)
  );
}

export async function getUnreadCount(userId) {
  const messages = await readMessages();
  return messages.filter(
    (m) => m.to_id === userId && !m.read && !isHiddenForUser(m, userId)
  ).length;
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
    if (m.to_id === userId && m.from_id === otherId && !m.read && !isHiddenForUser(m, userId)) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) writeMessagesJson(messages);
}

export async function sendMessage(sender, recipientId, subject, body, attachment = null) {
  const text = String(body || '').trim();
  if (!recipientId || (!text && !attachment?.url)) {
    throw new Error('Destinataire et message ou pièce jointe requis');
  }

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
    attachment_url: attachment?.url || '',
    attachment_name: attachment?.name || '',
    attachment_type: attachment?.type || '',
    hidden_for: [],
    read: false,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const payload = { ...message };
    const { error } = await getSupabase().from('messages').insert(payload);
    if (error) {
      // Schéma sans colonnes pièce jointe / hidden_for → fallback réduit
      const marker = attachment?.url
        ? `\n\n__FENACOJU_ATT__${Buffer.from(JSON.stringify({
          n: attachment.name || 'fichier',
          u: attachment.url,
          t: attachment.type || '',
        }), 'utf8').toString('base64')}`
        : '';
      const fallback = {
        id: message.id,
        from_id: message.from_id,
        to_id: message.to_id,
        subject: message.subject,
        body: `${message.body || ''}${marker}`.trim(),
        read: false,
        created_at: message.created_at,
      };
      if (!/hidden_for|schema cache|column|attachment/i.test(error.message || '')) {
        // retry without attachment columns only
      }
      const retry = await getSupabase().from('messages').insert(fallback);
      if (retry.error) throw new Error(retry.error.message);
      return {
        ...message,
        body: message.body,
        attachment_url: attachment?.url || '',
        attachment_name: attachment?.name || '',
        attachment_type: attachment?.type || '',
      };
    }
  } else {
    const messages = readMessagesJson();
    messages.push(message);
    writeMessagesJson(messages);
  }

  return message;
}

export async function deleteMessageForUser(messageId, user) {
  const messages = await readMessages();
  const message = messages.find((m) => m.id === messageId);
  if (!message) throw new Error('Message introuvable');

  const uid = String(user.id);
  if (String(message.from_id) !== uid && String(message.to_id) !== uid) {
    throw new Error('Vous ne pouvez pas supprimer ce message');
  }

  const hiddenFor = new Set(normalizeHiddenFor(message.hidden_for));
  hiddenFor.add(uid);
  const nextHidden = [...hiddenFor];

  const bothHidden =
    nextHidden.includes(String(message.from_id))
    && nextHidden.includes(String(message.to_id));

  if (bothHidden) {
    await persistMessageDelete(messageId);
    return { id: messageId, deleted: true };
  }

  try {
    await persistMessageUpdate(messageId, { hidden_for: nextHidden });
  } catch (err) {
    // Sans colonne hidden_for : suppression définitive du message
    if (/migration|hidden_for|indisponible/i.test(err.message || '')) {
      await persistMessageDelete(messageId);
      return { id: messageId, deleted: true };
    }
    throw err;
  }

  return { id: messageId, hidden: true };
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
