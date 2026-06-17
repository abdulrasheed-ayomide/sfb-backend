# Spring Financial Bank (SFB) — Backend API

A complete, production-ready Node.js/Express/MongoDB backend for a digital
banking platform: authentication with OTP email verification, JWT access +
refresh tokens, banking accounts, fund transfers with atomic MongoDB
transactions, a full transaction lifecycle with reversal logic, email
notifications, PDF receipts, an admin portal, and full audit logging.

---

## 1. Project Structure

```
sfb-backend/
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── server.js                  # entrypoint
    ├── app.js                     # express app, security middleware
    ├── config/
    │   ├── env.js                  # centralized config
    │   └── db.js                   # MongoDB connection
    ├── models/
    │   ├── User.js
    │   ├── Account.js
    │   ├── Transaction.js
    │   ├── Otp.js
    │   ├── Notification.js
    │   ├── Admin.js
    │   └── AuditLog.js
    ├── services/
    │   ├── auth.service.js
    │   ├── adminAuth.service.js
    │   ├── account.service.js
    │   ├── transaction.service.js
    │   ├── profile.service.js
    │   ├── notification.service.js
    │   ├── admin.service.js
    │   ├── receipt.service.js
    │   ├── email.service.js
    │   ├── emailTemplates.js
    │   └── auditLog.service.js
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── adminAuth.controller.js
    │   ├── admin.controller.js
    │   ├── account.controller.js
    │   ├── transaction.controller.js
    │   ├── profile.controller.js
    │   └── notification.controller.js
    ├── middleware/
    │   ├── auth.js                 # JWT auth + RBAC
    │   ├── errorHandler.js
    │   ├── rateLimiters.js
    │   ├── upload.js               # multer profile photo uploads
    │   └── validate.js
    ├── validators/
    │   ├── auth.validator.js
    │   ├── transaction.validator.js
    │   ├── profile.validator.js
    │   └── admin.validator.js
    ├── routes/
    │   └── v1/
    │       ├── index.js
    │       ├── auth.routes.js
    │       ├── account.routes.js
    │       ├── transaction.routes.js
    │       ├── profile.routes.js
    │       ├── notification.routes.js
    │       └── admin.routes.js
    └── utils/
        ├── logger.js
        ├── tokens.js
        ├── errors.js
        ├── asyncHandler.js
        ├── generateIdentifiers.js
        └── seedAdmin.js
```

---

## 2. Setup Guide

### 2.1 Install dependencies

```bash
cd sfb-backend
npm install
```

### 2.2 Configure environment variables

```bash
cp .env.example .env
```

Fill in real values, especially:

- `MONGO_URI`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — generate strong random values with:
  ```bash
  openssl rand -hex 32
  ```
- `SMTP_*` and `EMAIL_FROM`
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`

### 2.3 Set up MongoDB

**Option A — MongoDB Atlas (recommended)**

1. Create a free account at https://www.mongodb.com/cloud/atlas
2. Create a free M0 cluster (this is a replica set by default — required for transactions).
3. Database Access → create a database user with username/password.
4. Network Access → add your IP (or `0.0.0.0/0` for development only).
5. Connect → Drivers → copy the connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/sfb_bank?retryWrites=true&w=majority
   ```
6. Paste into `MONGO_URI`.

**Option B — Local MongoDB**

1. Install MongoDB Community Server.
2. Initialize a single-node replica set (required for `mongoose` sessions/transactions used by the transfer engine):
   ```bash
   mongod --replSet rs0 --dbpath /path/to/data
   ```
   Then in a `mongosh` shell:
   ```js
   rs.initiate()
   ```
3. Use `MONGO_URI=mongodb://127.0.0.1:27017/sfb_bank?replicaSet=rs0`.

### 2.4 Set up email (SMTP via Nodemailer)

For development, use:
- Gmail with an **App Password** (requires 2FA enabled), or
- A sandbox provider like Mailtrap, Brevo, or Resend.

For production, use a transactional email provider (SendGrid, Amazon SES,
Mailgun, Postmark) for deliverability and reputation management.

### 2.5 Seed the first admin (superadmin)

```bash
npm run seed:admin
```

This creates a `superadmin` from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
**Change this password immediately** via `POST /api/v1/admin/auth/change-password`.

### 2.6 Run the server

```bash
npm run dev     # nodemon, auto-reload
npm start       # production
```

API base URL: `http://localhost:5000/api/v1`
Health check: `GET /api/v1/health`

