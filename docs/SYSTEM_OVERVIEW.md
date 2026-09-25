# TribeTrade — System Overview

> **Generated:** 24 September 2026  
> **Source of truth:** Live codebase as it stands today. Every statement in this document is derived directly from the code.

---

## 1. What TribeTrade Actually Does

TribeTrade is a **UK-focussed trade operating system and business organisation platform** delivered as a high-performance Progressive Web App (PWA). It gives UK tradespeople (electricians, plumbers, builders, carpenters, decorators, and heating engineers) a centralised digital hub to manage job quotes, 1-click tax invoicing, materials procurement (The Shed & Pick Lists), till slip receipt OCR, HMRC Making Tax Digital (MTD) tax preparation, van fleet compliance, and team coordination — all powered by a conversational AI copilot. The entire system operates around a shared **Trade Hub** where tradespeople, apprentices, and office managers see and interact with real-time synchronized business data.

### 1.1 Dashboard ("Hub")

The main landing screen after login. It displays:

- **Personalised Business Header** — Displays time-appropriate British English greetings dynamically combined with your business name from Settings (e.g. *"Good afternoon, Apex Electrical"*), eliminating unnecessary edit inputs.
- **Trade Whiteboard** — A shared noticeboard at the top of the hub for posting temporary notes, job notices, and team reminders.
- **Quotes & Estimates Overview** — Dedicated dashboard panel displaying active quotes, pending pipeline total in British Pounds (£), and status badges (Draft, Pending, Accepted, Declined). Clicking any quote opens the full vector PDF preview modal with WhatsApp sharing, PDF download, and status progression without leaving the Hub. Optimised into a clean 2-across grid on mobile devices.
- **Calendar & Schedule** — Upcoming jobs, client appointments, vehicle compliance milestones (MOT, Insurance, Annual Service), and team dates rendered in a compact 2-across grid on phones with short month formatting.
- **Outstanding Tasks & Notes** — Actionable pending checklist items and quick reference notes.
- **Trade Supplies & Materials Pick List** — 1-click status card linking directly to merchant lookup (Screwfix, Toolstation, etc.) with horizontal scroll indicators.
- **Quick Add (`+` Action)** — Context-aware modal allowing rapid creation of Quotes, Expenses (with HMRC SA103 tax categories), Appointments/Jobs, Tasks, Trade Materials, and Notes.
- **Daily Briefing & Audio Read-Out** — An AI-compiled trade briefing summarising the day's schedule, pending tasks, weather, and business updates with British English audio readout.

### 1.2 Calendar

- Full calendar view for creating, viewing, and managing trade events and appointments.
- Events support titles, descriptions, locations, start/end times, all-day flags, and customizable reminder times.
- **Vehicle & Transport Fleet Compliance Integration** — MOT, Vehicle Insurance, Annual Servicing, Road Tax (VED), and custom transport compliance dates configured in Settings are automatically projected into the calendar with yearly recurrence.
  - **Two Automatic Entries per Compliance Item:** Exactly 1 calendar month before the due date, an advance reminder entry is placed (`⚠️ 1 Month Reminder: [Item] Due`); on the deadline, a due date entry is placed (`🚨 [Item] Due Today`).
  - **1-Click Renewal:** Directly from the calendar event modal, tradespeople can advance any compliance item by +1 year with a single click.
- **Two-way Google Calendar sync** — events can be pushed to Google Calendar via the Google Calendar API. The backend also exposes an endpoint that pulls events from the user's primary Google Calendar.
- **Google Calendar Webhook** — A webhook endpoint listens for change notifications from Google Calendar.


### 1.3 Quotes & Invoices — Trade Quotations, Invoicing & Job Acceptance

Situated directly next to Calendar in the main navigation, **Quotes & Invoices** provides a tactile, dual-view management tool for UK tradespeople:
- **Quotes & Invoices Toggle** — Segmented control in the header (mirroring the Tasks & Notes toggle) allowing tradespeople to switch between client quotations and processed invoices.
- **Status Workflow** — Tracks quotes across `draft`, `pending` (sent to client), `accepted`, and `declined` states, and invoices across `draft`, `sent`, `paid`, and `overdue` with real-time financial metrics (Total Quoted / Invoiced, Won / Paid Value, Pending / Outstanding Value).
- **Accepted Job Smart Convert Workflow (`QuoteAcceptanceModal`)** — When a quote is accepted, TribeTrade launches a smart operational pipeline:
  1. **Calendar Booking:** Calculates expected project length from labour line items and pre-fills appointment dates, customer contact info, and site address to book directly into the calendar.
  2. **The Shed Stock Cross-Reference:** Real-time lookup against `shedInventory` to verify what required materials and tools are already in stock, displaying **In Shed** stock badges.
  3. **Trade Shopping List Integration:** Automatically flags missing items and allows 1-click addition to `shoppingList` with merchant search links (Screwfix, Toolstation, Travis Perkins).
  4. **1-Click Invoice Conversion:** Converts any quote into a sequential tax invoice (`INV-1001`) with automatic payment due dates.
