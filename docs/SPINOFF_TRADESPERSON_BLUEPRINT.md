# Antigravity Master Blueprint: Tribe Trade & Small Business Suite

> **Target Audience:** Google Antigravity Agentic Coding Assistant & Development Engineers  
> **Source Platform:** Tribe (Family Hub PWA) — Shared Infrastructure & Services  
> **Target Spin-off:** Tribe Trade / Tribe Business — Mobile-First Progressive Web App for UK Tradespeople & Small Businesses  
> **Terminology Standard:** Strictly British English (e.g., MOT, van, sort code, BACS, skirting, emulsion, trade counter, Self-Assessment)  
> **Status:** Definitive Architectural & Functional Specification  

---

## 1. Executive Summary & Purpose

### 1.1 The Vision
**Tribe Trade** is a high-contrast, tactile, mobile-first Progressive Web App (PWA) engineered specifically for independent UK tradespeople (painters, decorators, carpenters, builders, plumbers, electricians, landscapers) and micro-business owners.

While mainstream accounting suites (QuickBooks, Xero, ServiceM8, Tradify) are desktop-centric, bloated, complex, and expensive, **Tribe Trade** provides a free, fast, tactile alternative designed to be operated in a van, on a ladder, or on a job site with **dirty hands or work gloves**.

### 1.2 The Spin-off Strategy
The spin-off will be created as a **separate, dedicated codebase** (e.g., in a sibling repository or directory like `TribeBusiness`), but it is engineered to **plug directly into the exact same backend infrastructure, APIs, and Firebase project** as Tribe:
1. **Identical Firebase Project (`notegeniusfamily`):** Reuses Firebase Authentication, Cloud Firestore, Firebase Storage, and Firebase Cloud Messaging (FCM).
2. **Absolute Namespace Isolation:** All tradesperson data is strictly housed under dedicated root collections (`trade_users/{userId}/...`), guaranteeing zero overlap or collision with Tribe's family structures (`families/{familyId}/...`).
3. **Shared Express Backend Architecture (`server.ts`):** Employs the same Cloud Run microservice patterns, rate-limiting, Google OAuth / Calendar synchronisation, Google Places API proxies, and cron-scheduled notification tickers.
4. **Google Gemini AI Integration:** Leverages the same Google Gemini models (`gemini-3.5-flash-lite`) via Firebase AI Logic / Vertex AI for multimodal receipt OCR and quote scope enhancement.
5. **Stripe Billing Engine:** Adopts the same proven 21-day Reverse Trial subscription model and Stripe webhook lifecycle.

---

