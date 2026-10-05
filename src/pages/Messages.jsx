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
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const ATT_MARKER_RE = /__FENACOJU_ATT__([A-Za-z0-9+/=]+)/;
const URL_RE = /https?:\/\/[^\s<]+/gi;
const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;
const ALLOWED_MESSAGE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN']);

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
      const nameLine = text.match(/📎\s*([^\n<]+)/);
      attachmentName = attachmentName || nameLine?.[1]?.trim() || 'Fichier joint';
    }
  }

  text = text
    .replace(/📎[^\n<]*/g, '')
    .replace(URL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, attachmentUrl, attachmentName };
}

function sanitizeMessageHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const walk = (node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_MESSAGE_TAGS.has(child.tagName)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          continue;
        }
        [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
        walk(child);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function isRichMessageBody(text) {
  return HTML_TAG_RE.test(String(text || ''));
}

function editorHasContent(el) {
  if (!el) return false;
  const text = String(el.innerText || '').replace(/\u00a0/g, ' ').trim();
  if (text) return true;
  return Boolean(el.querySelector('img'));
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
  const [draftEmpty, setDraftEmpty] = useState(true);
  const [attachment, setAttachment] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [contactsOpen, setContactsOpen] = useState(true);
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
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

  const clearEditor = () => {
    if (editorRef.current) editorRef.current.innerHTML = '';
    setDraftEmpty(true);
  };

  const syncDraftEmpty = () => {
    setDraftEmpty(!editorHasContent(editorRef.current));
  };

  const applyFormat = (command) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, null);
    syncDraftEmpty();
  };

  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // ignore
    }
    loadContacts()
      .catch(() => setError('Impossible de charger les messages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    clearEditor();
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError('Fichier trop volumineux (maximum 20 Mo)');
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
    const editor = editorRef.current;
    const plain = String(editor?.innerText || '').replace(/\u00a0/g, ' ').trim();
    const html = sanitizeMessageHtml(editor?.innerHTML || '');
    const file = attachment;
    if (!plain && !file) return;
    const body = plain ? html : '';
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      from_id: currentUser.id,
      to_id: selectedId,
      subject: '',
      body: body || (file ? `Pièce jointe : ${file.name}` : ''),
      attachment_name: file?.name || '',
      attachment_url: file ? 'pending' : '',
      read: false,
      created_at: new Date().toISOString(),
    };
    clearEditor();
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);
    setError('');
    setMessages((prev) => [...prev, optimistic]);
    try {
      const saved = await sendMessage(selectedId, '', body, file || undefined);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      loadContacts();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (editorRef.current) editorRef.current.innerHTML = body;
      setDraftEmpty(!plain);
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
    <div
      className={[
        'messages-page',
        contactsOpen ? 'is-contacts-open' : 'is-thread-open',
        selected ? 'has-selection' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="messages-mobile-bar">
        <button
          type="button"
          className={`messages-mobile-tab ${contactsOpen ? 'active' : ''}`}
          onClick={() => setContactsOpen(true)}
        >
          Contacts
          {unreadTotal > 0 && <span className="messages-badge">{unreadTotal}</span>}
        </button>
        <button
          type="button"
          className={`messages-mobile-tab ${!contactsOpen ? 'active' : ''}`}
          onClick={() => selected && setContactsOpen(false)}
          disabled={!selected}
        >
          Conversation
        </button>
      </div>

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
                  onClick={() => {
                    setSelectedId(c.id);
                    setContactsOpen(false);
                  }}
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
            <p>Ouvrez la liste des contacts pour consulter ou envoyer un message officiel.</p>
          </div>
        ) : (
          <>
            <div className="messages-panel-header">
              <button
                type="button"
                className="messages-back-contacts"
                onClick={() => setContactsOpen(true)}
                aria-label="Afficher les contacts"
              >
                ← Contacts
              </button>
              <span className="messages-avatar messages-avatar-lg" aria-hidden="true">
                {contactInitials(selected)}
              </span>
              <div className="messages-panel-header-copy">
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
                      {text && (
                        isRichMessageBody(text) ? (
                          <div
                            className="message-body message-body-rich"
                            dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(text) }}
                          />
                        ) : (
                          <div className="message-body message-body-plain">{text}</div>
                        )
                      )}
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
              <div className="messages-compose-toolbar" role="toolbar" aria-label="Mise en forme">
                <button
                  type="button"
                  className="messages-format-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('bold')}
                  title="Gras"
                  aria-label="Gras"
                >
                  <strong>G</strong>
                </button>
                <button
                  type="button"
                  className="messages-format-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('italic')}
                  title="Italique"
                  aria-label="Italique"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className="messages-format-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('underline')}
                  title="Souligné"
                  aria-label="Souligné"
                >
                  <span className="messages-format-underline">S</span>
                </button>
              </div>
              <div className="messages-compose-row">
                <div
                  ref={editorRef}
                  className={`messages-compose-editor ${draftEmpty ? 'is-empty' : ''}`}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Rédiger un message"
                  data-placeholder="Rédiger un message..."
                  onInput={syncDraftEmpty}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (!sending && (!draftEmpty || attachment)) {
                        e.currentTarget.closest('form')?.requestSubmit();
                      }
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn messages-send-btn"
                  disabled={sending || (draftEmpty && !attachment)}
                >
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