- **Monotonic Sequential Numbering (`highestQuoteNumber` & `highestInvoiceNumber`)** — Quotes (`Q-1001`) and invoices (`INV-1001`) strictly increment and never reset or rewind if previous quotes or invoices are deleted. The highest issued number is tracked persistently on the `trade_users/{tradeUserId}` document in Firestore, guaranteeing unique, non-duplicating job references.
- **Client-Side Vector A4 PDF Generation (`jsPDF`)** — Generates vector A4 PDFs in memory for both quotes and invoices, formatting trading headers, registration and VAT numbers, client addresses, full multiline scope of works with dynamic card expansion, itemised table with clean day/hour formatting (`1d 3h`), BACS bank transfer details, and payment terms without cloud storage dependencies.
- **Native Mobile Web Share API Integration** — Utilises `navigator.share({ files: [file] })` to summon the mobile device's native sharing sheet (iOS & Android). Allows tradespeople to share the actual PDF directly through **WhatsApp**, **Email**, **Messages**, or **AirDrop**. Automatically downloads the PDF on browsers lacking native file sharing support.
- **Magic Mic AI Voice Integration** — Tradespeople can dictate site appointments, job bookings, or quotes hands-free (e.g. *"Book in a job for Dave on Tuesday at 9am to fit radiator at 14 High Street"* or *"Draft a quote for Dave for bathroom tiling, 2 days labour at 250 a day and 80 pounds for grout and adhesive"*). Features continuous client-side speech accumulation across multiple clauses, a 3.5-second silence tolerance for natural pauses, and immediate submission on mic toggle. Quotes are **strictly never sent automatically** and require tradesperson review.
- **Compact Mobile UI** — Streamlined 3-column top stat cards, compact filter pills, and cards with key details aligned to the right to maximize vertical space and eliminate excess whitespace on phones.

### 1.4 Expenses & Bookkeeping — HMRC Making Tax Digital (MTD)

Positioned immediately next to **Quotes** in the navigation bar, **Expenses** manages business purchases, till slips, subcontractor costs, and client income:
- **Optical Receipt Scanning (`receiptService`)** — Tradespeople can photograph merchant till receipts or invoices via the camera button or upload from their photo gallery.
- **Ephemeral AI In-Memory Processing** — Gemini multimodal OCR extracts merchant name, date, gross total, VAT rate (20%/5%/0%), VAT amount, net amount, reference number, and item summary. **No receipt images are uploaded or stored in Firestore or cloud storage**; images are purged from memory immediately upon extraction.
- **HMRC SA103 Category Mapping** — Extracted purchases are automatically classified into UK Self Assessment tax expense boxes (Box 11: Cost of goods/materials, Box 12: Van & motor expenses, Box 14: Tools & equipment, Box 16: Office & phone, etc.).
- **Manual Entry & Verification** — Complete review editor with live Net and VAT calculations, category selectors, and payment methods (Card, Cash, Bank Transfer, Trade Account) styled with British English currency iconography (`ReceiptPoundSterling` and £).
- **Making Tax Digital (MTD) CSV Export (`mtdExportService`)** — Generates standard HMRC-compliant CSV ledgers with financial executive summaries (Total Net Turnover, Allowable Expenses, Taxable Profit, and Input/Output VAT position) filtered by UK Tax Year (6 April - 5 April), quarterly periods, or custom date ranges.
- **Sole Trader Self Assessment Preparation Assistant (`selfAssessmentService`, `SelfAssessmentModal`)** — Provides an interactive annual tax preparation tool:
  - **HMRC SA103 Box Breakdown:** Automatically maps recorded transactions to official HMRC Self Assessment boxes (Box 10 Turnover, Box 11 Materials/Subcontractors, Box 12 Motor, Box 14 Tools/Plant, Box 16 Office, Box 19 Fees/Insurance, Box 28 Total Expenses, Box 31 Net Profit).
  - **Estimated Tax & NI Calculations:** Indicative calculations based on UK Personal Allowance (£12,570), 20%/40% Income Tax, and 6%/2% Class 4 National Insurance.
  - **CIS Deductions Suffered Tracker:** Enables trade subcontractors to input 20% CIS tax withheld at source to estimate their remaining payable balance or HMRC refund position.
  - **Monthly Tax Pot Guidance:** Advises on monthly savings targets and outlines Payments on Account thresholds.
  - **Prominent Legal Disclaimer:** Expressly disclaims formal tax advice or filing capabilities, positioning the tool strictly as an informal organiser for tradespeople and their accountants.
  - **Accountant Handover Copy:** Generates a professional formatted summary ready to share or email to an accountant.
