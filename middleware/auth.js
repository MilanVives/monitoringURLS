const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'milan@telenet.be').toLowerCase().trim();

function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

module.exports = { requireAuth, ADMIN_PASSWORD, OWNER_EMAIL };