---

## 3. API Reference

All responses follow the shape:
```json
{ "success": true, "data": { ... }, "message": "..." }
```
Errors:
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

### 3.1 Customer Authentication — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Register a new customer |
| POST | `/verify-otp` | No | Verify email OTP, activates account & creates banking Account |
| POST | `/resend-otp` | No | Resend verification OTP |
| POST | `/login` | No | Login — returns `accessToken`, sets `refreshToken` cookie |
| POST | `/refresh` | Cookie | Get new access token |
| POST | `/logout` | Yes | Revoke refresh token |
| POST | `/forgot-password` | No | Send password reset email |
| POST | `/reset-password` | No | Reset password using emailed token |
| POST | `/change-password` | Yes | Change password (logged in) |
| GET | `/me` | Yes | Get current user |

**Register**
```json
POST /api/v1/auth/register
{
  "fullName": "Jane Doe",
  "username": "janedoe",
  "email": "jane@example.com",
  "phoneNumber": "+2348012345678",
  "password": "StrongPass123!",
  "confirmPassword": "StrongPass123!"
}
```

**Verify OTP** (activates account, creates Account with account number + customer ID)
```json
POST /api/v1/auth/verify-otp
{ "email": "jane@example.com", "code": "123456" }
```

**Login**
```json
POST /api/v1/auth/login
{ "email": "jane@example.com", "password": "StrongPass123!" }
```
Use `accessToken` as `Authorization: Bearer <token>` for protected routes.

---

### 3.2 Accounts — `/api/v1/accounts` (auth required)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Balance, account info, 5 most recent transactions |
| GET | `/me` | Full account details |

---

### 3.3 Transactions — `/api/v1/transactions` (auth required)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/verify-recipient?accountNumber=...` | Validate a recipient account before transfer |
| POST | `/transfer` | Create a fund transfer |
| GET | `/` | Paginated transaction history (filters below) |
| GET | `/:reference` | Get a single transaction |
| GET | `/:reference/receipt` | Download PDF receipt |

**Transfer**
```json
POST /api/v1/transactions/transfer
{
  "recipientAccountNumber": "1234567890",
  "amount": 5000,
  "narration": "Rent payment",
  "idempotencyKey": "client-generated-uuid"
}
```

**History filters** (query params): `status`, `direction` (`incoming`|`outgoing`),
`startDate`, `endDate`, `search`, `page`, `limit`

---

### 3.4 Profile — `/api/v1/profile` (auth required)

| Method | Endpoint | Description |
|---|---|---|
| PATCH | `/` | Update `fullName` / `phoneNumber` |
| POST | `/photo` | Upload profile photo (multipart, field name `photo`, max 2MB, jpeg/png/webp) |

---

### 3.5 Notifications — `/api/v1/notifications` (auth required)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/?page=&limit=&unreadOnly=` | Paginated notification list |
| PATCH | `/:id/read` | Mark one as read |
| PATCH | `/read-all` | Mark all as read |

---

### 3.6 Admin Portal — `/api/v1/admin`

#### Admin Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Admin login |
| POST | `/auth/refresh` | Cookie | Refresh admin token |
| POST | `/auth/logout` | Yes | Logout |
| GET | `/auth/me` | Yes | Current admin |
| POST | `/auth/change-password` | Yes | Change own password |
| POST | `/auth/create-admin` | Superadmin | Create a new admin/staff account |

#### User Management
| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?status=&kycStatus=&search=&page=&limit=` | List/search customers |
| GET | `/users/:id` | User details + recent transactions |
| PATCH | `/users/:id/status` | Set `active`/`suspended`/`frozen` (+ optional `reason`) |
| PATCH | `/users/:id/kyc` | Set KYC status (+ optional `reason`) |

#### Transaction Management
| Method | Endpoint | Description |
|---|---|---|
| GET | `/transactions?status=&type=&search=&startDate=&endDate=&page=&limit=` | List/search all transactions |
| GET | `/transactions/failed` | Failed transactions |
| GET | `/transactions/reversed` | Reversed transactions |
| GET | `/transactions/:id` | Transaction detail with full state history |
| POST | `/transactions/:id/reverse` | Manually reverse a successful transaction (`{ "reason": "..." }`) |

#### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/analytics/overview` | Totals, active users, volume, 14-day daily activity |

#### Audit Logs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/audit-logs?action=&actorType=&severity=&startDate=&endDate=&page=&limit=` | Searchable audit trail |