- **Statutory Retention Notices** — In-app guidance informing users of the statutory UK requirement (TMA 1970 s12B) to retain original physical receipts for 5 to 6 years, as Tribe Trade does not store receipt photos.

### 1.5 Tasks & Job Notes

- **Tasks** — Trade to-do items with titles, descriptions, due dates, statuses (`pending` / `completed`), subtasks, assignment to specific crew members or apprentices, trade categories, and reminder times.
- **Job Notes** — Freeform text notes with colour coding, client reference numbers, and quick site notes stored per trade hub.
- **Task Categories** — Custom trade categories for organising tasks (e.g., First Fix, Second Fix, Certification, Site Cleanup).
- **Support Tickets** — Users can submit support tickets (category + message), which are saved to Firestore and automatically converted into a private task on the admin's dashboard. An AI-powered fix suggestion is generated for each ticket.

### 1.6 The Shed — Van Stock, Tool Vault & Consumables

- **Shed Inventory (`shedInventory`)** — Centralised inventory tracking for tools, power equipment, test instruments, and consumables stored in vans or lockups.
- **Stock Tracking & Minimum Levels** — Monitors quantities, locations (Van 1, Lockup, Workshop), serial numbers, and calibration expiry dates.
- **Job Cross-Referencing** — When quotes are converted to jobs, TribeTrade automatically checks The Shed to highlight in-stock materials and flag missing supplies.

### 1.7 Materials Pick Lists & Merchant Ordering

- **Shared Trade Pick List (`shoppingList`)** — Shared materials procurement list with items automatically categorised by trade department (Electrical, Plumbing, Fixings, Timber, Building Materials, PPE).
- **Bulk Add** — Intelligently splits comma-separated, newline-separated, or trade invoice bullet lists into individual items.
- **Merchant Direct Search** — Direct 1-tap links to search UK merchants (Screwfix, Toolstation, Travis Perkins) for fast ordering or trade counter click-and-collect.

### 1.8 Email Hub

- **Multi-provider unified inbox & sign-in engine** supporting:
  - **Google Mail / Gmail** (via secure IMAP over SSL `imap.gmail.com:993` with Google App Passwords, eliminating restricted OAuth scopes and costly CASA fees)
  - **Microsoft Outlook / Hotmail** (via 1-click Modern Authentication OAuth 2.0 & Microsoft Graph API; Basic Authentication and IMAP App Passwords were permanently retired by Microsoft on 16 September 2024)
  - **Yahoo / Sky Mail** (via Yahoo OAuth & secure IMAP over SSL `imap.mail.yahoo.com:993` with Yahoo App Passwords generated from Account Security)
  - **Apple Mail / iCloud** (via secure IMAP over SSL `imap.mail.me.com:993` with verified Apple App-Specific Passwords and `@icloud.com` / `@me.com` / `@mac.com` addresses)
  - **Google Account** (authentication and Google Calendar synchronisation via Sensitive OAuth scope)
- Users can select their preferred email login account directly on the sign-up / authentication screen (`AuthScreen.tsx` / `/?action=signup`).
- OAuth authorization code exchange decodes signed JWT `id_token` claims (`preferred_username`, `email`, `name`) to automatically resolve primary email addresses and user display names for Microsoft and Yahoo users.
- Server-side account deletion endpoint (`/api/user/delete`) allows users to permanently delete their Firestore profile and Firebase Auth account via Admin SDK without client-side re-authentication errors (`auth/requires-recent-login`).
- Connected accounts are stored in `families/{familyId}/connectedAccounts/{accountId}` with **encrypted OAuth & IMAP tokens** (AES-256-GCM).
- **Production OAuth & IMAP Status:** All external provider verifications and registrations across Google (Calendar scope approved), Microsoft Entra ID (Modern Auth OAuth 2.0), Yahoo Developer Network, and Apple Mail IMAP are 100% complete and operational in production.
- Email messages are normalised into a single `NormalisedEmailMessage` interface regardless of provider.
- Customer enquiries and supplier invoices can be processed by AI via Smart Capture / Smart Convert into quotes, calendar jobs, or materials pick lists.

### 1.9 Crew & Apprentice Management

- **Crew Profiles** — Each trade business has named team members with trade roles (e.g. Lead Electrician, Qualified Plumber, Apprentice, Subcontractor, Office Administrator), telephone numbers, avatar colours, and trade skills.
- **Invite System** — 6-digit numeric crew join codes allow new team members to link directly to the existing trade hub via URL parameters (`?joinFamilyId=` or `?joinCode=`).
- **Sharing** — Quotes, invoices, tasks, job notes, and schedule summaries can be shared via the Web Share API, WhatsApp, or copied to clipboard.

### 1.10 Settings & Trade Personalisation

