import { useState, useEffect, useRef } from 'react';
import {
  fetchMessageContacts,
  fetchConversation,
  sendMessage,
  resolveMediaUrl,
  USER_TYPES,
} from '../api';

const ATTACHMENT_ACCEPT = '.doc,.docx,.pdf,.jpg,.jpeg,.png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png';
const ATTACHMENT_EXT = /\.(doc|docx|pdf|jpe?g|png)$/i;
const ATT_MARKER_RE = /__FENACOJU_ATT__([A-Za-z0-9+/=]+)/;
const URL_RE = /https?:\/\/[^\s]+/gi;

function parseMessageContent(message) {
  let text = String(message?.body || '');
  let attachmentUrl = message?.attachment_url && message.attachment_url !== 'pending'
    ? message.attachment_url
    : '';
  let attachmentName = message?.attachment_name || '';

  const markerMatch = text.match(ATT_MARKER_RE);
  if (markerMatch) {
    try {
      const json = decodeURIComponent(escape(atob(markerMatch[1])));
      const parsed = JSON.parse(json);
      if (parsed?.u) {
        attachmentUrl = attachmentUrl || parsed.u;
        attachmentName = attachmentName || parsed.n || 'Fichier joint';
      }
    } catch {
      // ignore
    }
    text = text.replace(ATT_MARKER_RE, '').trim();
  }

  // Anciens messages : URL brute / ligne 📎 dans le corps
  if (!attachmentUrl) {
    const urls = text.match(URL_RE) || [];
    const fileUrl = urls.find((u) => /message-attachments|\/uploads\/|\.(pdf|docx?|jpe?g|png)(\?|$)/i.test(u));
    if (fileUrl) {
      attachmentUrl = fileUrl;
      const nameLine = text.match(/📎\s*([^\n]+)/);
      attachmentName = attachmentName || nameLine?.[1]?.trim() || 'Fichier joint';
    }
  }

  text = text
    .replace(/📎[^\n]*/g, '')
    .replace(URL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, attachmentUrl, attachmentName };
}

function getContactName(contact) {
  if (contact.type === 'club') return contact.nom_club;
  if (contact.type === 'admin') return 'Administrateur';
  if (contact.type === 'ligue' || contact.type === 'entente') {
    return contact.nom_organisation || contact.nom || contact.email;
  }
  return `${contact.prenom || ''} ${contact.nom || ''}`.trim() || contact.email;
}

function getContactRole(contact) {
  if (contact.type === 'admin') return 'Admin';
  if (contact.type === 'club') return 'Club';
  if (contact.type === 'entraineur') return 'Entraineur';
  if (contact.type === 'ligue') return 'Ligue';
  if (contact.type === 'entente') return 'Entente';
  if (contact.type === 'membre') return contact.fonction || 'Membre';
  return contact.fonction || USER_TYPES.federation?.label || 'Fédération';
}

function contactInitials(contact) {
  const name = getContactName(contact);
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'MS';
  return parts.map((p) => p[0]).join('').toUpperCase();
}

function formatMessageTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getContactSearchText(contact) {
  return [
    getContactName(contact),
    contact.club,
    contact.nom_club,
    contact.prenom,
    contact.nom,
    contact.email,
    getContactRole(contact),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function Messages({ currentUser, onUnreadChange }) {
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedIdRef = useRef(null);

  const selected = contacts.find((c) => c.id === selectedId);
  const unreadTotal = contacts.reduce((sum, c) => sum + (c.unread || 0), 0);
  selectedIdRef.current = selectedId;

  const searchTerm = search.trim().toLowerCase();
  const filteredContacts = searchTerm
    ? contacts.filter((c) => getContactSearchText(c).includes(searchTerm))
    : contacts;

  const loadContacts = async () => {
    const data = await fetchMessageContacts();
    setContacts(data);
    onUnreadChange?.(data.reduce((sum, c) => sum + (c.unread || 0), 0));
  };

  useEffect(() => {
    loadContacts()
      .catch(() => setError('Impossible de charger les messages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    setError('');
    fetchConversation(selectedId)
      .then((data) => {
        if (!cancelled) setMessages(data);
        loadContacts();
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    const poll = setInterval(() => {
      const id = selectedIdRef.current;
      if (!id) return;
      fetchConversation(id)
        .then((data) => {
          if (!cancelled && selectedIdRef.current === id) setMessages(data);
        })
        .catch(() => {});
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [selectedId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAttachmentChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!ATTACHMENT_EXT.test(file.name)) {
      setError('Formats autorisés : DOC, PDF, JPG, PNG');
      e.target.value = '';
      setAttachment(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (maximum 10 Mo)');
      e.target.value = '';
      setAttachment(null);
      return;
    }
    setError('');
    setAttachment(file);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId || sending) return;
    const text = draft.trim();
    const file = attachment;
    if (!text && !file) return;
    const topic = subject;
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      from_id: currentUser.id,
      to_id: selectedId,
      subject: topic,
      body: text || (file ? `Pièce jointe : ${file.name}` : ''),
      attachment_name: file?.name || '',
      attachment_url: file ? 'pending' : '',
      read: false,
      created_at: new Date().toISOString(),
    };
    setDraft('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);
    setError('');
    setMessages((prev) => [...prev, optimistic]);
    try {
      const saved = await sendMessage(selectedId, topic, text, file || undefined);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      loadContacts();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      setAttachment(file);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Chargement des messages...</p>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <aside className="messages-sidebar">
        <div className="messages-sidebar-head">
          <p className="messages-kicker">Messagerie interne</p>
          <h2>Messages</h2>
          {unreadTotal > 0 && (
            <span className="messages-inbox-count">{unreadTotal} non lu{unreadTotal > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="messages-search-wrap">
          <input
            type="search"
            className="messages-search"
            placeholder="Rechercher un contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ul className="messages-contacts">
          {contacts.length === 0 ? (
            <li className="messages-empty">Aucun contact disponible</li>
          ) : filteredContacts.length === 0 ? (
            <li className="messages-empty">Aucun résultat pour « {search} »</li>
          ) : (
            filteredContacts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`messages-contact ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="messages-avatar" aria-hidden="true">{contactInitials(c)}</span>
                  <span className="messages-contact-copy">
                    <span className="messages-contact-name">{getContactName(c)}</span>
                    <span className="messages-contact-role">{getContactRole(c)}</span>
                  </span>
                  {c.unread > 0 && <span className="messages-badge">{c.unread}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className="messages-panel">
        {!selected ? (
          <div className="messages-placeholder">
            <div className="messages-placeholder-mark" aria-hidden="true">F</div>
            <h3>Boîte de messagerie</h3>
            <p>Sélectionnez un contact à gauche pour consulter ou envoyer un message officiel.</p>
          </div>
        ) : (
          <>
            <div className="messages-panel-header">
              <span className="messages-avatar messages-avatar-lg" aria-hidden="true">
                {contactInitials(selected)}
              </span>
              <div>
                <h3>{getContactName(selected)}</h3>
                <span className="messages-contact-role">{getContactRole(selected)}</span>
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="messages-thread" ref={threadRef}>
              {messages.length === 0 ? (
                <p className="messages-empty">Aucun message. Commencez la conversation.</p>
              ) : (
                messages.map((m) => {
                  const mine = m.from_id === currentUser.id;
                  const isRead = m.read === true || m.read === 'true';
                  const { text, attachmentUrl, attachmentName } = parseMessageContent(m);
                  const pending = m.attachment_url === 'pending';
                  return (
                    <div key={m.id} className={`message-bubble ${mine ? 'mine' : 'theirs'}`}>
                      {m.subject && <div className="message-subject">{m.subject}</div>}
                      {text && <div className="message-body">{text}</div>}
                      {attachmentUrl && (
                        <a
                          className="message-attachment"
                          href={resolveMediaUrl(attachmentUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={attachmentName || undefined}
                        >
                          📎 {attachmentName || 'Télécharger la pièce jointe'}
                        </a>
                      )}
                      {pending && !attachmentUrl && (
                        <div className="message-attachment is-pending">📎 {m.attachment_name || 'Fichier…'}</div>
                      )}
                      <div className="message-meta">
                        <span className="message-time">{formatMessageTime(m.created_at)}</span>
                        {mine && (
                          <span className={`message-receipt ${isRead ? 'is-read' : 'is-sent'}`}>
                            {isRead ? 'Lu' : 'Envoyé'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form className="messages-compose" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="Objet (optionnel)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <div className="messages-compose-row">
                <textarea
                  placeholder="Rédiger un message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  required={!attachment}
                />
                <button type="submit" className="btn messages-send-btn" disabled={sending || (!draft.trim() && !attachment)}>
                  {sending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
              <div className="messages-compose-attach">
                <input
                  ref={fileInputRef}
                  id="message-attachment"
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  onChange={handleAttachmentChange}
                  hidden
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  Joindre un fichier
                </button>
                <span className="form-hint">DOC, PDF, JPG, PNG · max 10 Mo</span>
                {attachment && (
                  <span className="messages-attach-name">
                    {attachment.name}
                    <button
                      type="button"
                      className="messages-attach-remove"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      aria-label="Retirer la pièce jointe"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
