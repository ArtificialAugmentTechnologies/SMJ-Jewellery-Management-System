# SMJ Jewellery – Store Management System

A full-stack jewellery store management application. It covers retail billing, wholesale distribution (parties, shopkeepers, line members), inventory with an audited stock ledger, gold and silver rate management, invoices (print and PDF), and reports. The interface is available in **English and Tamil**, in **light and dark** themes.

> Private repository: `ArtificialAugmentTechnologies/SMJ-Jewellery-Management-System`

---

## Features

| Area | What it does |
|------|--------------|
| **Dashboard** | Today's gold and silver rate (with update date/time), total customers, retail and wholesale sales, products, available stock, today's sales, outstanding payments and recent transactions. |
| **Retail Sales** | 4-step flow: **Customer** (look up by mobile number, show history, or register a new customer in a popup) → **Products** (Tumbler, Chain, Anklet or Ring; pick from stock or enter manually; add, edit or remove items) → **Discount & Payment** (item and invoice discounts, paid/partial/unpaid) → **Bill** (review, save, print, PDF). |
| **Wholesale Sales** | Manage Parties, Shopkeepers (Owners) and Line Members. For each, view stock distributed, sold and returned, remaining stock, sales transactions and outstanding balance. Includes wholesale billing. |
| **Line member stock** | Issue stock, then record sold and returned quantities. Remaining = Taken − Sold − Returned. Over-recording is blocked by the app *and* by a database CHECK constraint. |
| **Stock Management** | Stock inward (supplier, purchase price, date) and stock outward (to a party, shopkeeper or line member, with purpose, received-by and issued-by). Totals for in, out, available, sold and returned stock. Full movement history with CSV export. |
| **Gold Rate Management** | Admin-only updates. The full history is kept. New bills always use the latest rate; saved invoices keep the rate used when they were billed. If the rate changes while a bill is being prepared, saving is refused until the user reviews the new amounts. |
| **Billing History** | Search by customer, mobile or invoice number; filter by date, retail/wholesale and payment status. View and print previous invoices and record later payments. Completed invoices cannot be edited. |
| **Reports** | Daily sales, monthly sales, retail sales, wholesale sales, customer purchase history, product sales, stock inward, stock outward, returned items and outstanding payments. All have date filters and CSV/PDF export. |
| **Security** | bcrypt password hashing, JWT authentication, admin/staff role-based access, server-side validation (zod), login rate-limiting, Helmet security headers and a CORS allow-list. Secrets live only in environment variables. |
| **i18n and theme** | Every screen, button, form, notification and error message is available in English and Tamil. Customer-entered data is never translated. Light and dark mode are remembered per device. |

### Billing formulas (calculated on the server with exact decimal arithmetic)

```
Gold Amount   = Weight (g) × Today's Rate (₹/g) × Quantity
Item Subtotal = Gold Amount + Making Charges
Item Total    = Item Subtotal − Item Discount
Grand Total   = Σ Item Totals − Overall Invoice Discount     (never negative)
```

Silver items automatically use the silver rate.

---

## Technology

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router 7, lucide-react icons, jsPDF + autotable (PDF) |
| Backend | Node.js (≥ 20.19), Express 5, TypeScript, **Drizzle ORM**, zod, bcryptjs, jsonwebtoken, Helmet, express-rate-limit |
| Database | **Neon PostgreSQL** (node-postgres driver). Tests use an embedded PostgreSQL engine (PGlite). |

## Folder structure

```text
SMJ-Jewellery-Management-System/
├── backend/
│   ├── migrations/            # SQL migrations (0001 = initial schema)
│   ├── src/
│   │   ├── config/            # env validation, database connection
│   │   ├── controllers/       # request handlers per resource
│   │   ├── middleware/        # auth / roles, validation, error handler
│   │   ├── models/schema.ts   # Drizzle table definitions
│   │   ├── routes/index.ts    # REST routes + access rules
│   │   ├── services/          # invoice, stock and gold-rate business logic (transactions)
│   │   ├── scripts/           # migrate, seed, verify-db
│   │   ├── utils/             # exact money maths, errors
│   │   ├── app.ts             # Express app
│   │   └── index.ts           # server entry
│   └── tests/api.test.ts      # 45 end-to-end API tests
├── frontend/
│   ├── public/logo.svg
│   ├── src/
│   │   ├── components/        # UI kit, layout, billing flow, invoice view
│   │   ├── context/           # auth, theme, toasts, live gold rate
│   │   ├── i18n/              # en.ts, ta.ts (type-checked to have identical keys)
│   │   ├── lib/               # API client, formatting, money maths, PDF/CSV export
│   │   └── pages/             # one file per screen
│   └── vercel.json
├── database/
│   ├── schema.sql             # canonical schema (11 tables)
│   ├── seed.sql               # optional sample data
│   └── README.md
├── .env.example               # backend variables (copy to backend/.env)
├── render.yaml                # optional Render blueprint for the API
└── package.json               # root scripts (dev, build, test, db:*)
```