- **Category Sub-Menu Navigation & Collapsible Accordions** — Mobile-friendly horizontal category navigation pills (`Account & Subscription` [Default], `Business & Rates`, `Fleet & MOT`, `Connected Accounts`, `App & Theme`, `Help & Security`) and collapsible accordion cards with auto-collapse upon saving to keep the mobile viewport tidy. Direct links at the end of the interactive tour permit jumping immediately to any of these setup sections.
- **Business Details** — Configure trading name, contact telephone, email, UK trading address, company registration number, VAT number, and BACS bank transfer details for automated quote and invoice generation. The registered business name automatically powers the Hub header greeting.
- **Vehicle & Fleet Compliance** — Manage work vans, MOT expiry, Insurance renewal, Annual Servicing, and Road Tax due dates with automatic calendar projection.
- **Display & Trade Themes** — Clean display mode toggle (Light Mode / Dark Mode) and 9 trade accent themes (Electrician Amber, Plumber Sky Blue, Builder Slate, Carpenter Emerald, Heating Rose, etc.).
- **Work Tablet PIN Lock** — Optional 4-digit PIN-protected security gate for shared site tablets and van devices (stored as a secure hash).
- **Notification Preferences** — Push notification toggle for job reminders and compliance dates.
- **Connected Accounts & Resilient Cloud Sync** — Synchronise Gmail, Outlook, Yahoo, and Apple Mail inboxes. Supports Google App Passwords with a direct-to-Firestore cloud registration fallback (`trade_users/{tradeUserId}/connectedAccounts`) ensuring immediate, reliable connection across mobile PWAs and static hosting environments.

### 1.11 Push Notifications & Job Reminders

- **FCM (Firebase Cloud Messaging)** push notifications for tasks and calendar job reminders.
- **Customizable Reminder Lead Times**: Events and tasks support user-selectable reminder timing (*At time of event/due time*, *10 minutes before*, *30 minutes before*, *1 hour before*, *1 day before at 09:00*, or *No reminder*), with business default preferences in Settings.
- **Google Calendar Synchronisation Overrides**: Explicitly sets `reminders: { useDefault: false, overrides: [...] }` when syncing to Google Calendar, preventing Google's account-level default alerts from firing unwanted duplicate or early notifications.
- **Safe Daytime All-Day Scheduling**: All-day job entries and compliance deadlines default to 09:00 AM local time rather than midnight UTC.
- **Backend Ticker & Freshness Window**: The backend runs a **cron job every minute** that queries Firestore for items with `notified: false` and `reminderTime <= now` within a 2-hour freshness window (`reminderTime >= now - 2 hours`), ensuring ancient overdue tasks never fire notifications when edited or re-registered. Completed tasks are automatically excluded and marked `notified: true` to prevent late reminders.
- **Consistent Firestore Timestamps**: `reminderTime` is strictly stored as a Firestore Timestamp across all modals.
- Supports multi-device token storage (array of FCM tokens per user) with two-way sync between user preferences and FCM token unregistration.
- Foreground notification handling shows system notifications even when the app is open.

### 1.12 User Guide & Public Try Page (`/try`)

- **In-App User Guide (`GuideView.tsx`)** — 10 dedicated UK trade guides covering PWA Installation, Smart Convert & Magic Mic, Centralised Hub & 6 AM Morning Briefing, Quotes & Estimates, 1-Click Invoicing, Trade Calendar, Expenses & Receipt OCR, HMRC Self-Assessment & MTD Export, Materials & The Shed, and Van Fleet Maintenance. Includes an interactive side-by-side Free vs Premium comparison table and UK trade FAQs.
- **Dedicated Try Page (`TryTribePage.tsx`)** — Accessible at `/try`, `/trytribe`, `/try-tribe`, and `/overview`.
  - Features official TribeTrade branding with direct test CTAs and live feature spotlights.
  - **Embedded Interactive Trade Sandbox Tour** — Integrates a live 5-step interactive simulation directly into the page flow (`DashboardTour.tsx` with `isEmbedded={true}`) enabling visitors to test:
    1. **Trade Hub Overview:** Live Apex Electrical greeting, weather, 6 AM briefing badge, site noticeboard, 3 booked jobs, quotes & billing pipeline, and van MOT/tax status.
    2. **AI Smart Capture & Quote Drafting:** Instant parsing of a real WhatsApp enquiry into labour, materials, VAT, CIS, total £1,152.00, and a calendar booking.
    3. **Magic Mic & 6 AM Morning Briefing:** Van stock dictation to The Shed, site survey scheduling, and a hands-free audio briefing player.
    4. **Quotes, Invoicing & 1-Click Payments:** Itemised quote card #Q-1042, deposit tracking, 1-click invoice conversion #INV-2090, and CIS deductions.
    5. **Expenses, Receipt OCR & HMRC MTD Tax Prep:** Screwfix till slip OCR, £23.80 VAT extraction, HMRC Self-Assessment tax pot calculator, and MTD CSV download.
  - **Integrated Feature Matrix & Pricing Section** — Side-by-side Free Tier (£0) vs Premium (£7.95/month or £79.00/year with a 14-day free trial).
  - **Progressive Web App (PWA) Multi-Device Guide** — 1-tap installation guide for iPhone/iPad (Safari Add to Home Screen), Android (Chrome 1-tap install), and Desktop (Mac/Windows windowed app).

