const jwt = require('jsonwebtoken');

function signUser(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function signAdmin(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, username: admin.username, role: admin.role || 'admin' },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

module.exports = { signUser, signAdmin, safeNumber };
