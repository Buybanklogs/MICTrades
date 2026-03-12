# P2P Crypto Buy/Sell Web App

A full-stack MVP for a P2P crypto buy/sell platform using:

- Node.js + Express
- PostgreSQL
- HTML/CSS/JavaScript frontend
- Admin dashboard for rates, users, trades, company bank/wallet details, and support tickets

## Included

- Public homepage
- User registration and login
- User dashboard
- Buy/sell crypto trade flow
- Trade history
- Payment details management
- Coin markets page
- Support ticket page
- Admin login
- Admin dashboard with:
  - stats
  - user management
  - trade approvals
  - rate control
  - company bank account management
  - company wallet management
  - ticket review

## Quick start

1. Create a PostgreSQL database.
2. Run `schema.sql` in your database.
3. Copy `.env.example` to `.env` and update values.
4. Install packages:

```bash
npm install
```

5. Seed the default admin:

```bash
npm run seed:admin
```

6. Start the server:

```bash
npm run dev
```

Open:
- User app: `http://localhost:3000`
- Admin login: `http://localhost:3000/admin/login.html`

## Railway deployment notes

- Add the app as a Node service.
- Add a PostgreSQL service or connect an external PostgreSQL database.
- Set environment variables from `.env.example`.
- Run the `schema.sql` contents against the Railway PostgreSQL database.
- Run `npm run seed:admin` once to create your admin.

## Important notes

- File uploads are stored locally in `uploads/` for MVP use. For production, switch to object storage.
- JWT auth is used for both users and admins.
- Coin markets use the CoinGecko public API from the browser for display only.