---

## 2. AI Integration

All AI features are powered by **Google's Gemini** model family, accessed via two different backends depending on the context.

### 2.1 AI Architecture

| Layer | Model | Access Method | Purpose |
|-------|-------|---------------|---------|
| **Frontend (Client)** | `gemini-3.5-flash-lite` | Firebase AI Logic SDK (`firebase/ai` with `GoogleAIBackend`) | All user-facing AI features (chat, briefing, pantry, smart capture, smart convert, recipes, nearby) |
| **Backend (Server)** | `gemini-3.5-flash-lite` | Vertex AI SDK (`@google/genai` with ADC) | Server-side briefing regeneration, health checks |
| **Cloud Functions** | Google Cloud Text-to-Speech | `@google-cloud/text-to-speech` | Neural voice audio generation for briefing read-out |

All frontend AI calls go through the `gemini.ts` and `smartCaptureService.ts` service files, which share common utilities from `ai/aiUtils.ts` (retry logic, JSON parsing, Zod schema validation).

### 2.2 AI Features in Detail

#### Natural Language Chat (AI Input)
- The main chat interface where users type or speak natural language commands.
- AI parses input and returns structured JSON actions: `CREATE_TASK`, `CREATE_CALENDAR_EVENT`, `CREATE_NOTE`, `CREATE_SHOPPING_ITEM`, or `SEARCH_NEARBY`.
- Context-aware: receives the family member list, recent conversation history (last 5 messages), and the next 3 days of schedule.
- Supports function calling for direct action execution.

#### Daily Briefing Generation
- Generates a warm, personalised family briefing covering: **Today**, **Coming Up**, **Reminders**, and **Fun Strategy**.
- Personalised per logged-in user — addresses them as "You" and attributes items to the correct family members.
- Uses `temperature: 0.8` for a warm, friendly tone.
- Thinking budget of 1024 tokens for reasoning.

#### Smart Capture
- Processes **text** (including raw HTML from emails/web pages) or **images** (camera/photo) to extract actionable items.
- Extracts: tasks, calendar events, notes, shopping items, and recipes.
- Includes date intelligence — past-dated tasks are clamped to today at 09:00.
- Calendar events without a verified location are automatically downgraded to a task ("Check dates & location for [Event Title]").
- RSVP tasks are scheduled 7 days after detection; gift-buying tasks are scheduled 7 days before events.

#### Smart Convert
- A deeper analysis mode that creates a "Plan of Attack" from notes, emails, or briefing content.
- Generates expanded content with **What's On** and **Logistics** sections.
- Enriches results with Google Places API lookups (Maps URLs, addresses).
- Considers weather forecast and family member availability.
- Can generate reply drafts for invitations.

#### Smart Convert on Briefing
- A special mode of Smart Capture that runs against the daily briefing text.
- Only generates preparation tasks and shopping items — never duplicates existing calendar events.

#### Pantry Analysis
- Accepts one or more photos (base64 JPEG).
- Identifies all visible food items and suggests 3 "Use it Up" recipes using 2+ identified items.

#### Recipe AI
- `getRecipeIngredients()` — Returns a JSON array of basic ingredients for a named meal.
- `getRecipeInstructionsAndPrepTime()` — Generates step-by-step cooking instructions and prep time from a title + ingredients.
- `extractIngredientsFromMeal()` — Extracts 3–10 UK grocery ingredient names from meal descriptions.

#### Local Recommendations (Nearby)
- AI generates 9 family activity recommendations based on location, radius, family context, interests, and exclusions.
- Combines AI-generated results with Google Places API data, deduplicating by name.
- Special events are given priority placement.

#### Support Ticket Fix Generator
- When a user submits a support ticket, AI generates a step-by-step troubleshooting guide.

### 2.3 Voice Services

- **Text-to-Speech (TTS)** — Neural voice (en-GB-Neural2-A) via Google Cloud TTS, delivered through Firebase Cloud Functions.
  - `getTribeAudio` — On-demand audio synthesis.
  - `getTribeAudioCached` — Daily briefing audio cached in Firebase Storage with 30-day signed URLs.
- **Speech-to-Text** — Voice input via the browser's built-in `SpeechRecognition` / `webkitSpeechRecognition` API for the AI chat input.
- **Fallback** — If Cloud TTS fails or the user is offline, falls back to the browser's native `SpeechSynthesis` API (en-GB voice preferred).
- **Audio Caching** — Uses the Cache API to store previously generated audio for instant replay.

