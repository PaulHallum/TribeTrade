# Developer Operations Guide

> **Generated:** 14 September 2026  
> **Source of truth:** Live configuration files — `.env`, `Dockerfile`, `cloudbuild.yaml`, `firebase.json`, `vite.config.ts`, `server.ts`, `package.json`.

---

## 1. Running the App Locally

### 1.1 Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | v22 (matches Dockerfile and Cloud Functions runtime) |
| **npm** | Included with Node.js |
| **Google Cloud SDK** | Required for Application Default Credentials (ADC) used by the backend |
| **Firebase CLI** | Required for deploying Cloud Functions, Firestore rules, and Hosting |

### 1.2 Initial Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd Tribe

# 2. Install root dependencies (frontend + backend)
npm install

# 3. Install Cloud Functions dependencies
cd functions
npm install
cd ..

# 4. Create your local .env file from the template
cp .env.example .env
# Then populate .env with real credentials (see Section 3)

# 5. Authenticate with Google Cloud (required for Firebase Admin SDK and Vertex AI)
gcloud auth application-default login
```

### 1.3 Local Architecture

When running locally, the app uses a **split-process architecture** with a Vite dev server for the frontend and an Express server for the backend:

```
┌──────────────────────────┐       ┌──────────────────────────┐
│   Vite Dev Server        │       │   Express Backend        │
│   http://localhost:3000   │──────▶│   http://localhost:3001   │
│                          │ proxy │                          │
│   React SPA + HMR        │ /api  │   API Routes             │
│                          │ /auth │   OAuth Callbacks        │
│                          │       │   Stripe Webhooks        │
│                          │       │   Cron Jobs              │
└──────────────────────────┘       └──────────────────────────┘
```

The Vite dev server (port 3000) proxies `/api/**` and `/auth/**` requests to the Express backend (port 3001). This is configured in [vite.config.ts](file:///c:/GitHub/Tribe/vite.config.ts#L16-L19):

```typescript
proxy: {
  '/api': 'http://localhost:3001',
  '/auth': 'http://localhost:3001',
},
```

### 1.4 Starting the Dev Servers

The `npm run dev` script runs the **Express backend only** via `tsx server.ts`. The backend serves on port 3001 (set by `PORT=3001` in `.env`).

To run the full stack locally, you need **two terminal windows**:

**Terminal 1 — Backend (Express + API):**
```bash
npm run dev
```
This executes `tsx server.ts`, which:
- Starts Express on port 3001
- Initialises Firebase Admin SDK with Application Default Credentials
- Initialises Vertex AI (Google Cloud project: `notegeniusfamily`, region: `europe-west2`)
- Starts cron jobs (reminder processing every minute, briefing regeneration every hour)
- Serves the built frontend from `dist/` (only relevant in production mode)

**Terminal 2 — Frontend (Vite + HMR):**
```bash
npx vite
```
This starts the Vite dev server on port 3000 with hot module replacement.

### 1.5 Building for Production Locally

```bash
npm run build
```

This runs `vite build`, which:
- Outputs the bundled React app to `dist/`
- Splits vendor chunks: `vendor-firebase`, `vendor-motion`, `vendor-lucide`, `vendor-react`
- Chunk size warning limit is set to 800 KB

After building, you can preview the production bundle:
```bash
npm run preview
```

### 1.6 App Check (Production & Local Development)

Firebase App Check uses Google reCAPTCHA Enterprise (`6LeXQs8sAAAAAJ779Yl3e7tSsPZaAuOKrF80tWm9`) in production to protect Cloud Firestore and backend APIs.
- **Production Allowed Domains**: Because domain enforcement is enabled (`allowAllDomains: false`), any custom domain serving the application must be registered under the reCAPTCHA key in Google Cloud Console (`Security > reCAPTCHA Enterprise > NoteGenius Family`):
  - `tribefamilyhub.uk`
  - `tribefamilyhub.web.app`
  - `tribefamilyhub.firebaseapp.com`
  - `localhost`
  If a new custom domain is missing from this list, Firestore rejects requests with `FirebaseError: Missing or insufficient permissions`. To update via CLI:
  ```bash
  gcloud recaptcha keys update 6LeXQs8sAAAAAJ779Yl3e7tSsPZaAuOKrF80tWm9 --project=notegeniusfamily --web --domains="tribefamilyhub.uk,tribefamilyhub.web.app,tribefamilyhub.firebaseapp.com,notegenius.uk,localhost"
  ```
- **Local Development**: When running on `localhost` or `127.0.0.1`, [firebase.ts](file:///c:/GitHub/TribeTrade/src/lib/firebase.ts) automatically sets `FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true`. If `VITE_APPCHECK_DEBUG_TOKEN` is not specified, Firebase App Check logs a generated debug token in the DevTools console for whitelisting in the Firebase Console under **App Check > Manage debug tokens**.
- **Direct Gemini Fallback**: To ensure complete resilience in local development, on unverified domains, or when ad-blockers interfere with reCAPTCHA Enterprise, [gemini.ts](file:///c:/GitHub/TribeTrade/src/services/gemini.ts) and [aiUtils.ts](file:///c:/GitHub/TribeTrade/src/services/ai/aiUtils.ts) include an automated fallback (`callDirectGeminiFallback`). If a `401 Unauthorized` or `App Check token is invalid` error is caught, the system transparently routes the prompt through the Google Gemini Developer API using `VITE_GEMINI_API_KEY`.

### 1.7 Stripe Webhook Testing (Local)

To test Stripe webhooks locally, use the Stripe CLI to forward events:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

The webhook signing secret for local testing is set via `STRIPE_WEBHOOK_SECRET` in `.env`.

### 1.8 Express Backend API Routes

The backend server ([server.ts](file:///c:/GitHub/Tribe/server.ts)) exposes the following key REST endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/places/search` | `GET` | Google Places API Text Search proxy (`https://maps.googleapis.com/maps/api/place/textsearch/json`) for fetching verified local venue recommendations without CORS errors |
| `/api/nearby-specific` | `POST` | Executes targeted user searches via Google Places API (New) Text Search with Field Masks |
| `/api/nearby-discover` | `POST` | Executes 5-Point Compass Grid search across cardinal offsets for local discovery |
| `/api/billing/checkout` | `POST` | Creates a Stripe Checkout Session for Monthly or Yearly subscription |
| `/api/billing/portal` | `POST` | Creates a Stripe Customer Portal session for self-service billing management |
| `/api/billing/sync-subscription` | `POST` | Synchronises and reconciles subscription status directly with Stripe |
| `/api/billing/cancel-subscription` | `POST` | Sets subscription to cancel at the end of the current billing period |
| `/api/billing/resume-subscription` | `POST` | Re-activates auto-renewal for a subscription scheduled to cancel |
| `/api/billing/webhook` | `POST` | Stripe webhook listener handling subscription lifecycle events (see [Stripe Integration Guide](file:///c:/GitHub/Tribe/docs/STRIPE_INTEGRATION_GUIDE.md)) |
| `/api/auth/icloud-signin` | `POST` | Validates iCloud IMAP credentials (@icloud.com address + 16-char app-specific password), provisions Firebase user, encrypts mailbox credentials, and issues custom auth token for direct entry-screen login |
| `/api/email/connect-app-password` | `POST` | Real-time IMAP verification and AES-256 encrypted vault storage for Google, Apple Mail (@icloud.com), and Yahoo app-specific passwords (rejects retired Microsoft basic auth) |
| `/auth/google`, `/auth/microsoft`, `/auth/yahoo` | `GET` | OAuth initiation and callback routes for multi-provider email inbox sync |
| `/api/oauth/messages` | `GET` | Fetches and normalises connected inbox messages across Microsoft Graph, Yahoo (OAuth & IMAP), and Apple Mail (IMAP) |

---

## 2. Deployment Pipeline

The application deploys to **two separate infrastructure components**: Firebase Hosting (static frontend) and Google Cloud Run (backend API). These are deployed independently.

### 2.1 Cloud Run Deployment (Backend)

The backend is deployed to Cloud Run via **Google Cloud Build**, triggered manually or via a CI/CD trigger. The pipeline is defined in [cloudbuild.yaml](file:///c:/GitHub/Tribe/cloudbuild.yaml).

#### Pipeline Steps

```
Step 1: Docker Build
    ↓
Step 2: Push Image to GCR
    ↓
Step 3: Deploy to Cloud Run
    ↓
Step 4: Clean Up Old Images
```

**Step 1 — Docker Build (Multi-stage):**

The [Dockerfile](file:///c:/GitHub/Tribe/Dockerfile) uses a two-stage build:

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| **Stage 1 (Builder)** | `node:22-slim` | Installs all dependencies, runs `npm run build` (Vite), produces `dist/` |
| **Stage 2 (Production)** | `node:22-slim` | Installs all dependencies (including dev — needed for `tsx`), copies `dist/`, `server.ts`, `src/`, `tsconfig.json` |

Vite environment variables are injected as Docker build arguments:
```
--build-arg VITE_GEMINI_API_KEY=...
--build-arg VITE_GOOGLE_CLIENT_ID=...
--build-arg VITE_API_URL=https://tribefamilyhub.uk
--build-arg VITE_FIREBASE_VAPID_KEY=...
```

These build args are sourced from Google Cloud Secret Manager (see Step 3 below).

**Step 2 — Push to Container Registry:**
```
gcr.io/notegeniusfamily/tribe:latest
```

**Step 3 — Deploy to Cloud Run:**

| Setting | Value |
|---------|-------|
| Service name | `tribe` |
| Region | `europe-west2` (London) |
| Platform | Managed |
| Authentication | Allow unauthenticated |
| Port | `8080` (Cloud Run default) |

Runtime environment variables are set during deployment:
```
APP_URL=https://tribefamilyhub.uk
GOOGLE_CLIENT_ID=<from Secret Manager>
GOOGLE_CLIENT_SECRET=<from Secret Manager>
GEMINI_API_KEY=<from Secret Manager>
```

**Step 4 — Automated Image Cleanup:**

After deployment, the pipeline automatically deletes all older container image versions from `us-docker.pkg.dev/notegeniusfamily/gcr.io/tribe`, keeping only the latest. This saves storage costs.

#### Secrets in Cloud Build

All secrets are fetched from **Google Cloud Secret Manager** at build time:

| Secret Name | Cloud Build Env Var | Used In |
|-------------|-------------------|---------|
| `VITE_GEMINI_API_KEY` | `VITE_GEMINI_API_KEY` | Docker build arg + Cloud Run env |
| `VITE_GOOGLE_CLIENT_ID` | `VITE_GOOGLE_CLIENT_ID` | Docker build arg + Cloud Run env |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Cloud Run env only |
| `VITE_FIREBASE_VAPID_KEY` | `VITE_FIREBASE_VAPID_KEY` | Docker build arg only |

All secrets reference `versions/latest` in project `notegeniusfamily`.

#### Triggering a Deployment

```bash
# From the project root
gcloud builds submit --config cloudbuild.yaml
```

Or configure a Cloud Build trigger in the GCP Console to run automatically on push to a branch.

### 2.2 Firebase Hosting Deployment (Frontend)

Firebase Hosting serves the static Vite build output and routes API requests to Cloud Run. The configuration is in [firebase.json](file:///c:/GitHub/Tribe/firebase.json) and [.firebaserc](file:///c:/GitHub/Tribe/.firebaserc).

| Setting | Value |
|---------|-------|
| Firebase project | `notegeniusfamily` |
| Hosting target | `tribe` → site `tribefamilyhub` |
| Public directory | `dist` |
| Production URL | `https://tribefamilyhub.uk` (primary), `https://tribefamilyhub.web.app` |

#### Rewrite Rules

| Pattern | Target |
|---------|--------|
| `/api/**` | Cloud Run service `tribe` in `europe-west2` |
| `/auth/**` | Cloud Run service `tribe` in `europe-west2` |
| `/trytribe`, `/privacy`, `/terms` | Standard SPA routes served by `index.html` via `App.tsx` |
| `**` | `/index.html` (SPA fallback) |

#### Cache Headers

| Path | Cache-Control |
|------|--------------|
| `/index.html` | `no-cache, no-store, must-revalidate` |
| `/assets/**` | `public, max-age=31536000, immutable` (1 year, content-hashed) |

#### Deploying Firebase Hosting

```bash
# Build the frontend first
npm run build

# Deploy Hosting only
firebase deploy --only hosting

# Deploy Hosting + Firestore rules + indexes
firebase deploy --only hosting,firestore

# Deploy everything (Hosting + Firestore + Functions)
firebase deploy
```

### 2.3 Cloud Functions Deployment

Cloud Functions are deployed separately from the [functions/](file:///c:/GitHub/Tribe/functions) directory.

| Setting | Value |
|---------|-------|
| Runtime | Node.js 22 |
| Region | `europe-west2` |
| Max instances | 10 |
| Source | `functions/src/index.ts` → compiled to `functions/lib/index.js` |

#### Deploying Functions

```bash
# Deploy functions only (predeploy script runs tsc build automatically)
firebase deploy --only functions
```

The predeploy step in `firebase.json` runs `npm --prefix "$RESOURCE_DIR" run build` (TypeScript compilation) before uploading.

### 2.4 Firestore Rules & Indexes

| File | Purpose |
|------|---------|
| [firestore.rules](file:///c:/GitHub/TribeTrade/firestore.rules) | Security rules enforcing trade user data isolation, team collaboration (tasks, calendar, notes, categories), and subscription gating |
| [firestore.indexes.json](file:///c:/GitHub/TribeTrade/firestore.indexes.json) | Composite indexes for collection group queries (reminders, tasks by status) |

```bash
# Deploy rules and indexes
firebase deploy --only firestore
```

#### Required Composite Indexes

| Collection Group | Fields | Purpose |
|-----------------|--------|---------|
| `tasks` | `notified` ASC, `reminderTime` ASC | Reminder cron polling within 2-hour freshness window |
| `tasks` | `notified` ASC, `title` ASC, `reminderTime` ASC | Compound lookup for task reminder alerts |
| `tasks` | `status` ASC, `dueDate` ASC | Task listing by status |
| `calendarEvents` | `notified` ASC, `reminderTime` ASC | Calendar event reminder polling within 2-hour freshness window |

### 2.5 Full Deployment Summary

A complete deployment from scratch involves:

```bash
# 1. Build frontend
npm run build

# 2. Deploy backend to Cloud Run
gcloud builds submit --config cloudbuild.yaml

# 3. Deploy Firebase services (Hosting, Firestore, Functions)
firebase deploy
```

### 2.6 Artifact & Container Registry Maintenance

To prevent storage bloat and unnecessary cloud costs from accumulating older build revisions, use the automated PowerShell cleanup script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\clean_artifacts.ps1
```

This utility inspects container repositories across both `tribetrader` and `notegeniusfamily` (`us-docker.pkg.dev/...`), retains the latest active deployment image, and purges all orphaned untagged revisions and retired legacy containers.

---

## 3. Environment Variables & API Keys

### 3.1 Where Variables Are Stored

Environment variables live in **four distinct locations** depending on their scope:

| Location | Scope | Read By |
|----------|-------|---------|
| **`.env`** (project root) | Local development only | `dotenv` in `server.ts`; Vite (for `VITE_*` prefixed vars) |
| **Google Cloud Secret Manager** | Cloud Build & Cloud Run (production) | `cloudbuild.yaml` `secretEnv` directives; Cloud Run `--set-env-vars` |
| **`firebase-applet-config.json`** | Firebase client SDK config (public) | Imported directly by `src/lib/firebase.ts` |
| **Cloud Run environment variables** | Production backend runtime | Set during `gcloud run deploy` in `cloudbuild.yaml` |

### 3.2 Backend-Only Variables (Server-Side Secrets)

These are **never exposed to the browser**. They are read by `server.ts` via `process.env`.

| Variable | Service | Purpose | Where to Set |
|----------|---------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth | OAuth2 client ID for Calendar scope | `.env` (local), Secret Manager (prod) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | OAuth2 client secret | `.env` (local), Secret Manager (prod) |
| `GEMINI_API_KEY` | Google AI | Vertex AI backend calls & injected into frontend HTML at runtime | `.env` (local), Secret Manager (prod) |
| `STRIPE_SECRET_KEY` | Stripe | Server-side Stripe API access | `.env` (local), Cloud Run env (prod) |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signature validation | `.env` (local), Cloud Run env (prod) |
| `STRIPE_PRICE_ID_MONTHLY` | Stripe | Monthly subscription price ID | `.env` (local), Cloud Run env (prod) |
| `STRIPE_PRICE_ID_YEARLY` | Stripe | Yearly subscription price ID | `.env` (local), Cloud Run env (prod) |
| `STRIPE_PAYMENT_LINK_MONTHLY` | Stripe | Live Stripe hosted checkout link for Monthly plan | `.env` (local), Cloud Run env (prod) |
| `STRIPE_PAYMENT_LINK_YEARLY` | Stripe | Live Stripe hosted checkout link for Yearly plan | `.env` (local), Cloud Run env (prod) |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth | Outlook/Hotmail email integration | `.env` (local), Cloud Run env (prod) |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth | Outlook/Hotmail token exchange | `.env` (local), Cloud Run env (prod) |
| `MICROSOFT_TENANT_ID` | Microsoft OAuth | Azure AD tenant (currently `common`) | `.env` (local), Cloud Run env (prod) |
| `YAHOO_CLIENT_ID` | Yahoo OAuth | Yahoo/Sky Mail email integration | `.env` (local), Cloud Run env (prod) |
| `YAHOO_CLIENT_SECRET` | Yahoo OAuth | Yahoo/Sky Mail token exchange | `.env` (local), Cloud Run env (prod) |
| `YAHOO_APP_ID` | Yahoo OAuth | Yahoo application identifier | `.env` (local), Cloud Run env (prod) |
| `FIREBASE_VAPID_PRIVATE_KEY` | FCM | Server-side VAPID key (private half) | `.env` (local) |
| `INTERNAL_SHARED_SECRET` | Internal auth | Shared secret for internal API auth middleware | `.env` (local), Cloud Run env (prod) |
| `OAUTH_ENCRYPTION_KEY` | Token vault | AES-256-GCM encryption key for OAuth tokens in Firestore (falls back to `ENCRYPTION_KEY`, then `INTERNAL_SHARED_SECRET`, then a hardcoded default) | `.env` (local), Cloud Run env (prod) |
| `APP_URL` | Server | Base URL for OAuth callbacks and deep links. Defaults to `https://tribefamilyhub.uk` in production or `http://localhost:{PORT}` locally | `.env` (local), Cloud Run env (prod) |
| `PORT` | Server | Express listen port. Default: `8080`. Local dev: `3001` | `.env` (local), Cloud Run default (prod) |
| `NODE_ENV` | Server | `development` or `production` | `.env` (local), Dockerfile `ENV` (prod) |
| `GOOGLE_CLOUD_PROJECT` | Vertex AI | GCP project ID for Vertex AI. Default: `notegeniusfamily` | ADC (local), Cloud Run metadata (prod) |

### 3.3 Frontend Variables (Vite `VITE_*` Prefix)

These are **baked into the JavaScript bundle at build time** by Vite. They are public and visible in the browser.

| Variable | Purpose | Where to Set |
|----------|---------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | OAuth popup for Google sign-in (same value as backend `GOOGLE_CLIENT_ID`) | `.env` (local), Docker build arg (prod) |
| `VITE_GEMINI_API_KEY` | Firebase AI Logic SDK (client-side Gemini calls) | `.env` (local), Docker build arg (prod) |
| `VITE_FIREBASE_VAPID_KEY` | FCM push notification token registration (public VAPID key) | `.env` (local), Docker build arg (prod) |
| `VITE_API_URL` | Base URL for API calls (unused in current code — proxy handles routing) | `.env` (local), Docker build arg (prod) |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA Enterprise site key for App Check (has a hardcoded fallback in code) | `.env` (local, optional) |
| `VITE_APPCHECK_DEBUG_TOKEN` | App Check debug token for local development (only activates on localhost) | `.env` (local only) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Places API key (falls back to `VITE_GEMINI_API_KEY`) | `.env` (local, optional) |

### 3.4 Firebase Client Configuration (Public)

The Firebase client SDK configuration is stored in [firebase-applet-config.json](file:///c:/GitHub/Tribe/firebase-applet-config.json) and imported directly by `src/lib/firebase.ts`. These are public values:

| Key | Value |
|-----|-------|
| `projectId` | `tribetrader` |
| `appId` | `1:224274649446:web:a1a05a9a5b9a26808938a7` |
| `apiKey` | `AIzaSy... (from Firebase Console)` |
| `authDomain` | `tribetrader.firebaseapp.com` |
| `storageBucket` | `tribetrader.firebasestorage.app` |
| `messagingSenderId` | `224274649446` |

### 3.5 Google Cloud Secret Manager (Production)

The following secrets **must exist** in Secret Manager under project `notegeniusfamily` for Cloud Build to succeed:

| Secret Name | Used By |
|-------------|---------|
| `VITE_GEMINI_API_KEY` | Docker build arg + Cloud Run runtime |
| `VITE_GOOGLE_CLIENT_ID` | Docker build arg + Cloud Run runtime |
| `GOOGLE_CLIENT_SECRET` | Cloud Run runtime only |
| `VITE_FIREBASE_VAPID_KEY` | Docker build arg only |

Additional secrets not referenced in `cloudbuild.yaml` but required at Cloud Run runtime should be set as environment variables on the Cloud Run service directly via the GCP Console or CLI:

```bash
gcloud run services update tribe \
  --region=europe-west2 \
  --set-env-vars "STRIPE_SECRET_KEY=sk_live_...,STRIPE_WEBHOOK_SECRET=whsec_...,MICROSOFT_CLIENT_ID=...,MICROSOFT_CLIENT_SECRET=...,YAHOO_CLIENT_ID=...,YAHOO_CLIENT_SECRET=..."
```

### 3.6 Runtime Environment Injection

In production, the Express server's catch-all `GET *` handler injects the `GEMINI_API_KEY` into the served HTML at runtime. This is done in [server.ts](file:///c:/GitHub/Tribe/server.ts#L1720-L1727):

```typescript
const envScript = `<script>window.ENV = { GEMINI_API_KEY: "${process.env.GEMINI_API_KEY || ''}" };</script>`;
html = html.replace('</head>', `${envScript}</head>`);
```

This allows the frontend to access the Gemini API key without baking it into the static Vite build, enabling secret rotation without rebuilding the frontend.

### 3.7 Complete `.env` Template

Copy `.env.example` and fill in all values:

```bash
# ─── BACKEND SECRETS (server-side only) ─────────────────────────────
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"

YAHOO_APP_ID="your-yahoo-app-id"
YAHOO_CLIENT_ID="your-yahoo-client-id"
YAHOO_CLIENT_SECRET="your-yahoo-client-secret"

MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"
MICROSOFT_TENANT_ID="common"

GEMINI_API_KEY="your-gemini-api-key"

# ─── FRONTEND PUBLIC (baked into JS by Vite) ────────────────────────
VITE_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
VITE_GEMINI_API_KEY="your-gemini-api-key"
VITE_FIREBASE_VAPID_KEY="your-firebase-vapid-public-key"
VITE_API_URL="http://localhost:3001"

# ─── APP CONTROL ────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
APP_URL="http://localhost:3001"

# ─── STRIPE PAYMENTS ────────────────────────────────────────────────
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PRICE_ID_MONTHLY="price_..."
STRIPE_PRICE_ID_YEARLY="price_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# ─── OPTIONAL ───────────────────────────────────────────────────────
OAUTH_ENCRYPTION_KEY="your-32-byte-encryption-key"
INTERNAL_SHARED_SECRET="your-shared-secret"
VITE_APPCHECK_DEBUG_TOKEN="your-debug-token"
VITE_RECAPTCHA_SITE_KEY="your-recaptcha-site-key"
```

---

*This document reflects the Tribe codebase as of 14 September 2026. It was generated entirely from the live configuration files without reference to any pre-existing documentation.*
