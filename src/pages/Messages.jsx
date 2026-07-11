import { useState, useEffect, useRef } from 'react';
import {
  fetchMessageContacts,
  fetchConversation,
  sendMessage,
  USER_TYPES,
} from '../api';

function getContactName(contact) {
  if (contact.type === 'club') return contact.nom_club;
  if (contact.type === 'admin') return 'Administrateur';
  return `${contact.prenom || ''} ${contact.nom || ''}`.trim() || contact.email;
}

function getContactRole(contact) {
  if (contact.type === 'admin') return 'Admin';
  if (contact.type === 'club') return 'Club';
  if (contact.type === 'entraineur') return 'Entraineur';
  return contact.fonction || USER_TYPES.federation?.label || 'Fédération';
}

function formatMessageTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Messages({ currentUser, onUnreadChange }) {
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef(null);

  const selected = contacts.find((c) => c.id === selectedId);

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
    if (!selectedId) return;
    setError('');
    fetchConversation(selectedId)
      .then((data) => {
        setMessages(data);
        loadContacts();
      })
      .catch((err) => setError(err.message));
  }, [selectedId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(selectedId, subject, draft);
      setDraft('');
      const data = await fetchConversation(selectedId);
      setMessages(data);
      await loadContacts();
    } catch (err) {
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
      <div className="messages-sidebar">
        <h2>Messages</h2>
        <p className="subtitle">Échangez avec les utilisateurs autorisés</p>
        <ul className="messages-contacts">
          {contacts.length === 0 ? (
            <li className="messages-empty">Aucun contact disponible</li>
          ) : (
            contacts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`messages-contact ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="messages-contact-name">{getContactName(c)}</span>
                  <span className="messages-contact-role">{getContactRole(c)}</span>
                  {c.unread > 0 && <span className="messages-badge">{c.unread}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="messages-panel">
        {!selected ? (
          <div className="messages-placeholder">
            <h3>Sélectionnez une conversation</h3>
            <p>Choisissez un contact pour lire ou envoyer un message.</p>
          </div>
        ) : (
          <>
            <div className="messages-panel-header">
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
                  return (
                    <div key={m.id} className={`message-bubble ${mine ? 'mine' : 'theirs'}`}>
                      {m.subject && <div className="message-subject">{m.subject}</div>}
                      <div className="message-body">{m.body}</div>
                      <div className="message-time">{formatMessageTime(m.created_at)}</div>
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
              <textarea
                placeholder="Écrivez votre message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
                {sending ? 'Envoi...' : 'Envoyer'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