---

## 3. Monetisation & Subscription Flow

TribeTrade operates a **Reverse Trial** model powered by Stripe subscriptions:

### 3.1 Subscription Tiers & Pricing

- **Premium Monthly:** £7.95 / month
- **Premium Yearly:** £79.00 / year (saving £16.40/yr, equivalent to 2 months free)
- **14-Day Reverse Trial:** Full Premium access upon registration without entering credit card or payment details.

| Capability / Feature | Free Tier (£0 / Forever) | Premium Tier (£7.95/mo or £79/yr) |
| :--- | :--- | :--- |
| **Quotes & Estimates** | Up to 3 active quotes | Unlimited quotes & draftings |
| **1-Click Invoice Conversion** | Manual entry only | 1-Click convert quote to tax invoice |
| **PDF Generation & Branding** | Basic A4 PDF | Vector A4 PDF with business logo & BACS |
| **AI Smart Quote Drafting** | Disabled | Included (50 AI requests/day fair use) |
| **WhatsApp Client Sharing** | Manual copy/paste | 1-Tap native share & text breakdown |
| **Till Slip Receipt OCR** | Disabled | Included (multimodal 20% VAT extraction) |
| **HMRC Self-Assessment Prep** | Manual calculations | Included (SA103 boxes, CIS deductions, tax pot) |
| **MTD Tax Data Export** | Disabled | Standard HMRC Making Tax Digital CSV ledger |
| **Trade Calendar & Reminders** | Manual calendar events | Automated reminders & Google Calendar sync |
| **Fleet & MOT Tracking** | 1 vehicle compliance record | Unlimited vans & fleet vehicles |
| **Materials & The Shed** | Up to 25 inventory items | Unlimited van stock & merchant search links |
| **6 AM Morning Briefing** | Text only | Neural voice British English audio briefing |
| **Magic Mic Hands-Free Audio** | Disabled | Included (van dictation & voice capture) |
| **Work Tablet PIN Lock** | Included | Included |
| **Trade UI Accent Themes** | Default theme only | All 9 trade accent colour themes |

### 3.2 Trial Mechanics

1. On initial account creation, a `trialEndsAt` timestamp is written to `users/{uid}/private/billing` set to exactly 14 days from sign-up.
2. The `useSubscriptionTier` hook listens in real-time to the user document, business hub document, and private billing document to evaluate active permissions.
3. During the 14-day trial window, tradespeople receive full Premium access without credit card commitment.
4. When the trial expires without a Stripe checkout, the account reverts automatically to the Free Tier.
5. In the Free Tier, core tools remain operational (up to 3 quotes, manual invoicing, standard calendar, and 1 vehicle), while AI requests and MTD exports are gated with clear upgrade prompts.

### 3.3 Stripe Integration

