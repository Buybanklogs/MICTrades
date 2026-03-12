const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.admin = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}

module.exports = { authRequired, adminRequired };
