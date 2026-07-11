import { getSessionUser } from './users.js';

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  try {
    const user = await getSessionUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