---

## 4. Transaction Lifecycle & Reversal Logic

States: `pending` → `processing` → `successful` | `failed` → `reversed` (optional)

- Each transfer runs inside a MongoDB session/transaction so the sender debit,
  recipient credit, and transaction record are committed atomically or not at all.
- If a transaction record was created and balances were already mutated
  before an unexpected error, `handleFailedTransaction` automatically credits
  the sender back, creates a linked `reversal` transaction record, and emails
  a reversal alert. Every state change is appended to `stateHistory` for audit.
- Admins can manually reverse any `successful` transaction via
  `POST /admin/transactions/:id/reverse`, which performs the inverse balance
  movement atomically and notifies both parties.
- Temporary network interruptions alone do not trigger reversal — only actual
  failed/incomplete transactions do, per realistic banking practice.

---

## 5. Security Features

- Bcrypt password hashing (configurable salt rounds)
- JWT access (short-lived) + refresh tokens (per-device, max 5 sessions)
- Separate auth systems and JWT `type` claims for customers vs admins
- Role-based access control (`superadmin`, `admin`, `support`, `compliance`)
- Account lockout after repeated failed logins (configurable threshold/duration)
- OTP email verification: hashed codes, TTL expiry, attempt limits
- Password reset via hashed, time-limited tokens; invalidates all sessions
- Helmet security headers, strict CORS, cookie `httpOnly`/`sameSite`
- express-mongo-sanitize + xss-clean + hpp against injection/pollution
- Tiered rate limiting: general, auth, OTP, transfers
- Centralized error handling with consistent JSON error responses
- Full audit logging: logins, transfers, reversals, profile/admin/security events

---

## 6. Deployment Guide

### 6.1 Environment

- Set `NODE_ENV=production`
- Use strong, unique secrets for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- Set `CLIENT_URL` to your deployed frontend's exact origin (CORS + cookie domain)
- Use a managed MongoDB (Atlas) replica set for transaction support
- Use a production SMTP/transactional email provider

### 6.2 Process management

Run with a process manager (PM2, systemd, or your container orchestrator):

```bash
pm2 start src/server.js --name sfb-api
```

### 6.3 Reverse proxy / HTTPS

Place behind Nginx or a managed load balancer with TLS termination.
Ensure `secure: true` cookies (already conditional on `NODE_ENV=production`)
work correctly behind your proxy (`trust proxy` may be needed if behind a
load balancer — add `app.set('trust proxy', 1)` in `app.js` if so).

### 6.4 File uploads

Profile photos are stored on local disk under `uploads/profile-photos`. For
multi-instance deployments, move this to object storage (S3-compatible) and
update `profile.service.js` / `upload.js` accordingly.

### 6.5 Containerization (example Dockerfile)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "src/server.js"]
```

---

## 7. Production Readiness Checklist

- [ ] All secrets in `.env` are unique, strong, and not committed to version control
- [ ] `NODE_ENV=production` set
- [ ] MongoDB Atlas (or replica set) configured with restricted network access and strong credentials
- [ ] Database indexes verified (`autoIndex` disabled in production — create indexes via migration/deploy script)
- [ ] SMTP provider configured with a verified sending domain (SPF/DKIM/DMARC)
- [ ] `CLIENT_URL` matches the deployed frontend origin exactly
- [ ] Superadmin password changed from the seeded default
- [ ] Rate limits reviewed for expected production traffic
- [ ] HTTPS enforced end-to-end (TLS termination + HSTS via Helmet)
- [ ] `app.set('trust proxy', 1)` enabled if behind a load balancer/reverse proxy
- [ ] File uploads moved to object storage for horizontal scaling (if applicable)
- [ ] Centralized logging/monitoring (e.g. send `logger` output to a log aggregator)
- [ ] Backups configured for MongoDB
- [ ] Audit log retention policy defined
- [ ] Load testing performed on `/transactions/transfer` endpoint
- [ ] Alerting configured for repeated failed transactions / reversal spikes
- [ ] Admin accounts reviewed — least-privilege roles assigned
- [ ] Dependency vulnerability scan (`npm audit`) run and addressed

---

## 8. What's Next (Frontend)

This backend is ready to be connected to the React frontend: public site,
auth flows (register/OTP/login/reset), customer dashboard, transfers +
transaction history + receipts, profile management, and a separate admin
portal UI — using custom CSS only (no Tailwind/Bootstrap/MUI), per the
original specification.
