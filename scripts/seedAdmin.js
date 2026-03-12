require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const username = String(process.env.ADMIN_DEFAULT_USERNAME || 'admin').toLowerCase();
  const email = String(process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe123!';

  const existing = await db.query('SELECT id FROM admins WHERE username = $1 OR email = $2 LIMIT 1', [username, email]);
  if (existing.rows.length) {
    console.log('Admin already exists.');
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(password, 10);
  await db.query(
    'INSERT INTO admins (username, email, password_hash, role) VALUES ($1,$2,$3,$4)',
    [username, email, password_hash, 'admin']
  );
  console.log(`Admin created. Username: ${username}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
