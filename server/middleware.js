import { getSessionUser } from './users.js';
import { assertUserFederationEnabled } from './federations.js';

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  try {
    const user = await getSessionUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    try {
      await assertUserFederationEnabled(user);
    } catch (err) {
      if (err.code === 'FEDERATION_DISABLED') {
        return res.status(403).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