The subscription lifecycle is fully managed via Stripe:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/billing/checkout` | Creates a Stripe Checkout Session (monthly or yearly plan) and returns the checkout URL |
| `POST /api/billing/portal` | Creates a Stripe Customer Portal session for self-service subscription management |
| `POST /api/billing/sync-subscription` | Actively syncs subscription status with Stripe — checks session IDs, recent checkout sessions, and customer subscriptions |
| `POST /api/billing/cancel-subscription` | Sets `cancel_at_period_end = true` on the Stripe subscription (user retains access until period end) |
| `POST /api/billing/resume-subscription` | Sets `cancel_at_period_end = false` to resume a previously cancelled subscription |
| `POST /api/billing/webhook` | Stripe webhook listener for lifecycle events |

### 3.4 Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Upgrades family to Premium, stores `stripeCustomerId`, removes `subscriptionTier` from individual user docs (family-level only) |
| `customer.subscription.deleted` | Downgrades family to Free |
| `customer.subscription.updated` (status = canceled) | Downgrades family to Free |
| `invoice.payment_failed` | Logged as a warning |

### 3.5 Subscription Data Model

- **Subscription tier is stored at the family level** (`families/{familyId}.subscriptionTier`), not per user. This means one subscription covers the entire family.
- `stripeCustomerId` is stored on the subscribing user's document for portal access.
- Cancellation metadata (`cancelAtPeriodEnd`, `currentPeriodEnd`) is stored on the family document.
- The `subscriptionTier` field is explicitly deleted from all individual user docs on upgrade to avoid conflicts.

### 3.6 Usage Tracking

Daily usage is tracked per family in `families/{familyId}/usage/{YYYY-MM-DD}` with counters:
- `aiUses` — General AI requests (briefing, chat, recipes, pantry, etc.)
- `nearbyRuns` — Nearby search executions
- `smartCaptureRuns` — Smart Capture executions
- `smartConvertRuns` — Smart Convert executions

Each counter is incremented atomically via Firestore transactions (`usageService.ts`) and checked against tier-specific limits before allowing the AI call to proceed. 

To prevent `failed-precondition` transaction errors when checking subscription status for accounts without a `private/billing` subcollection document, private billing metadata (`isBetaTester`, `trialEndsAt`) is retrieved out-of-transaction via `fetchBillingInfo()` before starting the transaction.

---

## 4. Tech Stack & Infrastructure

### 4.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19 | UI framework |
| **TypeScript** | ~5.8 | Type safety |
| **Vite** | 8 | Build tool and dev server |
| **Tailwind CSS** | 4 | Utility-first styling |
| **Motion** (Framer Motion) | 12 | Animations and transitions |
| **Lucide React** | 0.546 | Icon library |
| **React Hook Form** | 7 | Form handling |
| **React Markdown** | 10 | Rendering AI-generated markdown content |
| **Zod** | 4 | Runtime validation of AI JSON responses |
| **date-fns** | 4 | Date formatting and manipulation |
| **Firebase JS SDK** | 12 | Auth, Firestore, Storage, Cloud Messaging, AI Logic |

**Key Frontend Patterns:**
- **Lazy loading** — The `Shell` component is lazily loaded with a custom `lazyWithRetry` utility.
- **Context providers** — `AuthProvider`, `SettingsProvider`, `ToastProvider` wrap the entire app.
- **Offline persistence** — Firestore is initialised with `persistentLocalCache` and `persistentMultipleTabManager` for offline support across tabs.
- **PWA** — Service worker registration for Firebase Messaging, install banner for Add to Home Screen.
- **App Check & AI Resilience** — Firebase App Check with reCAPTCHA Enterprise for API abuse protection, backed by an automatic direct Gemini Developer API fallback (`callDirectGeminiFallback`) on localhost or if App Check tokens fail.

### 4.2 Backend (Express Server)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express** | 4 | HTTP server |
| **tsx** | 4 | TypeScript execution (runs `server.ts` directly) |
| **Stripe** | 22 | Payments and subscription management |
| **Firebase Admin SDK** | 14 | Firestore, Auth, Cloud Messaging (server-side) |
| **Google Auth Library** | 10 | OAuth2 client for Google sign-in and token refresh |
| **@googleapis/calendar** | 14 | Google Calendar API access |
| **@google/genai** | 1.49 | Vertex AI (server-side AI generation) |
| **node-cron** | 4 | Scheduled jobs (reminder processing, briefing regeneration) |
| **express-rate-limit** | 8 | API rate limiting (100 req/min per IP) |
| **imapflow** | 1.4 | IMAP email protocol support |
| **mailparser** | 3.9 | Email message parsing |

**Key Backend Patterns:**
- The Express server serves **dual purposes**: it hosts the API routes (`/api/**`, `/auth/**`) and serves the built Vite frontend as static files.
- **Firebase Auth middleware** (`verifyFirebaseAuth`) validates Firebase ID tokens on protected routes.
- **Internal auth middleware** (`checkInternalAuth`) validates shared secrets or OIDC tokens for internal/cron-triggered endpoints.
- **Token encryption** — OAuth refresh tokens are encrypted with AES-256-CBC before storage in Firestore.

### 4.3 Cloud Functions (Firebase)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `getTribeAudio` | Callable (HTTPS) | On-demand Google Cloud TTS synthesis |
| `getTribeAudioCached` | Callable (HTTPS) | Daily briefing TTS with Firebase Storage caching |
| `onDeleteUser` | Auth trigger (user deletion) | GDPR-compliant data wipe — deletes all user data, family data (if sole member), and subcollections |
| `onSupportTicketCreated` | Firestore trigger (`support_tickets/{ticketId}`) | Creates a private task on the admin dashboard and sends push notification |

**Runtime:** Node.js 22, region `europe-west2`, max 10 instances.

### 4.4 Database (Firestore)

Firestore in Native mode with offline persistence. The data model is family-centric:

```
users/{userId}
  ├── settings/preferences        — Theme, dark mode, notifications, PIN, home area
  ├── settings/integrations       — Google OAuth connection status
  ├── settings/notifications      — FCM tokens, enabled flag
  └── private/billing             — Trial end date, beta tester flag

families/{familyId}
  ├── members/{memberId}          — Name, role, DOB, avatar, allergies, favourites
  ├── tasks/{taskId}              — Title, description, due date, status, subtasks, reminders
  ├── taskCategories/{categoryId} — Custom task categories
  ├── notes/{noteId}              — Freeform notes with colour
  ├── calendarEvents/{eventId}    — Events with times, locations, assignments
  ├── mealPlans/{planId}          — Weekly meal plans
  ├── meals/{mealId}              — Individual meal entries
  ├── recipes/{recipeId}          — Saved family recipes
  ├── shoppingList/{itemId}       — Shopping list items with categories
  ├── briefing/current            — Latest AI-generated daily briefing
  ├── usage/{YYYY-MM-DD}          — Daily AI usage counters
  ├── connectedAccounts/{accId}   — OAuth tokens for email providers (encrypted)
  ├── nearby/{docId}              — Cached nearby recommendations
  ├── preferences/{prefId}        — Family-level preferences
  ├── memories/{memoryId}         — Family memories
  ├── whiteboard/{noteId}         — Temporary shared sticky notes, reminders, and interactive checklists
  ├── quotes/{quoteId}            — Itemised trade quotations, status, line items, and calendar links
  ├── invoices/{invoiceId}        — Billed trade invoices, payment due dates, and BACS bank details
  └── logs/{logId}                — Activity logs

trade_users/{tradeUserId}
  ├── registeredDevices           — Array of active registered devices (max 4 per account)
  └── deviceSwapHistory           — Audit log of device replacements (max 2 per rolling 30-day window)

support_tickets/{ticketId}        — User-submitted support tickets
```

**Security Rules:** Firestore rules enforce family and trade user isolation — users can only access data within their own family and trade records. Quotations and Invoices are strictly scoped to authenticated trade user IDs. Subscription tier and multi-device limits are enforced to protect account integrity.

### 4.5 Hosting & Deployment

| Component | Service | Region |
|-----------|---------|--------|
| **Frontend (Static)** | Firebase Hosting | Global CDN |
| **Backend (API)** | Google Cloud Run | `europe-west2` (London) |
| **Cloud Functions** | Firebase Functions (2nd gen) | `europe-west2` |
| **Database** | Cloud Firestore | Default (auto-selected) |
| **File Storage** | Firebase Storage (`notegeniusfamily.firebasestorage.app`) | Default |
| **Authentication** | Firebase Auth (Google provider) | Global |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | Global |
| **Payments** | Stripe | N/A |

**Deployment Pipeline:**
1. **Cloud Build** (`cloudbuild.yaml`) triggers on push.
2. Builds a multi-stage Docker image (Node 22 slim) — Stage 1 runs `npm run build` (Vite), Stage 2 copies the built `dist/` and server code.
3. Pushes the image to Google Container Registry (`gcr.io/notegeniusfamily/tribe`).
4. Deploys to Cloud Run with environment variables injected from Secret Manager.
5. Automated cleanup removes old container image versions to save storage costs.

**Firebase Hosting Rewrites:**
- `/api/**` → Cloud Run service `tribe` (europe-west2)
- `/auth/**` → Cloud Run service `tribe` (europe-west2)
- `**` → `/index.html` (SPA fallback)

### 4.6 Authentication Flow

1. User clicks "Sign In" → Firebase Auth `signInWithPopup` (Google provider).
2. After Firebase Auth, a **separate OAuth popup** requests the Google Calendar scope via the backend's `/api/auth/url` endpoint.
3. The OAuth callback (`/auth/callback`) exchanges the authorisation code for tokens and posts them back to the opener window via `postMessage`.
4. Tokens are stored in `localStorage` with automatic expiry tracking.
5. **Silent refresh** — A proactive timer schedules token refresh 5 minutes before expiry via the `/api/auth/refresh` endpoint.
6. If the refresh token is unavailable and the user was previously connected, a re-authentication prompt is shown.

### 4.7 External APIs

| API | Purpose |
|-----|---------|
| **Google Calendar API** | Two-way calendar event sync |
| **Google Mail (IMAP over SSL)** | Secure inbox reading via `imap.gmail.com:993` with Google App Passwords |
| **Microsoft Graph API** | Outlook/Hotmail email reading via Modern Authentication (OAuth 2.0) |
| **Yahoo OAuth & IMAP API** | Yahoo/Sky Mail email integration via OAuth and IMAP (`imap.mail.yahoo.com:993`) |
| **Apple Mail (IMAP over SSL)** | Secure inbox reading via `imap.mail.me.com:993` with Apple App-Specific Passwords (@icloud.com) |
| **Google Places API** | Venue lookup and verification for Smart Convert |
| **Open-Meteo API** | Free weather forecast data |
| **Google Cloud Text-to-Speech** | Neural voice audio for briefing read-out |
| **Stripe API** | Subscription management, checkout, webhooks |

---

## 5. Related Architecture & Spin-Offs

- **[Tribe Trade / Small Business Blueprint](file:///c:/GitHub/Tribe/docs/SPINOFF_TRADESPERSON_BLUEPRINT.md)** — Architectural, functional, and integration blueprint for the small business and tradesperson spin-off PWA, detailing shared Firebase infrastructure, namespace isolation, Gemini AI receipt OCR, HMRC self-assessment exports, and mobile ergonomics.

---

*This document reflects the Tribe codebase as of 14 September 2026. It was generated entirely from the live source code without reference to any pre-existing documentation.*
