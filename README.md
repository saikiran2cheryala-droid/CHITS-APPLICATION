# CHIT MANAGER — Production Web Application

Professional, multi-ledger Chit Fund Management web application built with React, TypeScript, Express, Prisma, and PostgreSQL.

---

## 🚀 Features

- **Multi-Group Chit Management**: Complete lifecycle tracking for multiple chit funds with custom duration, member count, and monthly chit values.
- **Rule Configurations**: Pre-lift & post-lift payments, custom monthly amounts, auction/lift payout schedules.
- **Excel Batch Import & Export**: One-click import for member lists and monthly payment variations (.xlsx, .xls, .csv).
- **Automated Monthly Dues & Reconciliation**: Idempotent dues generator with real-time payment tracking.
- **Lift & Auction Management**: Payout execution, partial payment tracking, remaining balances, and payout receipts.
- **Financial Projections & Profit Engine**: Projected vs. actual monthly profit, manager additional requirements, and deficit alerts.
- **PDF & Excel Reports**: Ledger reports, customer profiles, payment receipts, and monthly audit summaries.
- **Enterprise Security**: PBKDF2 salt hashing, brute-force lockouts, 90-day password expiration, multi-factor recovery.
- **Persistent Cloud Database**: Backed by PostgreSQL with Prisma ORM.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts |
| **Backend** | Node.js, Express.js, TypeScript |
| **Database** | PostgreSQL (Production) / SQLite with WAL (Local Dev Fallback) |
| **ORM** | Prisma ORM v6 with Decimal monetary precision |
| **Authentication** | HTTP-only Cookies + Bearer Token Fallback, PBKDF2 Encryption |
| **Spreadsheets & PDF** | SheetJS (XLSX), jsPDF, jsPDF-AutoTable |
| **Deployment** | Vercel (Frontend), Render / Railway / Google Cloud Run (Backend) |

---

## 📦 Local Development Setup

### 1. Prerequisites
- Node.js >= 18
- npm >= 9
- PostgreSQL (or use local SQLite mode automatically)

### 2. Install Dependencies
```bash
npm install
```

### 3. Generate Prisma Client
```bash
npx prisma generate
```

### 4. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

If connecting to PostgreSQL, set your connection URL:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/chit_manager?sslmode=prefer"
```

### 5. Run Database Migrations
If using PostgreSQL:
```bash
npx prisma db push
```

### 6. Start Development Server
```bash
npm run dev
```
The app runs at `http://localhost:3000`.

---

## 🗄️ Database Migration (SQLite to PostgreSQL)

To migrate all historical chits, members, payment records, rules, and dues from the local SQLite database into PostgreSQL:

### Direct Migration via Connection URL:
```bash
DATABASE_URL="postgresql://user:password@host:port/database" npx tsx scripts/migrate-sqlite-to-postgres.ts
```

### Export to SQL File (for Supabase / Neon / RDS / Cloud SQL):
```bash
npx tsx scripts/migrate-sqlite-to-postgres.ts --export-sql > postgres_data_export.sql
```
Then execute `postgres_data_export.sql` in your PostgreSQL database query console.

---

## 🌐 Production Deployment

### Option A: Full-Stack on Render / Railway / Cloud Run (Recommended)
1. Push your repository to GitHub.
2. In Render or Railway, create a new **Web Service** connected to your repository.
3. Attach a managed **PostgreSQL Database**.
4. Set Build Command:
   ```bash
   npm install && npx prisma generate && npm run build
   ```
5. Set Start Command:
   ```bash
   npm start
   ```
6. Set Environment Variables:
   - `NODE_ENV=production`
   - `DATABASE_URL=<your-postgres-connection-string>`
   - `CORS_ORIGIN=*`

---

### Option B: Frontend on Vercel + Backend on Render / Railway

#### 1. Backend (Render / Railway):
- Deploy the repository as a Node.js web service following Option A.
- Note your backend URL (e.g. `https://chit-manager-api.onrender.com`).
- Set `CORS_ORIGIN=https://chit-manager.vercel.app`.

#### 2. Frontend (Vercel):
- Connect your GitHub repository to Vercel.
- Framework Preset: **Vite**.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Environment Variable:
  - `VITE_API_BASE_URL=https://chit-manager-api.onrender.com`

---

## 🔒 Security Best Practices
- Passwords hashed using PBKDF2 with 100,000 iterations and cryptographic salts.
- Automatic account lockout after 5 consecutive failed attempts.
- 90-day password rotation enforced.
- Cross-Origin Resource Sharing (CORS) restricted to authorized domains in production.
- Decimal precision used for all monetary balances to eliminate floating-point inaccuracies.