## 2. Full-Stack System Architecture & Integration

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         TRIBE TRADE CLIENT PWA (Vite + React 19)                 │
│                                                                                  │
│  ┌───────────────────────┐ ┌────────────────────────┐ ┌───────────────────────┐  │
│  │ Morning Brief (Dash)  │ │ Quotes & Invoicing     │ │ Expenses & HMRC Tax   │  │
│  │ - Weather & Road Tax  │ │ - Gemini Scope Polish  │ │ - Gemini Receipt OCR  │  │
│  │ - Deadlines & Profit  │ │ - 1-Tap Invoice + PDF  │ │ - SA103 CSV Export    │  │
│  └───────────────────────┘ └────────────────────────┘ └───────────────────────┘  │
│  ┌───────────────────────┐ ┌────────────────────────┐ ┌───────────────────────┐  │
│  │ The Paint Shed        │ │ Fleet & Compliance     │ │ Trade Counter Nearby  │  │
│  │ - 52px Tactile Step   │ │ - MOT / Service Alert  │ │ - Screwfix/Dulux Near │  │
│  │ - Low Stock Alerts    │ │ - Public Liability Ins │ │ - 1-Tap Google Maps   │  │
│  └───────────────────────┘ └────────────────────────┘ └───────────────────────┘  │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
┌──────────────────────────────────┐            ┌──────────────────────────────────┐
│        FIREBASE PLATFORM         │            │     EXPRESS BACKEND (Cloud Run)  │
│   (Project: notegeniusfamily)    │            │             (server.ts)          │
├──────────────────────────────────┤            ├──────────────────────────────────┤
│ • Firebase Auth                  │            │ • Google Places API Proxy        │
│   (Google, Email/Password, SMS)  │            │   (/api/places/search)           │
│ • Cloud Firestore                │            │ • Google Calendar 2-Way Sync     │
│   (persistentLocalCache offline) │            │   (/api/calendar/events)         │
│ • Firebase Storage               │            │ • Stripe Billing & Webhooks      │
│   (Receipts & PDF Invoices)      │            │   (/api/billing/*)               │
│ • Firebase Cloud Messaging (FCM) │            │ • 1-Minute Reminder Cron Ticker  │
│   (Push alerts for MOT/Invoices) │            │   (/api/internal/process-remind) │
│ • Firebase AI Logic              │            │ • IMAP / OAuth Email Sync        │
│   (gemini-3.5-flash-lite)        │            │   (Client job inquiry intake)    │
└──────────────────────────────────┘            └──────────────────────────────────┘
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │
                                         ▼
                        ┌──────────────────────────────────┐
                        │        EXTERNAL CLOUD APIS       │
                        ├──────────────────────────────────┤
                        │ • Google Gemini AI (Vertex AI)   │
                        │ • Google Calendar API            │
                        │ • Google Places API (New)        │
                        │ • Open-Meteo Weather API         │
                        │ • Stripe Payment Platform        │
                        └──────────────────────────────────┘
```

---

## 3. Tribe Feature Extraction & Tradesperson Translation Matrix

Every single capability in the Tribe codebase maps directly to a high-utility tradesperson or small business equivalent:

| Tribe Family Hub Feature | Tribe Implementation | Tradesperson Business Suite Translation | Tradesperson Implementation |
| :--- | :--- | :--- | :--- |
| **Dashboard ("Hub")** | 6 AM Daily briefing, family whiteboard, dinner & grocery card, weather widget, guided tour. | **"The Morning Brief"** | Financial summary (income vs. expense), weather forecast (crucial for outdoor trade), urgent compliance countdowns (MOT, insurance), overdue unpaid invoices, low-stock supplier trip alerts. |
| **Family Whiteboard** | Shared temporary household notices with push notification triggers. | **Job Site Scratchpad** | Quick site notes, gate codes, customer lockbox combinations, parking restrictions, urgent snagging items. |
| **Shared Calendar** | Family events, school terms, member tags, 2-way Google Calendar sync. | **Job & Site Visit Diary** | Customer bookings, quote appointments, job duration blocks, site addresses with 1-tap Google Maps route navigation, 2-way sync with Google Calendar. |
| **Tasks & Chores** | Household tasks, subtasks, assignment to kids/adults, categories, reminders. | **Job Milestones & Snagging** | Structured stage checklists per job (e.g. *Prep & Sand*, *Misting Coat*, *Finish Coats*, *Snagging Inspection*), procurement tasks, subcontractor tasks. |
| **Meal Planner & Recipes** | Weekly dinner scheduling, AI ingredient extraction, step-by-step cooking steps. | **Scope & Labour Estimator** | Itemised job estimates, labour hours, material breakdown, AI-assisted trade job descriptions from shorthand notes. |
| **Pantry Photo Analysis** | Gemini multimodal fridge/cupboard scan for recipe generation. | **Snap Stock & Van Inventory** | Photograph shelves in the van or workshop to identify tools, spare fittings, paint tins, and generate re-order lists. |
| **Shopping List** | Supermarket aisle grouping, bulk-add normalisation. | **Merchant Pick List** | Organised shopping list grouped by supplier (*Screwfix*, *Toolstation*, *Dulux Decorator Centre*, *Travis Perkins*) with 1-tap bulk entry. |
| **Smart Capture** | Text/image parser for tasks, events, and shopping items. | **"Snap Receipt" & Job Intake** | 1) Direct camera capture extracting merchant, date, amount, VAT, and HMRC expense category via Gemini.<br>2) Text intake turning customer WhatsApps/SMS into formal quotes. |
| **Smart Convert** | Deep "Plan of Attack" generator with Google Places lookup. | **Quote-to-Invoice Converter** | 1-tap conversion of accepted quotes into formal VAT-ready invoices with sequential numbering and A4 printable stylesheets. |
| **Nearby Activity Discovery** | 5-point compass search for family venues within 15–50 miles. | **Trade Counter Locator** | Locates closest trade suppliers (plumbing merchants, timber yards, paint centres, hire shops) with live opening hours and driving times. |
| **Unified Email Hub** | Multi-provider IMAP & OAuth inbox (Gmail, Outlook, Yahoo, iCloud). | **Client Inquiry Inbox** | Centralised client inquiry mailbox. Automatically detects incoming job requests and feeds them into Quote drafts. |
| **Voice Services ("Magic Mic")** | Web Speech API speech-to-text chat + Cloud TTS audio readout. | **Hands-Free Van Dictation** | Speak job notes, log fuel expenses, or draft quotes hands-free while driving between jobs; listen to the Morning Brief aloud. |
| **Push Notifications & Reminders** | 1-minute cron ticker, FCM alerts for overdue tasks and calendar events. | **Compliance & Chasing Ticker** | Automatic push alerts for unpaid customer invoices (7/14 days overdue) and van MOT / Insurance expiries within 30 days. |
| **Monetisation & Subscriptions** | 21-day Reverse Trial, Stripe monthly/yearly plans, usage quotas. | **Solo Trader Subscription** | 21-day Reverse Trial $\rightarrow$ Solo Trader Plan (£7.95/mo or £79/yr). Gates unlimited AI receipt scans and automated invoice chasing. |

---

## 4. Detailed Module Specifications

### 4.1 Module 1: Dashboard & Alerts ("The Morning Brief")
- **Header & Weather Bar:** Displays current date, tradesperson's business name, and local 5-day weather forecast (temperature, rain probability, wind speed via Open-Meteo). Exterior tradespeople immediately know if outdoor painting or roofing is viable today.
- **Monthly Cashflow Overview:**
  - **Cleared Income:** Sum of all paid invoices in the current calendar month.
  - **Logged Expenses:** Sum of all deductible business expenses in the current month.
  - **Net Profit & Margin:** Automatically calculated (`Income - Expenses`) with profit margin percentage.
- **Dynamic Action Banner:** Highlights items requiring immediate attention:
  - Red / Amber alert if Van MOT or Insurance expires within 30 days (shows vehicle registration).
  - Amber alert if any customer invoice is overdue (with total overdue amount).
  - Blue alert if The Paint Shed has $\ge 1$ item below minimum stock threshold.
- **Tactile Quick Action Bar:**
  - **Snap Receipt:** Opens mobile camera directly to photograph a material/fuel receipt.
  - **Draft Quote:** Opens rapid quote builder.
  - **Log Expense:** Fast manual expense entry.
  - **The Paint Shed:** 1-tap jump to material inventory.

### 4.2 Module 2: Quotes & Invoicing ("The Money Maker")
- **Quote Creation & Drafting:**
  - Client contact details: Name, phone, email, job site address.
  - Informal Job Notes: A text area where the tradesperson types rough shorthand (e.g., *"prep hallway walls 2 coats matt undercoat gloss skirting"*).
  - **Gemini AI Description Enhancer:** Tap **"AI Polish"** to send informal notes to Gemini, returning a polished, professional, client-facing scope of work:
    > *"Full surface preparation of hallway walls including filling minor indentations and spot priming. Application of two coats of premium vinyl matt emulsion to wall areas. Sanding, undercoating, and finish gloss application to all skirting boards and woodwork."*
  - Itemised Pricing: Line items for Labour, Materials, and Fixed Hire Costs with unit rates and quantities.
- **1-Tap Quote-to-Invoice Conversion:**
  - When the client accepts, tapping **"Convert to Invoice"** automatically creates an invoice document with status `Sent`, assigning a sequential invoice number (e.g. `INV-1042`), setting payment terms (e.g. 14 days), and copying all client and pricing data.
- **Clean A4 Print-to-PDF Stylesheet:**
  - Optimized `@media print` CSS. When the user taps **"Print / PDF"**, the browser print dialog opens formatting an immaculate A4 page:
    - Business header (Business Name, Trading Address, Phone, Email, VAT number).
    - Client header and Job site address.
    - Itemised table of works with subtotals, VAT (if applicable), and total due.
    - **BACS Payment Details:** Bank Name, Account Name, Sort Code, and Account Number clearly framed.
    - Payment Terms and due date.
    - Hides all mobile buttons, navigation bars, headers, and tabs.

### 4.3 Module 3: Income, Expenses & HMRC Self-Assessment ("The QuickBooks Alternative")
- **Financial Ledger:**
  - Chronological list of all expenses and income entries with search and category filtering.
  - Categories strictly aligned with UK HMRC Self-Assessment (SA103):
    1. *Materials & Stock* (Cost of sales)
    2. *Vehicle & Fuel* (Van insurance, fuel, servicing, parking)
    3. *Tools & Workwear* (Power tools, hand tools, PPE, safety boots)
    4. *Subcontractor Labour*
    5. *Insurance, Phone & Admin* (Public liability, mobile phone, trade union fees)
- **"Snap Receipt" with Gemini AI OCR:**
  - Camera launch button configured with `<input type="file" accept="image/*" capture="environment">`.
  - Image is uploaded to Firebase Storage under `trade_users/{userId}/receipts/{expenseId}.jpg`.
  - Gemini 3.5 Flash processes the image payload with a structured prompt extracting:
    - **Merchant/Vendor Name:** e.g., *"Screwfix"*, *"Travis Perkins"*, *"Shell"*.
    - **Transaction Date:** Formatted as `YYYY-MM-DD`.
    - **Total Amount:** Decimal GBP.
    - **VAT Amount:** Decimal GBP (or 0 if zero-rated).
    - **HMRC Category:** Automatically classified based on vendor and items.
  - Pre-fills the expense modal so the tradesperson only needs to tap **"Confirm & Save"**.
- **HMRC Self-Assessment CSV Export:**
  - Computes standard UK tax year boundaries (6 April of year $N$ to 5 April of year $N+1$).
  - Groups deductions into HMRC SA103 standard reporting boxes:
    - **Box 9:** Turnover (Total invoice income received).
    - **Box 11:** Cost of goods bought for resale or goods used (Materials).
    - **Box 12:** Car, van and travel expenses.
    - **Box 14:** Rent, rates, power and insurance costs.
    - **Box 15:** Repairs and maintenance of property and equipment.
    - **Box 16:** Phone, fax, stationery and other office costs.
  - Generates a downloadable `.csv` file ready to upload to HMRC or forward to an accountant.

### 4.4 Module 4: The Paint Shed (Inventory & Materials)
- **Stock Tracking:**
  - Fast list of core trade consumables (paints, primers, rollers, tape, sealants, copper pipe, cable clips).
  - Attributes: Name, Category, Current Quantity, Unit (e.g. *5L Tins*, *Rolls*, *Boxes*, *Lengths*), Minimum Threshold.
- **Tactile Steppers:**
  - Minimum **52px touch buttons** (`−` and `+`) spaced generously for operation with dirty hands or work gloves.
  - Immediate local state mutation with debounced Firestore sync.
- **Low Stock Threshold Alert:**
  - When quantity drops $\le$ minimum threshold, a prominent **"LOW STOCK"** badge appears.
  - Global stock counter on the Morning Brief updates in real-time, prompting a trip to the trade counter.

### 4.5 Module 5: Fleet & Compliance (Van & Insurance)
- **Vehicle Details & UK Plate Styling:**
  - Registration number displayed in authentic UK front-plate yellow/white badge formatting.
- **Tracked Compliance Dates:**
  1. **Van MOT Expiry Date**
  2. **Next Van Service Due Date**
  3. **Van Insurance Policy Expiry Date**
  4. **Public Liability Insurance Expiry Date** (£2M / £5M / £10M policy)
  5. **Upper Tier Waste Carrier Licence Expiry Date** (Environment Agency registration)
- **Dynamic Countdown Calculation:**
  - $> 30$ days remaining: **Green** (Compliant).
  - $8$ to $30$ days remaining: **Amber** (Promoted to Morning Brief banner).
  - $\le 7$ days or Expired: **Critical Red** (Urgent banner + push notification).

### 4.6 Module 6: Trade Counter Locator ("Nearby Trade")
- Reuses Tribe's `/api/places/search` server proxy to query Google Places API (New).
- Searches for nearby builders' merchants, decorators' centres, and electrical/plumbing suppliers within 5, 10, or 20 miles:
  - *Screwfix*, *Toolstation*, *Dulux Decorator Centre*, *Crown Decorating Centre*, *Brewers*, *Travis Perkins*, *Selco*, *Jewson*, *City Plumbing*, *CEF*.
- Displays exact mileage, rating, whether currently open (crucial for 7:00 AM emergency pick-ups), and a **1-tap Google Maps directions link**.

---

## 5. Cloud Firestore Schema Specification

All collections are strictly isolated under the authenticated business user (`trade_users/{userId}`):

```
trade_users/{userId}
  ├── profile/business               # Business details, VAT, bank account, BACS
  ├── quotes/{quoteId}               # Customer quotes with itemised lines & AI descriptions
  ├── invoices/{invoiceId}           # Official invoices with status & payment tracking
  ├── expenses/{expenseId}           # Logged expenses, receipt URLs, HMRC categories
  ├── stock/{stockId}                # Materials, quantities, units, low-stock thresholds
  ├── compliance/fleet               # Van reg, MOT, service, insurance, waste licence
  ├── clients/{clientId}             # Customer directory (names, phones, site addresses)
  └── usage/{YYYY-MM-DD}             # Daily AI usage counters (receipt scans, quote polish)
```

### 5.1 TypeScript Type Definitions (`src/types/trade.ts`)

```typescript
export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Converted';
export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';
export type ExpenseCategory = 
  | 'Materials' 
  | 'Tools & Equipment' 
  | 'Vehicle & Fuel' 
  | 'Subcontractor' 
  | 'Insurance & Admin' 
  | 'Other';

export interface BusinessProfile {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  bankDetails: {
    bankName: string;
    accountName: string;
    sortCode: string;       // e.g. "20-45-77"
    accountNumber: string;  // e.g. "83920182"
  };
  vatRegistered: boolean;
  vatNumber?: string;       // e.g. "GB 123 4567 89"
  defaultPaymentTermsDays: number; // e.g. 14
}

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitRate: number;
  total: number;
}

export interface TradeQuote {
  id?: string;
  quoteNumber: string;      // e.g. "Q-1001"
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  jobAddress: string;
  rawJobNotes: string;      // Informal notes typed by tradesperson
  jobDescription: string;   // AI-polished client-facing scope
  items: QuoteLineItem[];
  estimatedTotal: number;
  status: QuoteStatus;
  createdAt: any;           // Firestore Timestamp
  validUntil: any;          // Firestore Timestamp
}

export interface TradeInvoice {
  id?: string;
  invoiceNumber: string;    // e.g. "INV-1001"
  quoteId?: string;         // Reference if converted from quote
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  jobAddress: string;
  jobDescription: string;
  items: QuoteLineItem[];
  subtotal: number;
  vatRate: number;          // 0 or 20 (%)
  vatAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  issueDate: string;        // YYYY-MM-DD
  dueDate: string;          // YYYY-MM-DD
  paidDate?: string;        // YYYY-MM-DD
  createdAt: any;
}

export interface TradeExpense {
  id?: string;
  date: string;             // YYYY-MM-DD
  vendor: string;           // e.g. "Screwfix", "Shell"
  category: ExpenseCategory;
  totalAmount: number;
  vatAmount: number;
  notes?: string;
  receiptImageUrl?: string; // Firebase Storage URL
  parsedByAi: boolean;
  taxYear: string;          // e.g. "2025/2026"
  createdAt: any;
}

export interface TradeStockItem {
  id?: string;
  name: string;             // e.g. "Dulux Trade Vinyl Matt Pure Brilliant White 5L"
  category: 'Paint' | 'Primer' | 'Brushes & Rollers' | 'Prep & Tape' | 'Sundries';
  quantity: number;
  unit: string;             // e.g. "Tins (5L)", "Rolls", "Boxes"
  minThreshold: number;     // Triggers alert when quantity <= minThreshold
  supplier?: string;        // e.g. "Dulux Decorator Centre"
  updatedAt: any;
}

export interface FleetCompliance {
  vanReg: string;           // e.g. "VK21 WXK"
  motExpiry: string;        // YYYY-MM-DD
  serviceDue: string;       // YYYY-MM-DD
  vanInsuranceExpiry: string; // YYYY-MM-DD
  publicLiabilityExpiry: string; // YYYY-MM-DD
  wasteCarrierLicenceExpiry?: string; // YYYY-MM-DD
  updatedAt: any;
}
```

---

## 6. Firebase Configuration & Security Rules

### 6.1 Client Initialization (`src/lib/firebase.ts`)
The spin-off reuses the existing `firebase-applet-config.json` or `.env` configuration from the parent Tribe project, including offline-first caching via `persistentLocalCache`:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

// Cost-effective & offline-first persistence for van job sites
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export default app;
```

### 6.2 Firestore Security Rules (`firestore.rules`)
Add the dedicated `trade_users` branch to your Firestore rules to guarantee complete isolation from family documents:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // ─── TRIBE TRADE / BUSINESS ISOLATED NAMESPACE ──────────────────
    match /trade_users/{userId} {
      allow read, write: if isOwner(userId);

      match /profile/{docId} {
        allow read, write: if isOwner(userId);
      }

      match /quotes/{quoteId} {
        allow read, write: if isOwner(userId);
      }

      match /invoices/{invoiceId} {
        allow read, write: if isOwner(userId);
      }

      match /expenses/{expenseId} {
        allow read, write: if isOwner(userId);
      }

      match /stock/{stockId} {
        allow read, write: if isOwner(userId);
      }

      match /compliance/{docId} {
        allow read, write: if isOwner(userId);
      }

      match /clients/{clientId} {
        allow read, write: if isOwner(userId);
      }

      match /usage/{date} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

### 6.3 Firebase Storage Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /trade_users/{userId}/receipts/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId
                         && request.resource.size < 10 * 1024 * 1024
                         && request.resource.contentType.matches('image/.*');
    }
  }
}
```

---

## 7. AI Services Integration (Google Gemini)

### 7.1 Receipt OCR Service (`src/services/geminiReceiptService.ts`)
Uses Gemini 3.5 Flash Multimodal vision to extract financial and merchant details from a snapped receipt photo:

import { getGenerativeModel } from "firebase/ai";
import { googleAI, FLASH_3_5_LITE } from "./ai/aiUtils";

export interface ParsedReceipt {
  vendor: string;
  date: string;
  totalAmount: number;
  vatAmount: number;
  category: string;
}

export async function parseReceiptWithGemini(base64Image: string, mimeType: string = "image/jpeg"): Promise<ParsedReceipt> {
  const prompt = `You are a UK tradesperson accounting assistant. Analyze this photo of a trade/fuel receipt or merchant invoice.
Extract the following information and return ONLY a valid JSON object:
{
  "vendor": "Merchant name (e.g. Screwfix, Toolstation, Dulux Decorator Centre, Shell, B&Q)",
  "date": "Transaction date formatted as YYYY-MM-DD (if year is missing or 2-digit, use 2026)",
  "totalAmount": 0.00 (Total gross amount paid in GBP, decimal number only),
  "vatAmount": 0.00 (VAT amount in GBP if shown, otherwise 0.00),
  "category": "One of: 'Materials' | 'Tools & Equipment' | 'Vehicle & Fuel' | 'Subcontractor' | 'Insurance & Admin' | 'Other'"
}
Strict Rules:
- If unreadable, return reasonable estimates or empty string for vendor.
- Do not output markdown code blocks, just raw JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  const text = response.text || "{}";
  return JSON.parse(text);
}
```

### 7.2 Quote Scope Enhancer (`src/services/geminiQuoteService.ts`)
Takes rough job notes and produces professional, client-facing specifications:

import { getGenerativeModel } from "firebase/ai";
import { googleAI, FLASH_3_5_LITE } from "./ai/aiUtils";

export async function polishJobScopeWithGemini(rawNotes: string, tradeType: string = "Painter & Decorator"): Promise<string> {
  const prompt = `You are an expert UK ${tradeType}. Transform the following shorthand job notes into a clear, professional, client-facing scope of work for a formal quotation:
Notes: "${rawNotes}"

Rules:
- Strictly British English trade terminology (e.g., 'undercoat', 'mist coat', 'emulsion', 'skirting boards', 'architraves').
- Professional, reassuring, and concise (2-4 sentences or bullet points).
- Describe surface preparation, coating process, and cleanup.
- Return plain text only.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
    config: { temperature: 0.4 }
  });

  return response.text?.trim() || rawNotes;
}
```

---

## 8. HMRC Self-Assessment CSV Generator

UK tradespeople must file their Self-Assessment tax return (SA103 form). This service exports transactions grouped into HMRC categories:

```typescript
// src/services/exportService.ts
import { TradeExpense, TradeInvoice } from '../types/trade';

export function exportHMRCSelfAssessmentCSV(
  taxYear: string, // e.g. "2025/2026"
  invoices: TradeInvoice[],
  expenses: TradeExpense[]
): void {
  // Filter for paid invoices and expenses within the target tax year
  const paidInvoices = invoices.filter(inv => inv.status === 'Paid');
  const turnover = paidInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Group expenses by HMRC SA103 Box categories
  let box11_materials = 0;
  let box12_vehicle = 0;
  let box14_insurance = 0;
  let box15_tools = 0;
  let box16_admin = 0;

  expenses.forEach(exp => {
    switch (exp.category) {
      case 'Materials':
        box11_materials += exp.totalAmount;
        break;
      case 'Vehicle & Fuel':
        box12_vehicle += exp.totalAmount;
        break;
      case 'Insurance & Admin':
        box14_insurance += exp.totalAmount;
        break;
      case 'Tools & Equipment':
        box15_tools += exp.totalAmount;
        break;
      default:
        box16_admin += exp.totalAmount;
        break;
    }
  });

  const totalAllowableExpenses = box11_materials + box12_vehicle + box14_insurance + box15_tools + box16_admin;
  const netBusinessProfit = turnover - totalAllowableExpenses;

  const rows = [
    ['HMRC SELF-ASSESSMENT (SA103) EXPENSE SUMMARY', ''],
    ['Tax Year', taxYear],
    ['Generated Date', new Date().toLocaleDateString('en-GB')],
    ['', ''],
    ['HMRC SA103 Category', 'Amount (GBP)'],
    ['Box 9: Turnover / Total Gross Income', turnover.toFixed(2)],
    ['Box 11: Cost of Sales / Materials & Consumables', box11_materials.toFixed(2)],
    ['Box 12: Van Expenses, Fuel, Servicing & Travel', box12_vehicle.toFixed(2)],
    ['Box 14: Public Liability & Business Insurance', box14_insurance.toFixed(2)],
    ['Box 15: Tools, Equipment Repairs & Maintenance', box15_tools.toFixed(2)],
    ['Box 16: Phone, Stationery & Admin Costs', box16_admin.toFixed(2)],
    ['', ''],
    ['TOTAL ALLOWABLE EXPENSES', totalAllowableExpenses.toFixed(2)],
    ['NET TAXABLE PROFIT', netBusinessProfit.toFixed(2)],
    ['', ''],
    ['ITEMISED EXPENSE TRANSACTIONS', '', '', '', ''],
    ['Date', 'Vendor', 'Category', 'Total (GBP)', 'VAT (GBP)', 'Notes']
  ];

  expenses.forEach(exp => {
    rows.push([
      exp.date,
      `"${exp.vendor.replace(/"/g, '""')}"`,
      exp.category,
      exp.totalAmount.toFixed(2),
      exp.vatAmount.toFixed(2),
      `"${(exp.notes || '').replace(/"/g, '""')}"`
    ]);
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `HMRC_Tax_Return_${taxYear.replace('/', '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

---

## 9. UI/UX Design System & Touch Ergonomics

### 9.1 The "Dirty Hands & Work Gloves" Ergonomic Standard
- **Minimum Touch Target:** 48px to 56px height for all interactive buttons.
- **Steppers:** Minimum 52px $\times$ 52px square with bold `+` / `−` typography.
- **Card Spacing:** 16px padding on mobile screens with rounded-2xl cards.
- **Bottom Navigation Bar:** Fixed bottom bar with 4 primary tabs:
  1. **Dashboard** (Briefing, cashflow, alerts)
  2. **Invoices** (Quotes & invoices list, create quote)
  3. **Expenses** (Ledger, snap receipt, HMRC export)
  4. **The Paint Shed** (Stock stepper list)
  - **Persistent Floating Button:** `+ Snap Receipt` floating action accessible from any view.

### 9.2 Industrial High-Contrast Colour Palette
```css
:root {
  --bg-primary: #090d16;        /* Deep Midnight Slate */
  --bg-surface: #1e293b;        /* Surface Card Slate */
  --bg-surface-elevated: #334155;
  --accent-amber: #f59e0b;      /* Trade High-Vis Safety Amber */
  --accent-amber-hover: #d97706;
  --accent-emerald: #10b981;    /* Cleared Income & Compliance Green */
  --accent-rose: #ef4444;       /* MOT / Overdue Warning Red */
  --text-primary: #f8fafc;      /* Pure High-Contrast White */
  --text-secondary: #94a3b8;    /* Muted Slate Gray */
}
```

### 9.3 Clean A4 Print-to-PDF Stylesheet (`src/index.css`)
```css
@media print {
  body {
    background: white !important;
    color: black !important;
  }

  /* Hide mobile UI components */
  nav, header, button, .no-print, [role="navigation"] {
    display: none !important;
  }

  /* Format A4 invoice container */
  .printable-invoice {
    display: block !important;
    width: 100% !important;
    max-width: 210mm !important;
    margin: 0 auto !important;
    padding: 20mm !important;
    box-shadow: none !important;
    background: white !important;
    color: black !important;
  }

  .printable-invoice table {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  .printable-invoice th, .printable-invoice td {
    border-bottom: 1px solid #e2e8f0 !important;
    padding: 8px 4px !important;
    text-align: left !important;
  }

  .printable-invoice .bacs-details-box {
    border: 2px solid #0f172a !important;
    background: #f8fafc !important;
    padding: 12px !important;
    margin-top: 24px !important;
  }
}
```

---

## 10. Step-by-Step Antigravity Implementation Guide

When Antigravity opens the new spin-off repository (e.g. `c:\GitHub\TribeBusiness`), execute the implementation in the following disciplined phases:

### Phase 1: Foundation & Dependencies
1. Run `npx -y create-vite@latest ./ --template react-ts` (or initialize `package.json` with React 19 and Tailwind CSS v4).
2. Install exact dependencies matching Tribe:
   - `firebase@^12.12.0`
   - `lucide-react@^0.546.0`
   - `date-fns@^4.1.0`
   - `clsx@^2.1.1`
   - `tailwind-merge@^3.5.0`
   - `@google/genai@^1.49.0`
   - `tailwindcss@^4.2.2` and `@tailwindcss/vite@^4.2.2`
3. Copy `firebase-applet-config.json` into the root directory.
4. Setup `src/lib/firebase.ts` with `persistentLocalCache` and `persistentMultipleTabManager`.

### Phase 2: Design System & Mobile Navigation Shell
1. Configure `src/index.css` with industrial slate/amber tokens, minimum 48px touch rules, and `@media print` rules.
2. Build `src/components/layout/BottomNav.tsx` with high-touch tabs (`Dashboard`, `Invoices`, `Expenses`, `Stock`) and fixed floating `+ Snap` receipt trigger.
3. Build `src/components/layout/Header.tsx` displaying business name, current date, and active compliance badges.

### Phase 3: Core Data Context & Offline Sync
1. Create `src/context/TradeDataContext.tsx`:
   - Listens via `onSnapshot` to `trade_users/{userId}/quotes`, `invoices`, `expenses`, `stock`, and `compliance`.
   - Exposes reactive state, optimistic updates, and offline fallback handlers.
   - Provides helper methods: `saveQuote`, `convertQuoteToInvoice`, `saveExpense`, `updateStockQuantity`, `updateCompliance`.

### Phase 4: Module Implementation
1. **Dashboard:** Build `MorningBrief.tsx`, `CashflowCard.tsx`, `DeadlineAlertBanner.tsx`, and `QuickActions.tsx`.
2. **Invoices & Quotes:** Build `QuoteList.tsx`, `QuoteFormModal.tsx` (with Gemini Polish), `InvoiceList.tsx`, and `PrintInvoiceView.tsx`.
3. **Expenses & HMRC:** Build `ExpenseLedger.tsx`, `SnapReceiptModal.tsx` (camera trigger + Gemini OCR parser), and `ExportTaxModal.tsx`.
4. **The Paint Shed:** Build `StockList.tsx`, `StockCard.tsx`, and `QuantityStepper.tsx` (52px buttons).
5. **Fleet & Compliance:** Build `ComplianceSettingsModal.tsx` with UK yellow-badge plate styling and countdown calculations.

### Phase 5: PWA Service Worker & Manifest
1. Configure `public/manifest.json` with:
   - `display: "standalone"`
   - `theme_color: "#090d16"`
   - `background_color: "#090d16"`
   - High-contrast icons (`icon-192.png`, `icon-512.png`).
2. Register the service worker in `src/main.tsx` for full offline asset caching.

### Phase 6: Build Verification
1. Run `npm run build` to confirm zero TypeScript compilation errors and bundle optimization.
2. Verify mobile viewport layouts (412px $\times$ 915px) for tactile button accessibility and print-to-PDF formatting.

---

## 11. Verification Checklist for Antigravity

Before marking the spin-off build complete, Antigravity must verify:
- [ ] **Data Isolation:** All Firestore reads/writes strictly target `trade_users/{userId}/...` and never `families/...`.
- [ ] **Offline Resilience:** App loads and navigates cleanly when disconnected from the internet, leveraging Firestore's `persistentLocalCache`.
- [ ] **Touch Standards:** Touch targets across steppers, tabs, and action buttons meet or exceed the 48px–56px threshold.
- [ ] **Receipt Vision OCR:** Snapped receipt images upload to `trade_users/{userId}/receipts/` and populate vendor, date, total, VAT, and category via Gemini.
- [ ] **Quote AI Scope:** Shorthand job notes polish into professional client descriptions via Gemini 3.5 Flash.
- [ ] **Clean A4 PDF Export:** Printing an invoice displays clean black-on-white formatting with BACS bank details, hiding all mobile navigation.
- [ ] **HMRC CSV Export:** Generates standard UK tax year CSV file with correct SA103 boxes (Box 9, Box 11, Box 12, Box 14, Box 15, Box 16).
- [ ] **British English Compliance:** All labels, prompts, and sample data strictly use British English ("MOT", "Van", "BACS", "Sort Code", "Skirting", "Emulsion").