---

## Local development (Windows 11 · PowerShell · VS Code)

### 1. Clone the repository

```powershell
git clone https://github.com/ArtificialAugmentTechnologies/SMJ-Jewellery-Management-System.git
cd SMJ-Jewellery-Management-System
code .
```

### 2. Install dependencies

```powershell
npm install                    # root tools (concurrently)
npm install --prefix backend   # backend dependencies
npm install --prefix frontend  # frontend dependencies
```

### 3. Configure environment variables

```powershell
Copy-Item .env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
notepad backend\.env
```

Set the following in `backend\.env`:

- `DATABASE_URL`: your Neon connection string (see the next step).
- `JWT_SECRET`: generate one with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: the first administrator login (at least 8 characters, with a letter and a number).

Optionally, add your store address, phone and GSTIN in `frontend\.env` (`VITE_STORE_*`). These appear on invoices.

### 4. Connect Neon PostgreSQL

1. Open the [Neon Console](https://console.neon.tech) → **New Project**.
   - Project name: `smj-jewellery-store`
   - Postgres version: latest
   - Region: **AWS Asia Pacific (Singapore)**, `aws-ap-southeast-1`. This is the closest region to India.
2. In the project, open **Databases** → **New database** → name it `smj_jewellery_db`, owned by the default owner role, on the `production` branch.
3. Click **Connect** → choose database `smj_jewellery_db` → enable **Connection pooling** → copy the connection string.
4. Paste it into `backend\.env` as `DATABASE_URL="…"`. Keep `sslmode=require`.

Then create the tables and the admin user:

```powershell
npm run db:migrate
npm run db:seed                 # creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:seed -- --sample     # (optional) placeholder gold rate + sample stock
npm run db:verify               # shows the 11 tables and 18 relationships, runs a write test
```

### 5. Start the backend and frontend

Both together (two coloured log streams):

```powershell
npm run dev
```

Or in two terminals:

```powershell
npm run dev:backend    # API  → http://localhost:4000   (health: /api/health)
npm run dev:frontend   # Web  → http://localhost:5173
```

### 6. Test the website

1. Open http://localhost:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Gold Rate Management** → set today's gold and silver rates.
3. **Stock Management** → **Stock Inward** → add a few products.
4. **Retail Sales** → enter a new mobile number → register the customer → add products → apply a discount → save → **Print** / **Download PDF**.
5. Search the same mobile number again. The customer's details and purchase history load automatically.
6. **Wholesale Sales** → add a Party, a Shopkeeper and a Line Member → **Stock Management → Stock Outward**: issue 50 items to the line member → open the distribution → record 20 sold and 30 returned → remaining shows **0**.
7. **Reports** → generate any report → export CSV/PDF. Switch to **தமிழ்** and **dark mode** from the top bar.

Automated tests (no Neon needed; they use an embedded PostgreSQL engine):

```powershell
npm test            # 45 API tests: retail, wholesale, stock, security, reports
npm run typecheck   # backend + frontend TypeScript
npm run build       # production builds
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✔ | Neon PostgreSQL connection string (pooled, `sslmode=require`). |
| `JWT_SECRET` | ✔ | Random secret of 32 or more characters for signing login tokens. |
| `JWT_EXPIRES_IN` | | Session length, default `12h`. |
| `PORT` | | API port, default `4000`. |
| `NODE_ENV` | | `development` or `production`. |
| `CORS_ORIGINS` | | Comma-separated allowed frontend origins, e.g. `https://smj-jewellery.vercel.app`. |
| `TRUST_PROXY` | | `1` when behind a hosting proxy (Render/Railway), so rate limiting sees real IPs. |
| `DB_POOL_MAX` | | Maximum database connections, default `10`. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed only | First administrator, used by `npm run db:seed`. |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Empty in development (Vite proxies `/api`). In production, the full API URL including `/api`. |
| `VITE_STORE_NAME`, `VITE_STORE_ADDRESS`, `VITE_STORE_PHONE`, `VITE_STORE_EMAIL`, `VITE_STORE_GSTIN` | Store details printed on invoices. |

The database connection string is used **only** by the backend. It never reaches the frontend bundle, and `.env` files are git-ignored.

---

## API documentation

Base URL: `/api`. All routes except `/health` and `/auth/login` require `Authorization: Bearer <token>`.
Errors look like `{ "error": { "code": "insufficient_stock", "message": "…", "details": … } }`. The frontend translates `code` into English or Tamil.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/health` | public | API and database status |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` (rate-limited) |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/change-password` | any | `{ current_password, new_password }` |
| GET | `/dashboard` | any | Totals, current rate, recent transactions |
| GET | `/gold-rates/current` | any | Today's rate |
| GET | `/gold-rates` | any | Rate history |
| POST | `/gold-rates` | admin | `{ gold_rate_per_gram, silver_rate_per_gram, effective_date? }` (appends history) |
| GET | `/customers?search=` | any | Customer list with purchase totals |
| GET | `/customers/lookup?mobile=` | any | Retail step 1: `{ found, data: customer + history }` |
| GET / PATCH | `/customers/:id` | any | Customer detail with invoices and purchased products / update |
| POST | `/customers` | any | Register a customer (409 `duplicate_mobile`) |
| GET | `/products?search=&category=&in_stock=` | any | Products |
| GET | `/products/:id` | any | Product + stock movement history |
| POST / PATCH | `/products`, `/products/:id` | admin | Catalogue (stock changes only via stock operations) |
| GET | `/stock/summary` | any | Total in, out, available, sold, returned, with parties |
| GET | `/stock/movements?type=&from=&to=&product_id=&party_id=` | any | Stock ledger |
| POST | `/stock/inward` | admin | Receive stock (existing or new product) |
| POST | `/stock/outward` | admin | Issue stock to a party, shopkeeper or line member (creates a distribution) |
| GET | `/wholesale/parties?type=&search=` | any | Parties with stock and outstanding totals |
| GET | `/wholesale/parties/:id` | any | Party detail, invoices, movements |
| POST / PATCH | `/wholesale/parties`, `/wholesale/parties/:id` | admin | Manage parties |
| GET | `/wholesale/distributions?party_id=&status=` | any | Distributions |
| GET | `/wholesale/distributions/:id` | any | Items (issued, sold, returned, remaining) + history |
| POST | `/wholesale/distributions` | admin | Same as stock outward |
| POST | `/wholesale/distributions/:id/settle` | admin | `{ items: [{ item_id, sold, returned }], date, received_by }` |
| GET | `/invoices?type=&search=&invoice_number=&payment_status=&from=&to=` | any | Billing history |
| GET | `/invoices/:id` | any | Full invoice with items and payments |
| POST | `/invoices/retail` | any | `{ customer_id, gold_rate_id, items[], overall_discount, payment? }` |
| POST | `/invoices/wholesale` | any | `{ party_id, … }` |
| POST | `/invoices/:id/payments` | any | Record a payment (never above the balance) |
| GET | `/reports/:report?from=&to=&type=&mobile=` | any | `daily-sales`, `monthly-sales`, `retail-sales`, `wholesale-sales`, `customer-history`, `product-sales`, `stock-inward`, `stock-outward`, `returned-items`, `outstanding-payments` |
| GET / POST / PATCH | `/users`, `/users/:id` | admin | Manage staff and admin accounts |

Billing, payments and every stock operation run inside **database transactions** with row locks. A failure, such as insufficient stock on one line, rolls back the entire invoice.

---

## Deployment (prepared, not deployed)

Nothing is deployed automatically. Deploy only when you are ready.

### Backend: Render (or Railway)

1. On Render: **New** → **Blueprint** → select this private repository. `render.yaml` sets up the `backend` service in the Singapore region. Alternatively, create a Web Service with Root Directory `backend`, Build command `npm ci --include=dev && npm run build`, and Start command `npm start`.
2. Set the environment variables: `DATABASE_URL` (Neon production branch), `JWT_SECRET`, `CORS_ORIGINS=https://<your-app>.vercel.app`, `NODE_ENV=production`, `TRUST_PROXY=1`.
3. Migrations run on each deploy (`npm run db:migrate:prod`). Run `npm run db:seed` once from your PC against the production `DATABASE_URL` to create the admin.

### Frontend: Vercel

1. In Vercel: **Add New Project** → import the private GitHub repository → set **Root Directory** to `frontend` (Vite is detected; `vercel.json` handles SPA routing).
2. Environment variables: `VITE_API_URL=https://<your-api>.onrender.com/api`, plus the `VITE_STORE_*` details.
3. Deploy. Then add the Vercel URL to the backend's `CORS_ORIGINS`.

### Production checklist

- [ ] Strong `JWT_SECRET` (not the example value)
- [ ] `CORS_ORIGINS` lists only your production frontend URL
- [ ] Admin password changed after the first login (**Settings → Change Password**)
- [ ] Neon production branch backups / point-in-time restore reviewed
- [ ] GitHub repository remains **private**

---

## Repository

- GitHub: https://github.com/ArtificialAugmentTechnologies/SMJ-Jewellery-Management-System (private)
- Default branch: `main`
- Never commit `.env` files; only the `.env.example` templates are tracked.
