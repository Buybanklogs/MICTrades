CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_country_code VARCHAR(10) DEFAULT '+234',
  phone_number VARCHAR(30),
  date_of_birth DATE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_payment_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bank_name VARCHAR(150),
  account_name VARCHAR(150),
  account_number VARCHAR(30),
  btc_wallet TEXT,
  eth_wallet TEXT,
  usdt_wallet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crypto_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crypto_type VARCHAR(20) NOT NULL UNIQUE,
  buy_rate NUMERIC(18,2) NOT NULL,
  sell_rate NUMERIC(18,2) NOT NULL,
  min_amount NUMERIC(18,2) DEFAULT 0,
  max_amount NUMERIC(18,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(150) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(30) NOT NULL,
  instruction_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_crypto_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crypto_type VARCHAR(20) NOT NULL,
  wallet_address TEXT NOT NULL,
  network VARCHAR(50),
  memo_tag VARCHAR(100),
  instruction_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'NGN',
  crypto_type VARCHAR(20) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  rate NUMERIC(18,2) NOT NULL,
  calculated_value NUMERIC(18,8) NOT NULL,
  payout_amount_ngn NUMERIC(18,2),
  destination_type VARCHAR(20),
  company_bank_account_id UUID REFERENCES company_bank_accounts(id),
  company_crypto_wallet_id UUID REFERENCES company_crypto_wallets(id),
  status VARCHAR(40) NOT NULL,
  user_note TEXT,
  admin_note TEXT,
  tx_hash VARCHAR(255),
  proof_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  message TEXT NOT NULL,
  screenshot_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO crypto_rates (crypto_type, buy_rate, sell_rate, min_amount, max_amount, is_active)
VALUES
('BTC', 150000000, 145000000, 10000, NULL, TRUE),
('ETH', 8000000, 7700000, 10000, NULL, TRUE),
('USDT', 1650, 1580, 5000, NULL, TRUE)
ON CONFLICT (crypto_type) DO NOTHING;

INSERT INTO company_bank_accounts (bank_name, account_name, account_number, instruction_note, is_active)
VALUES ('Access Bank', 'TechnobabbleSolutions', '0123456789', 'Send the exact amount and click I Have Paid after transfer.', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO company_crypto_wallets (crypto_type, wallet_address, network, memo_tag, instruction_note, is_active)
VALUES
('BTC', 'bc1qexamplewalletaddressbtc123456789', 'Bitcoin', NULL, 'Send only BTC to this address.', TRUE),
('ETH', '0xExampleEthWalletAddress1234567890', 'ERC20', NULL, 'Send only ETH using the correct network.', TRUE),
('USDT', 'TYExampleUsdtWalletAddress1234567890', 'TRC20', NULL, 'Send only USDT using TRC20 unless stated otherwise.', TRUE)
ON CONFLICT DO NOTHING;
