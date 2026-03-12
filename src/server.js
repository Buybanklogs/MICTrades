require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');
const { authRequired, adminRequired } = require('./middleware');
const { signUser, signAdmin, safeNumber } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '..', 'public')));

function publicUser(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.email,
    phone_country_code: user.phone_country_code,
    phone_number: user.phone_number,
    date_of_birth: user.date_of_birth,
    is_active: user.is_active
  };
}

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Database connection failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      first_name, last_name, username, email,
      phone_country_code, phone_number, date_of_birth, password
    } = req.body;

    if (!first_name || !last_name || !username || !email || !password) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const exists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );

    if (exists.rows.length) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (
        first_name, last_name, username, email, phone_country_code, phone_number, date_of_birth, password_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, first_name, last_name, username, email, phone_country_code, phone_number, date_of_birth, is_active`,
      [
        first_name.trim(),
        last_name.trim(),
        username.trim(),
        email.toLowerCase().trim(),
        phone_country_code || '+234',
        phone_number || null,
        date_of_birth || null,
        password_hash
      ]
    );

    const user = result.rows[0];
    await db.query('INSERT INTO user_payment_details (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    const token = signUser(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;
    const login = identifier || email || username;
    if (!login || !password) return res.status(400).json({ error: 'Login details are required' });

    const result = await db.query(
      `SELECT * FROM users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [String(login).toLowerCase().trim()]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signUser(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const result = await db.query(
    'SELECT id, first_name, last_name, username, email, phone_country_code, phone_number, date_of_birth, is_active FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

app.get('/api/user/payment-details', authRequired, async (req, res) => {
  const result = await db.query('SELECT * FROM user_payment_details WHERE user_id = $1', [req.user.id]);
  res.json({ payment_details: result.rows[0] || null });
});

app.put('/api/user/payment-details', authRequired, async (req, res) => {
  const { bank_name, account_name, account_number, btc_wallet, eth_wallet, usdt_wallet } = req.body;
  const result = await db.query(
    `INSERT INTO user_payment_details (user_id, bank_name, account_name, account_number, btc_wallet, eth_wallet, usdt_wallet)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET
      bank_name = EXCLUDED.bank_name,
      account_name = EXCLUDED.account_name,
      account_number = EXCLUDED.account_number,
      btc_wallet = EXCLUDED.btc_wallet,
      eth_wallet = EXCLUDED.eth_wallet,
      usdt_wallet = EXCLUDED.usdt_wallet,
      updated_at = NOW()
     RETURNING *`,
    [req.user.id, bank_name || null, account_name || null, account_number || null, btc_wallet || null, eth_wallet || null, usdt_wallet || null]
  );
  res.json({ payment_details: result.rows[0] });
});

app.get('/api/rates', async (req, res) => {
  const result = await db.query('SELECT * FROM crypto_rates WHERE is_active = TRUE ORDER BY crypto_type ASC');
  res.json({ rates: result.rows });
});

app.get('/api/company-payment-details', async (req, res) => {
  const banks = await db.query('SELECT * FROM company_bank_accounts WHERE is_active = TRUE ORDER BY created_at DESC');
  const wallets = await db.query('SELECT * FROM company_crypto_wallets WHERE is_active = TRUE ORDER BY crypto_type ASC');
  res.json({ bank_accounts: banks.rows, crypto_wallets: wallets.rows });
});

app.post('/api/trades', authRequired, async (req, res) => {
  try {
    const { trade_type, currency_code, crypto_type, amount, user_note } = req.body;
    const normalizedTradeType = String(trade_type || '').toLowerCase();
    const normalizedCrypto = String(crypto_type || '').toUpperCase();
    const numericAmount = safeNumber(amount);

    if (!['buy', 'sell'].includes(normalizedTradeType) || !normalizedCrypto || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid trade input' });
    }

    const rateResult = await db.query('SELECT * FROM crypto_rates WHERE crypto_type = $1 AND is_active = TRUE LIMIT 1', [normalizedCrypto]);
    if (!rateResult.rows.length) return res.status(404).json({ error: 'Rate not found' });
    const rateRow = rateResult.rows[0];

    if (safeNumber(rateRow.min_amount) > numericAmount) {
      return res.status(400).json({ error: `Minimum amount is ${rateRow.min_amount}` });
    }
    if (rateRow.max_amount && numericAmount > safeNumber(rateRow.max_amount)) {
      return res.status(400).json({ error: `Maximum amount is ${rateRow.max_amount}` });
    }

    let rate = normalizedTradeType === 'buy' ? safeNumber(rateRow.buy_rate) : safeNumber(rateRow.sell_rate);
    let calculatedValue = 0;
    let payoutAmountNgn = null;
    let destinationType = null;
    let companyBankAccountId = null;
    let companyCryptoWalletId = null;
    let status = null;

    if (normalizedTradeType === 'buy') {
      calculatedValue = numericAmount / rate;
      destinationType = 'bank';
      status = 'awaiting_payment';
      const bankResult = await db.query('SELECT * FROM company_bank_accounts WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1');
      if (!bankResult.rows.length) return res.status(400).json({ error: 'No active company bank account configured' });
      companyBankAccountId = bankResult.rows[0].id;
    } else {
      calculatedValue = numericAmount * rate;
      payoutAmountNgn = calculatedValue;
      destinationType = 'wallet';
      status = 'awaiting_transfer';
      const walletResult = await db.query(
        'SELECT * FROM company_crypto_wallets WHERE is_active = TRUE AND UPPER(crypto_type) = $1 ORDER BY created_at DESC LIMIT 1',
        [normalizedCrypto]
      );
      if (!walletResult.rows.length) return res.status(400).json({ error: `No active ${normalizedCrypto} company wallet configured` });
      companyCryptoWalletId = walletResult.rows[0].id;
    }

    const insert = await db.query(
      `INSERT INTO trades (
        user_id, trade_type, currency_code, crypto_type, amount, rate, calculated_value, payout_amount_ngn,
        destination_type, company_bank_account_id, company_crypto_wallet_id, status, user_note
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        req.user.id,
        normalizedTradeType,
        (currency_code || 'NGN').toUpperCase(),
        normalizedCrypto,
        numericAmount,
        rate,
        calculatedValue,
        payoutAmountNgn,
        destinationType,
        companyBankAccountId,
        companyCryptoWalletId,
        status,
        user_note || null
      ]
    );

    const trade = insert.rows[0];
    let destination = null;
    if (trade.company_bank_account_id) {
      const b = await db.query('SELECT * FROM company_bank_accounts WHERE id = $1', [trade.company_bank_account_id]);
      destination = b.rows[0] || null;
    }
    if (trade.company_crypto_wallet_id) {
      const w = await db.query('SELECT * FROM company_crypto_wallets WHERE id = $1', [trade.company_crypto_wallet_id]);
      destination = w.rows[0] || null;
    }

    res.status(201).json({ trade, destination });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Trade creation failed' });
  }
});

app.get('/api/trades', authRequired, async (req, res) => {
  const result = await db.query(
    `SELECT t.*,
      cba.bank_name, cba.account_name, cba.account_number,
      ccw.wallet_address, ccw.network, ccw.memo_tag
     FROM trades t
     LEFT JOIN company_bank_accounts cba ON t.company_bank_account_id = cba.id
     LEFT JOIN company_crypto_wallets ccw ON t.company_crypto_wallet_id = ccw.id
     WHERE t.user_id = $1
     ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json({ trades: result.rows });
});

app.get('/api/trades/:id', authRequired, async (req, res) => {
  const result = await db.query(
    `SELECT t.*,
      cba.bank_name, cba.account_name, cba.account_number, cba.instruction_note AS bank_instruction_note,
      ccw.wallet_address, ccw.network, ccw.memo_tag, ccw.instruction_note AS wallet_instruction_note
     FROM trades t
     LEFT JOIN company_bank_accounts cba ON t.company_bank_account_id = cba.id
     LEFT JOIN company_crypto_wallets ccw ON t.company_crypto_wallet_id = ccw.id
     WHERE t.id = $1 AND t.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: result.rows[0] });
});

app.post('/api/trades/:id/upload-proof', authRequired, upload.single('proof'), async (req, res) => {
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
  if (!fileUrl) return res.status(400).json({ error: 'No file uploaded' });
  const result = await db.query(
    'UPDATE trades SET proof_file_url = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
    [fileUrl, req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: result.rows[0] });
});

app.post('/api/trades/:id/confirm-payment', authRequired, async (req, res) => {
  const { tx_hash } = req.body;
  const result = await db.query(
    `UPDATE trades
     SET status = 'pending_admin_confirmation', tx_hash = COALESCE($1, tx_hash), updated_at = NOW()
     WHERE id = $2 AND user_id = $3 AND status IN ('awaiting_payment', 'awaiting_transfer')
     RETURNING *`,
    [tx_hash || null, req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Trade not found or cannot be confirmed now' });
  res.json({ trade: result.rows[0] });
});

app.post('/api/support/tickets', authRequired, upload.single('screenshot'), async (req, res) => {
  const { subject, category, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
  const screenshotUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = await db.query(
    `INSERT INTO support_tickets (user_id, subject, category, message, screenshot_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.id, subject, category || null, message, screenshotUrl]
  );
  res.status(201).json({ ticket: result.rows[0] });
});

app.get('/api/support/tickets', authRequired, async (req, res) => {
  const tickets = await db.query(
    'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ tickets: tickets.rows });
});

app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { username, email, identifier, password } = req.body;
    const login = identifier || username || email;
    if (!login || !password) return res.status(400).json({ error: 'Login details are required' });

    const result = await db.query(
      `SELECT * FROM admins
       WHERE username = $1 OR email = $1
       LIMIT 1`,
      [String(login).toLowerCase().trim()]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const admin = result.rows[0];
    if (!admin.is_active) return res.status(403).json({ error: 'Admin account is disabled' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signAdmin(admin);
    res.json({ token, admin: { id: admin.id, username: admin.username, email: admin.email, role: admin.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

app.get('/api/admin/stats', adminRequired, async (req, res) => {
  const [users, trades, tickets] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active FROM users'),
    db.query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending_admin_confirmation')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM trades`),
    db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'open')::int AS open FROM support_tickets`)
  ]);

  res.json({
    users: users.rows[0],
    trades: trades.rows[0],
    tickets: tickets.rows[0]
  });
});

app.get('/api/admin/users', adminRequired, async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.phone_number, u.is_active, u.created_at,
            COUNT(t.id)::int AS trades_count
     FROM users u
     LEFT JOIN trades t ON t.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json({ users: result.rows });
});

app.patch('/api/admin/users/:id/status', adminRequired, async (req, res) => {
  const { is_active } = req.body;
  const result = await db.query(
    'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active',
    [!!is_active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

app.get('/api/admin/trades', adminRequired, async (req, res) => {
  const result = await db.query(
    `SELECT t.*, u.first_name, u.last_name, u.username, u.email,
      cba.bank_name, cba.account_name, cba.account_number,
      ccw.wallet_address, ccw.network
     FROM trades t
     JOIN users u ON t.user_id = u.id
     LEFT JOIN company_bank_accounts cba ON t.company_bank_account_id = cba.id
     LEFT JOIN company_crypto_wallets ccw ON t.company_crypto_wallet_id = ccw.id
     ORDER BY t.created_at DESC`
  );
  res.json({ trades: result.rows });
});

app.patch('/api/admin/trades/:id/status', adminRequired, async (req, res) => {
  const { status, admin_note } = req.body;
  const allowed = ['in_progress', 'completed', 'rejected', 'pending_admin_confirmation', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = await db.query(
    'UPDATE trades SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
    [status, admin_note || null, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: result.rows[0] });
});

app.get('/api/admin/rates', adminRequired, async (req, res) => {
  const result = await db.query('SELECT * FROM crypto_rates ORDER BY crypto_type ASC');
  res.json({ rates: result.rows });
});

app.post('/api/admin/rates', adminRequired, async (req, res) => {
  const { crypto_type, buy_rate, sell_rate, min_amount, max_amount, is_active } = req.body;
  const result = await db.query(
    `INSERT INTO crypto_rates (crypto_type, buy_rate, sell_rate, min_amount, max_amount, is_active)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (crypto_type) DO UPDATE SET
       buy_rate = EXCLUDED.buy_rate,
       sell_rate = EXCLUDED.sell_rate,
       min_amount = EXCLUDED.min_amount,
       max_amount = EXCLUDED.max_amount,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [String(crypto_type).toUpperCase(), buy_rate, sell_rate, min_amount || 0, max_amount || null, is_active !== false]
  );
  res.json({ rate: result.rows[0] });
});

app.get('/api/admin/company-payment-details', adminRequired, async (req, res) => {
  const [banks, wallets] = await Promise.all([
    db.query('SELECT * FROM company_bank_accounts ORDER BY created_at DESC'),
    db.query('SELECT * FROM company_crypto_wallets ORDER BY created_at DESC')
  ]);
  res.json({ bank_accounts: banks.rows, crypto_wallets: wallets.rows });
});

app.post('/api/admin/company-bank-accounts', adminRequired, async (req, res) => {
  const { bank_name, account_name, account_number, instruction_note, is_active } = req.body;
  const result = await db.query(
    `INSERT INTO company_bank_accounts (bank_name, account_name, account_number, instruction_note, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [bank_name, account_name, account_number, instruction_note || null, is_active !== false]
  );
  res.status(201).json({ bank_account: result.rows[0] });
});

app.post('/api/admin/company-wallets', adminRequired, async (req, res) => {
  const { crypto_type, wallet_address, network, memo_tag, instruction_note, is_active } = req.body;
  const result = await db.query(
    `INSERT INTO company_crypto_wallets (crypto_type, wallet_address, network, memo_tag, instruction_note, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [String(crypto_type).toUpperCase(), wallet_address, network || null, memo_tag || null, instruction_note || null, is_active !== false]
  );
  res.status(201).json({ wallet: result.rows[0] });
});

app.get('/api/admin/tickets', adminRequired, async (req, res) => {
  const result = await db.query(
    `SELECT st.*, u.first_name, u.last_name, u.username, u.email
     FROM support_tickets st
     JOIN users u ON st.user_id = u.id
     ORDER BY st.created_at DESC`
  );
  res.json({ tickets: result.rows });
});

app.patch('/api/admin/tickets/:id/status', adminRequired, async (req, res) => {
  const { status } = req.body;
  const result = await db.query(
    'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ ticket: result.rows[0] });
});

app.post('/api/admin/tickets/:id/replies', adminRequired, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Reply message is required' });
  const result = await db.query(
    'INSERT INTO ticket_replies (ticket_id, admin_id, message) VALUES ($1,$2,$3) RETURNING *',
    [req.params.id, req.admin.id, message]
  );
  res.status(201).json({ reply: result.rows[0] });
});

app.get('/api/admin/tickets/:id/replies', adminRequired, async (req, res) => {
  const result = await db.query(
    `SELECT tr.*, a.username AS admin_username
     FROM ticket_replies tr
     LEFT JOIN admins a ON tr.admin_id = a.id
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json({ replies: result.rows });
});

app.get('*', (req, res) => {
  const requestPath = req.path;
  const fullPath = path.join(__dirname, '..', 'public', requestPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return res.sendFile(fullPath);
  }
  if (requestPath.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html'));
  }
  if (requestPath.startsWith('/dashboard')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'dashboard', 'home.html'));
  }
  return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
