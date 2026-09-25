import dotenv from "dotenv";
dotenv.config();

import express from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { calendar as googleCalendar } from "@googleapis/calendar";
import path from "path";
import cron from "node-cron";
import fs from "fs";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe: Stripe | null = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Modern Modular Imports
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { encryptToken, decryptToken } from "./src/utils/encryption.js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Initialize Firebase Admin cleanly
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(), // Clean, modern entry point
    projectId: "tribetrader"
  });
}
const db = getFirestore();
const messaging = getMessaging();
const auth = getAuth();

const app = express();
app.set("trust proxy", 1);

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString("utf-8");
  }
}));

// Priority 1 Rate Limiting: 100 requests per minute per IP across /api/** routes (excluding Stripe webhooks)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Enforce maximum 100 requests per minute per IP address
  statusCode: 429, // Explicit 429 Too Many Requests status code
  message: { error: "Too Many Requests: Rate limit exceeded. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: express.Request) => {
    return req.originalUrl === "/api/billing/webhook" || req.path === "/billing/webhook";
  }
});

app.use("/api", apiLimiter);

/**
 * NEARBY SPECIFIC SEARCH ROUTE (Phase 1)
 * Accepts searchQuery, lat, lng, radius, timeframe from frontend.
 * Calls Google Places API (New) Text Search with strict low-cost FieldMask.
 * Returns raw JSON array of verified local venues.
 */
app.post("/api/nearby-specific", async (req: express.Request, res: express.Response) => {
  try {
    const { searchQuery, lat, lng, radius, timeframe } = req.body;

    if (!searchQuery || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Missing required parameters: searchQuery, lat, and lng are required." });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error("[Nearby Specific] Missing Google Places API Key");
      return res.status(500).json({ error: "Server configuration error: missing Google Places API key." });
    }

    // Radius in meters: if radius is given in miles (e.g. 15), convert to meters (capped at 50,000m)
    const numericRadius = Number(radius) || 15;
    const radiusMeters = numericRadius > 100 ? Math.min(numericRadius, 50000) : Math.min(Math.round(numericRadius * 1609.34), 50000);

    const placesEndpoint = "https://places.googleapis.com/v1/places:searchText";
    const fieldMask = "places.id,places.displayName,places.location,places.rating,places.types,places.formattedAddress,places.regularOpeningHours.weekdayDescriptions,places.primaryType,places.primaryTypeDisplayName";

    const response = await fetch(placesEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        locationBias: {
          circle: {
            center: {
              latitude: Number(lat),
              longitude: Number(lng)
            },
            radius: radiusMeters
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Nearby Specific] Google Places API (New) error:", response.status, errorText);
      return res.status(response.status).json({ error: "Google Places API call failed.", details: errorText });
    }

    const data = await response.json();
    const rawPlaces = Array.isArray(data.places) ? data.places : [];

    return res.json({
      success: true,
      places: rawPlaces,
      timeframe: timeframe || "this weekend"
    });
  } catch (error: any) {
    console.error("[Nearby Specific] Error handling request:", error);
    return res.status(500).json({ error: "Internal server error performing nearby search." });
  }
});

/**
 * NEARBY DISCOVER ROUTE (Phase 2)
 * Implements 5-Point Compass Grid search strategy to find general family attractions across a wider radius.
 * Performs 5 concurrent calls to Google Places API (New) Text Search for Center, North, South, East, West.
 * Deduplicates overlapping venues, randomizes via Fisher-Yates shuffle, and caps results at top 35.
 */
app.post("/api/nearby-discover", async (req: express.Request, res: express.Response) => {
  try {
    const { lat, lng, radius, familyContext } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Missing required parameters: lat and lng are required." });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error("[Nearby Discover] Missing Google Places API Key");
      return res.status(500).json({ error: "Server configuration error: missing Google Places API key." });
    }

    const baseRadiusMiles = Number(radius) || 50;
    const halfRadiusMiles = baseRadiusMiles / 2;

    // Convert half radius to meters (capped at 50,000 meters per API constraints)
    const subRadiusMeters = Math.min(Math.max(Math.round(halfRadiusMiles * 1609.34), 100), 50000);

    // Calculate 4 cardinal offset points at radius / 2 distance
    const centerLat = Number(lat);
    const centerLng = Number(lng);
    const latOffset = halfRadiusMiles / 69.0;
    const lngOffset = halfRadiusMiles / (69.0 * Math.cos((centerLat * Math.PI) / 180));

    const gridPoints = [
      { name: "Center", lat: centerLat, lng: centerLng },
      { name: "North", lat: centerLat + latOffset, lng: centerLng },
      { name: "South", lat: centerLat - latOffset, lng: centerLng },
      { name: "East", lat: centerLat, lng: centerLng + lngOffset },
      { name: "West", lat: centerLat, lng: centerLng - lngOffset }
    ];

    const placesEndpoint = "https://places.googleapis.com/v1/places:searchText";
    const fieldMask = "places.id,places.displayName,places.location,places.rating,places.types,places.formattedAddress,places.regularOpeningHours.weekdayDescriptions,places.primaryType,places.primaryTypeDisplayName";

    // Fire 5 concurrent requests using Promise.all
    const requests = gridPoints.map((point) =>
      fetch(placesEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask
        },
        body: JSON.stringify({
          textQuery: "family attractions venues activities",
          locationBias: {
            circle: {
              center: {
                latitude: point.lat,
                longitude: point.lng
              },
              radius: subRadiusMeters
            }
          }
        })
      }).then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.places) ? data.places : [];
      }).catch((err) => {
        console.warn(`[Nearby Discover] Call for point ${point.name} failed:`, err);
        return [];
      })
    );

    const results = await Promise.all(requests);
    const masterList = results.flat();

    // Deduplicate venues by Place ID or unique title/address
    const seen = new Set<string>();
    const uniquePlaces: any[] = [];

    for (const p of masterList) {
      const idKey = p.id || `${p.displayName?.text || ""}_${p.formattedAddress || ""}`;
      if (idKey && !seen.has(idKey)) {
        seen.add(idKey);
        uniquePlaces.push(p);
      }
    }

    // Fisher-Yates shuffle algorithm to randomize array
    for (let i = uniquePlaces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniquePlaces[i], uniquePlaces[j]] = [uniquePlaces[j], uniquePlaces[i]];
    }

    // Slice top 35 venues
    const slicedPlaces = uniquePlaces.slice(0, 35);

    return res.json({
      success: true,
      places: slicedPlaces,
      familyContext: familyContext || ""
    });
  } catch (error: any) {
    console.error("[Nearby Discover] Error handling request:", error);
    return res.status(500).json({ error: "Internal server error performing discover search." });
  }
});

const PORT = process.env.PORT || 8080;
const APP_URL = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://tribetrader.web.app' : `http://localhost:${PORT}`);

// Use Vertex AI backend with Application Default Credentials (ADC).
let ai: GoogleGenAI | null = null;
try {
  ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || 'tribetrader',
    location: 'europe-west2',
  });
} catch (aiErr) {
  console.warn("[Vertex AI] Could not initialize GoogleGenAI:", aiErr);
}

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID?.trim(),
  process.env.GOOGLE_CLIENT_SECRET?.trim(),
  `${APP_URL}/auth/callback`
);

const checkInternalAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token format" });
  }
  const token = authHeader.split(" ")[1];

  const sharedSecret = process.env.INTERNAL_SHARED_SECRET;
  let isAuthorized = false;

  if (sharedSecret && token === sharedSecret) {
    isAuthorized = true;
  } else {
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: token,
      });
      const payload = ticket.getPayload();
      if (payload && (payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com')) {
        isAuthorized = true;
      }
    } catch (err) {
      console.warn("[Auth] OIDC validation failed:", err);
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({ error: "Forbidden: Invalid authorization credentials" });
  }

  next();
};

// Firebase Auth Verification Middleware
const verifyFirebaseAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const tradeUserId = userDoc.exists ? (userDoc.data()?.tradeUserId || `family_${uid}`) : `family_${uid}`;

    (req as any).user = {
      uid,
      email: decodedToken.email,
      tradeUserId
    };
    next();
  } catch (error: any) {
    console.error("[Auth] Firebase ID token verification failed:", error);
    return res.status(401).json({ error: `Unauthorized: Invalid token (${error.message})` });
  }
};

/**
 * DELETE USER ACCOUNT API
 * Securely deletes user data from Firestore and deletes account from Firebase Auth using Admin SDK.
 */
app.post("/api/user/delete", verifyFirebaseAuth, async (req: express.Request, res: express.Response) => {
  try {
    const user = (req as any).user;
    const uid = user.uid;

    console.log(`[Account Deletion] Purging account & data for user: ${uid}`);

    // Clean up user profile document from Firestore
    await db.collection("users").doc(uid).delete().catch(err => {
      console.warn(`[Account Deletion] Non-fatal user doc delete notice for ${uid}:`, err);
    });

    // Delete user from Firebase Auth via Admin SDK
    await auth.deleteUser(uid);

    return res.json({ success: true, message: "Account and profile data permanently deleted" });
  } catch (err: any) {
    console.error("[Account Deletion] Admin SDK deletion failed:", err);
    return res.status(500).json({ error: err.message || "Failed to delete user account" });
  }
});

/**
 * MULTI-PROVIDER EMAIL OAUTH ENGINE: CONNECT ROUTE
 * Scaffolds OAuth authorization connection initiation for different email providers.
 * Supports both authenticated user account linking and new user sign-in/sign-up.
 */
app.get("/api/oauth/connect", async (req: express.Request, res: express.Response) => {
  const provider = (req.query.provider as string || '').toLowerCase();
  
  if (!provider) {
    return res.status(400).json({ error: "Provider parameter is required (e.g. microsoft, yahoo, google)" });
  }

  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;
  const token = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : queryToken;

  let tradeUserId = "";
  let userId = "";
  let isGuest = true;

  if (token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      userId = decodedToken.uid;
      const userDoc = await db.collection("users").doc(userId).get();
      tradeUserId = userDoc.exists ? (userDoc.data()?.tradeUserId || `family_${userId}`) : `family_${userId}`;
      isGuest = false;
    } catch (err) {
      console.warn("[OAuth Connect] Token verification fallback, proceeding as guest session:", err);
    }
  }

  const baseAppUrl = (req.headers.origin && typeof req.headers.origin === "string")
    ? req.headers.origin
    : (process.env.APP_URL || APP_URL);

  let redirectUri = `${baseAppUrl}/api/oauth/callback`;
  if (provider === "microsoft" || provider === "outlook") {
    redirectUri = process.env.MICROSOFT_REDIRECT_URI || redirectUri;
  } else if (provider === "yahoo") {
    redirectUri = process.env.YAHOO_REDIRECT_URI || redirectUri;
  }

  // Generate secure state token containing tradeUserId, userId, provider, redirectUri, and isGuest flag
  const statePayload = JSON.stringify({ tradeUserId, userId, provider, isGuest, redirectUri, nonce: Date.now() });
  const state = Buffer.from(statePayload).toString("base64url");

  let authUrl = "";

  switch (provider) {
    case "microsoft":
    case "outlook": {
      const clientId = process.env.MICROSOFT_CLIENT_ID || "";
      console.log(`[OAuth Connect] Microsoft authorize requested: redirectUri=${redirectUri}, clientId=${clientId}`);
      const scopes = encodeURIComponent("openid profile email offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite");
      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scopes}&state=${state}`;
      break;
    }
    case "yahoo": {
      const clientId = process.env.YAHOO_CLIENT_ID || "";
      console.log(`[OAuth Connect] Yahoo authorize requested: redirectUri=${redirectUri}, clientId=${clientId}`);
      authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      break;
    }
    case "google": {
      authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/calendar"
        ],
        prompt: "consent",
        state: state
      });
      break;
    }
    default:
      return res.status(400).json({ error: `Unsupported email provider: ${provider}` });
  }

  res.json({ success: true, provider, authUrl, state });
});

/**
 * MULTI-PROVIDER EMAIL OAUTH ENGINE: CALLBACK ROUTE
 * Scaffolds OAuth callback code exchange with a provider switch statement
 * and encrypted token storage in trade_users/{tradeUserId}/connectedAccounts/{accountId}.
 */
app.get("/api/oauth/callback", async (req: express.Request, res: express.Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(400).json({ error: `OAuth Authorization Error: ${oauthError}` });
  }

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  let stateData: any = {};
  if (state && typeof state === "string") {
    try {
      const decodedState = Buffer.from(state, "base64url").toString("utf8");
      stateData = JSON.parse(decodedState);
    } catch (err) {
      console.warn("[OAuth Callback] Failed to parse state payload:", err);
    }
  }

  // Extract auth context from state token or optional Authorization header / token query
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;
  const token = (authHeader && authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : queryToken;

  let tradeUserId = stateData.tradeUserId || "";
  let userId = stateData.userId || "";
  let userEmail = "";

  if (token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      userId = userId || decodedToken.uid;
      userEmail = decodedToken.email || "";
      const userDoc = await db.collection("users").doc(userId).get();
      tradeUserId = tradeUserId || (userDoc.exists ? (userDoc.data()?.tradeUserId || `family_${userId}`) : `family_${userId}`);
    } catch (err) {
      console.warn("[OAuth Callback] Token verification fallback error:", err);
    }
  }

  const provider = (stateData.provider || req.query.provider || "google").toLowerCase();

  let accessToken = "skeleton_access_token";
  let refreshToken = "skeleton_refresh_token";
  let tokenExpiresAt = Date.now() + 3600 * 1000;
  let emailAddress = userEmail || "";
  let displayName = userEmail || "Connected Account";

  // Real authorization code exchange & profile fetch for each provider
  try {
    switch (provider) {
      case "microsoft":
      case "outlook": {
        const clientId = process.env.MICROSOFT_CLIENT_ID || "";
        const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
        const redirectUri = stateData.redirectUri || process.env.MICROSOFT_REDIRECT_URI || `${APP_URL}/api/oauth/callback`;
        console.log(`[OAuth Engine] Processing Microsoft code exchange with redirectUri: ${redirectUri}, for family: ${tradeUserId || 'pending'}, user: ${userId || 'pending'}`);

        const tokenParams = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        });

        const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString()
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          console.error("[OAuth Engine] Microsoft token exchange error:", tokenData);
          throw new Error(tokenData.error_description || tokenData.error || "Microsoft token exchange failed");
        }

        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token || "";
        tokenExpiresAt = Date.now() + ((tokenData.expires_in || 3600) * 1000);

        // Extract real email and name from Microsoft ID Token claims
        let msEmail = "";
        let msName = "";
        if (tokenData.id_token) {
          try {
            const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString('utf8'));
            msEmail = payload.preferred_username || payload.email || payload.upn || "";
            msName = payload.name || "";
          } catch (jwtErr) {}
        }

        // Fetch user profile from Microsoft Graph API
        try {
          const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            emailAddress = profile.mail || msEmail || profile.userPrincipalName || userEmail;
            displayName = profile.displayName || msName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
          } else {
            emailAddress = msEmail || userEmail;
            displayName = msName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
          }
        } catch (profileErr) {
          console.warn("[OAuth Engine] Failed to fetch Microsoft profile:", profileErr);
          emailAddress = msEmail || userEmail;
          displayName = msName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
        }

        if (emailAddress && emailAddress.includes('#')) {
          emailAddress = emailAddress.split('#').pop() || emailAddress;
        }
        break;
      }
      case "yahoo": {
        const clientId = process.env.YAHOO_CLIENT_ID || "";
        const clientSecret = process.env.YAHOO_CLIENT_SECRET || "";
        const redirectUri = stateData.redirectUri || process.env.YAHOO_REDIRECT_URI || `${APP_URL}/api/oauth/callback`;
        console.log(`[OAuth Engine] Processing Yahoo code exchange with redirectUri: ${redirectUri}, for family: ${tradeUserId || 'pending'}, user: ${userId || 'pending'}`);

        const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
        const tokenParams = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        });

        const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: tokenParams.toString()
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          console.error("[OAuth Engine] Yahoo token exchange error:", tokenData);
          throw new Error(tokenData.error_description || tokenData.error || "Yahoo token exchange failed");
        }

        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token || "";
        tokenExpiresAt = Date.now() + ((tokenData.expires_in || 3600) * 1000);

        // Extract real email and name from Yahoo ID Token claims
        let yahooEmail = "";
        let yahooName = "";
        if (tokenData.id_token) {
          try {
            const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString('utf8'));
            yahooEmail = payload.email || payload.preferred_username || "";
            yahooName = payload.name || payload.nickname || "";
          } catch (jwtErr) {}
        }

        // Fetch user profile from Yahoo UserInfo
        try {
          const profileRes = await fetch("https://api.login.yahoo.com/openid/v1/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            emailAddress = profile.email || yahooEmail || profile.sub || userEmail;
            displayName = profile.name || profile.given_name || yahooName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
          } else {
            emailAddress = yahooEmail || userEmail;
            displayName = yahooName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
          }
        } catch (profileErr) {
          console.warn("[OAuth Engine] Failed to fetch Yahoo profile:", profileErr);
          emailAddress = yahooEmail || userEmail;
          displayName = yahooName || (emailAddress ? emailAddress.split('@')[0] : "Family Member");
        }
        break;
      }
      case "google": {
        console.log(`[OAuth Engine] Processing Google code exchange for family: ${tradeUserId || 'pending'}, user: ${userId || 'pending'}`);
        const { tokens } = await oauth2Client.getToken(code as string);
        accessToken = tokens.access_token || "";
        refreshToken = tokens.refresh_token || "";
        tokenExpiresAt = tokens.expiry_date || (Date.now() + 3600 * 1000);

        // Fetch Google user profile
        try {
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            emailAddress = profile.email || userEmail || "google_user@gmail.com";
            displayName = profile.name || emailAddress;
          }
        } catch (profileErr) {
          console.warn("[OAuth Engine] Failed to fetch Google profile:", profileErr);
        }
        break;
      }
      default:
        return res.status(400).json({ error: `Unsupported email provider: ${provider}` });
    }
  } catch (exchangeErr: any) {
    console.error("[OAuth Engine] Authorization code exchange error:", exchangeErr.message);
    const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
    if (acceptsHtml) {
      return res.status(400).send(`<!DOCTYPE html>
<html>
  <head>
    <title>Connection Error - Tribe</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #09090b; color: #fff; text-align: center; }
      .card { background: #18181b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #ef444450; max-width: 360px; }
      .icon { width: 48px; height: 48px; background: #ef444420; color: #ef4444; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.5rem; }
      h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0; color: #f87171; font-size: 0.875rem; word-break: break-word; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✕</div>
      <h2>Connection Failed</h2>
      <p>${exchangeErr.message || "Failed to exchange authorization code"}</p>
    </div>
    <script>
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'OAUTH_ERROR', provider: '${provider}', error: ${JSON.stringify(exchangeErr.message || "Failed to connect")} }, '*');
        } catch (e) {}
      }
    </script>
  </body>
</html>`);
    }
    return res.status(400).json({ error: exchangeErr.message || "Failed to exchange authorization code" });
  }

  try {
    let customToken = "";

    // Provision user in Firebase Auth if guest session or user missing
    if (!userId || stateData.isGuest) {
      const cleanEmail = emailAddress || userEmail || `guest_${Date.now()}@tribetrade.co.uk`;
      const cleanName = (displayName && displayName !== "Connected Account") ? displayName : cleanEmail.split('@')[0];
      try {
        let firebaseUser;
        try {
          firebaseUser = await auth.getUserByEmail(cleanEmail);
        } catch (e) {
          firebaseUser = await auth.createUser({
            email: cleanEmail,
            displayName: cleanName,
            emailVerified: true
          });
        }
        userId = firebaseUser.uid;
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          tradeUserId = userSnap.data()?.tradeUserId || `family_${userId}`;
          await userRef.set({
            email: cleanEmail,
            displayName: cleanName
          }, { merge: true });
        } else {
          tradeUserId = `family_${userId}`;
          await userRef.set({
            email: cleanEmail,
            displayName: cleanName,
            tradeUserId: tradeUserId,
            role: 'member',
            subscriptionTier: 'free',
            createdAt: new Date().toISOString()
          });
        }
        customToken = await auth.createCustomToken(userId);
      } catch (userErr) {
        console.error("[OAuth Engine] Failed to provision Firebase user for guest sign-in:", userErr);
      }
    }

    if (!userId || !tradeUserId) {
      userId = userId || `user_${Date.now()}`;
      tradeUserId = tradeUserId || `family_${userId}`;
    }

    // Encrypt OAuth tokens before saving to Firestore token vault
    const accessTokenEncrypted = encryptToken(accessToken);
    const refreshTokenEncrypted = encryptToken(refreshToken);

    // Save data to Firestore subcollection: trade_users/{tradeUserId}/connectedAccounts/{accountId}
    const accountsRef = db.collection("trade_users").doc(tradeUserId).collection("connectedAccounts");
    const accountDocRef = accountsRef.doc();
    const accountId = accountDocRef.id;

    const accountData = {
      id: accountId,
      tradeUserId,
      userId,
      provider,
      emailAddress: emailAddress || "Connected Account",
      displayName: displayName || emailAddress || "Connected Account",
      status: "active",
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await accountDocRef.set(accountData);

    const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
    if (acceptsHtml) {
      return res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Account Connected - Tribe</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #09090b; color: #fff; text-align: center; }
      .card { background: #18181b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #27272a; max-width: 360px; }
      .icon { width: 48px; height: 48px; background: #10b98120; color: #10b981; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.5rem; }
      h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0; color: #a1a1aa; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✓</div>
      <h2>Connected Successfully!</h2>
      <p>Your ${provider} account has been linked to Tribe. Closing window...</p>
    </div>
    <script>
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'OAUTH_SUCCESS', provider: '${provider}', accountId: '${accountId}', customToken: '${customToken}' }, '*');
        } catch (e) {}
      }
      setTimeout(function() { window.close(); }, 1200);
    </script>
  </body>
</html>`);
    }

    res.json({
      success: true,
      message: `Account connected successfully for ${provider}`,
      accountId,
      connectedAccount: {
        id: accountId,
        tradeUserId,
        userId,
        provider,
        emailAddress,
        displayName,
        status: "active"
      }
    });
  } catch (err: any) {
    console.error("[OAuth Callback] Firestore subcollection write failed:", err);
    const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
    if (acceptsHtml) {
      return res.status(500).send(`<!DOCTYPE html>
<html>
  <head>
    <title>Connection Error - Tribe</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #09090b; color: #fff; text-align: center; }
      .card { background: #18181b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #ef444450; max-width: 360px; }
      .icon { width: 48px; height: 48px; background: #ef444420; color: #ef4444; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.5rem; }
      h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0; color: #f87171; font-size: 0.875rem; word-break: break-word; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✕</div>
      <h2>Save Account Failed</h2>
      <p>${err.message || "Failed to save connected account"}</p>
    </div>
    <script>
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'OAUTH_ERROR', provider: '${provider}', error: ${JSON.stringify(err.message || "Failed to save account")} }, '*');
        } catch (e) {}
      }
    </script>
  </body>
</html>`);
    }
    res.status(500).json({ error: `Failed to save connected account: ${err.message}` });
  }
});

/**
 * APPLE / IMAP APP-SPECIFIC PASSWORD CONNECTION ROUTE
 * Verifies credentials against imap.mail.me.com:993 in real-time.
 * Encrypts app password via AES-256-GCM and saves to trade_users/{tradeUserId}/connectedAccounts.
 */
app.post("/api/email/connect-app-password", verifyFirebaseAuth, async (req: express.Request, res: express.Response) => {
  const user = (req as any).user;
  const tradeUserId = user.tradeUserId;
  const userId = user.uid;
  const { provider = "apple", email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and app password are required." });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).replace(/[\s-]/g, "");

  let imapHost = "imap.mail.me.com";
  let providerLabel = "Apple Mail";
  let normalizedProvider = "apple";

  if (provider === "google" || provider === "gmail") {
    imapHost = "imap.gmail.com";
    providerLabel = "Gmail";
    normalizedProvider = "google";
  } else if (provider === "outlook" || provider === "microsoft" || provider === "hotmail") {
    imapHost = "outlook.office365.com";
    providerLabel = "Outlook";
    normalizedProvider = "microsoft";
  } else if (provider === "yahoo" || provider === "sky") {
    imapHost = "imap.mail.yahoo.com";
    providerLabel = "Yahoo Mail";
    normalizedProvider = "yahoo";
  }

  if (cleanPassword.length < 16) {
    return res.status(400).json({ error: `${providerLabel} app passwords must be at least 16 characters in length.` });
  }

  if (normalizedProvider === "apple" && !cleanEmail.endsWith("@icloud.com") && !cleanEmail.endsWith("@me.com") && !cleanEmail.endsWith("@mac.com")) {
    return res.status(400).json({
      error: "Apple's mail server requires your @icloud.com email address. If your Apple Account uses an external address (such as Hotmail or Gmail), please check Settings > [Your Name] > iCloud on your Apple device to find your @icloud.com address."
    });
  }

  if (normalizedProvider === "microsoft") {
    return res.status(400).json({
      error: "Microsoft retired App Passwords and Basic Authentication for all personal accounts (Outlook, Hotmail, Live) on 16 September 2024. Please connect your account using the 1-click 'Sign In with Microsoft' button instead."
    });
  }

  // Real-time IMAP verification
  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: {
      user: cleanEmail,
      pass: cleanPassword
    },
    logger: false
  });

  try {
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out. Please check your internet connection.")), 8000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    await client.logout().catch(() => {});
  } catch (imapErr: any) {
    try { await client.logout().catch(() => {}); } catch (e) {}
    console.warn(`[${providerLabel} IMAP Connect] Verification failed for ${cleanEmail}:`, imapErr.message);
    const specificHint =
      normalizedProvider === "google"
        ? "Could not connect to Gmail. Please check your Gmail address and 16-character App Password (ensure 2-Step Verification is active in your Google Account)."
        : normalizedProvider === "apple"
        ? "Could not connect to iCloud Mail. Please check your @icloud.com email address and 16-character app-specific password."
        : normalizedProvider === "yahoo"
        ? "Could not connect to Yahoo Mail. Please ensure you generated the app password specifically on login.yahoo.com under External connections > Create app password, and that your full Yahoo email address is entered."
        : `Could not connect to ${providerLabel}. Please check your email address and app password.`;
    return res.status(400).json({ error: specificHint });
  }

  try {
    // Encrypt password securely in token vault using AES-256-GCM
    const encryptedPassword = encryptToken(cleanPassword);

    const accountsRef = db.collection("trade_users").doc(tradeUserId).collection("connectedAccounts");
    const accountDocRef = accountsRef.doc();
    const accountId = accountDocRef.id;

    const accountData = {
      id: accountId,
      tradeUserId,
      userId,
      provider: normalizedProvider,
      emailAddress: cleanEmail,
      displayName: cleanEmail.split("@")[0] || `${providerLabel} Account`,
      status: "active",
      accessTokenEncrypted: "",
      refreshTokenEncrypted: encryptedPassword,
      tokenExpiresAt: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await accountDocRef.set(accountData);

    return res.json({
      success: true,
      message: `${providerLabel} connected successfully!`,
      accountId,
      account: {
        id: accountId,
        provider: normalizedProvider,
        emailAddress: cleanEmail,
        displayName: accountData.displayName,
        status: "active"
      }
    });
  } catch (dbErr: any) {
    console.error(`[${providerLabel} IMAP Connect] Database save failed:`, dbErr);
    return res.status(500).json({ error: "Failed to save connected account: " + dbErr.message });
  }
});

/**
 * PUBLIC ENTRY POINT: ICLOUD SIGN IN & ACCOUNT PROVISIONING
 * Allows users to register/sign in directly from the Auth screen using their iCloud account.
 * 1. Validates iCloud credentials in real-time against imap.mail.me.com:993
 * 2. Provisions or retrieves the user in Firebase Auth
 * 3. Sets up users/{uid} and trade_users/{tradeUserId} in Firestore
 * 4. Encrypts app password and saves to trade_users/{tradeUserId}/connectedAccounts
 * 5. Returns a Firebase custom token for instant signInWithCustomToken client-side
 */
app.post("/api/auth/icloud-signin", async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "iCloud email address and app-specific password are required." });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).replace(/[\s-]/g, "");

  if (cleanPassword.length < 16) {
    return res.status(400).json({ error: "Apple app-specific passwords must be at least 16 characters in length." });
  }

  if (!cleanEmail.endsWith("@icloud.com") && !cleanEmail.endsWith("@me.com") && !cleanEmail.endsWith("@mac.com")) {
    return res.status(400).json({
      error: "Apple's mail server requires your @icloud.com email address. If your Apple Account uses an external address (such as Hotmail or Gmail), please check Settings > [Your Name] > iCloud on your Apple device to find your @icloud.com address."
    });
  }

  // 1. Real-time verification against Apple IMAP
  const client = new ImapFlow({
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: {
      user: cleanEmail,
      pass: cleanPassword
    },
    logger: false
  });

  try {
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out. Please check your internet connection.")), 8000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    await client.logout().catch(() => {});
  } catch (imapErr: any) {
    try { await client.logout().catch(() => {}); } catch (e) {}
    console.warn(`[iCloud Sign-In] Verification failed for ${cleanEmail}:`, imapErr?.message);
    return res.status(400).json({
      error: "Could not connect to iCloud Mail. Please check your @icloud.com email address and 16-character app-specific password."
    });
  }

  // 2. Provision or retrieve Firebase user
  try {
    let firebaseUser;
    try {
      firebaseUser = await auth.getUserByEmail(cleanEmail);
    } catch (e) {
      const displayName = cleanEmail.split('@')[0];
      firebaseUser = await auth.createUser({
        email: cleanEmail,
        displayName: displayName,
        emailVerified: true
      });
    }

    const userId = firebaseUser.uid;
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    let tradeUserId = "";

    if (userSnap.exists) {
      tradeUserId = userSnap.data()?.tradeUserId || `family_${userId}`;
      await userRef.set({
        email: cleanEmail,
        displayName: firebaseUser.displayName || cleanEmail.split('@')[0]
      }, { merge: true });
    } else {
      tradeUserId = `family_${userId}`;
      await userRef.set({
        email: cleanEmail,
        displayName: firebaseUser.displayName || cleanEmail.split('@')[0],
        tradeUserId: tradeUserId,
        role: 'member',
        subscriptionTier: 'free',
        createdAt: new Date().toISOString()
      });
    }

    // 3. Encrypt and save iCloud connected account in Firestore subcollection
    const encryptedPassword = encryptToken(cleanPassword);
    const accountsRef = db.collection("trade_users").doc(tradeUserId).collection("connectedAccounts");
    const existingSnap = await accountsRef.where("provider", "==", "apple").where("emailAddress", "==", cleanEmail).get();
    
    let accountId = "";
    if (!existingSnap.empty) {
      accountId = existingSnap.docs[0].id;
      await accountsRef.doc(accountId).set({
        appPasswordEncrypted: encryptedPassword,
        status: "active",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      const newDoc = accountsRef.doc();
      accountId = newDoc.id;
      await newDoc.set({
        id: accountId,
        tradeUserId,
        userId,
        provider: "apple",
        emailAddress: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        status: "active",
        appPasswordEncrypted: encryptedPassword,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 4. Generate Firebase custom token for instant client-side login
    const customToken = await auth.createCustomToken(userId);

    return res.json({
      success: true,
      customToken,
      email: cleanEmail,
      userId,
      tradeUserId
    });
  } catch (err: any) {
    console.error("[iCloud Sign-In] Account provisioning error:", err);
    return res.status(500).json({ error: "Failed to set up account: " + err.message });
  }
});

/**
 * MULTI-PROVIDER EMAIL ENGINE: FETCH MESSAGES FOR CONNECTED ACCOUNTS
 */
app.get("/api/oauth/messages", verifyFirebaseAuth, async (req: express.Request, res: express.Response) => {
  const user = (req as any).user;
  const tradeUserId = user.tradeUserId;
  const targetAccountId = req.query.accountId as string;

  try {
    const docsToFetch: FirebaseFirestore.DocumentSnapshot[] = [];
    if (targetAccountId) {
      const docSnap = await db.collection("trade_users").doc(tradeUserId).collection("connectedAccounts").doc(targetAccountId).get();
      if (docSnap.exists) docsToFetch.push(docSnap);
    } else {
      const snap = await db.collection("trade_users").doc(tradeUserId).collection("connectedAccounts").get();
      docsToFetch.push(...snap.docs);
    }

    const allMessages: any[] = [];

    for (const accDoc of docsToFetch) {
      const accData = accDoc.data();
      if (!accData || accData.status !== "active") continue;

      let decryptedAccessToken = "";
      try {
        decryptedAccessToken = decryptToken(accData.accessTokenEncrypted);
      } catch (err) {
        console.warn(`[OAuth Engine] Failed to decrypt token for ${accDoc.id}`);
        continue;
      }

      if (accData.provider === "microsoft" || accData.provider === "outlook") {
        try {
          const msRes = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=id,subject,from,bodyPreview,receivedDateTime,isRead,body", {
            headers: { Authorization: `Bearer ${decryptedAccessToken}` }
          });
          if (msRes.ok) {
            const msData = await msRes.json();
            const msMessages = (msData.value || []).map((msg: any) => ({
              id: msg.id,
              accountId: accDoc.id,
              accountEmail: accData.emailAddress,
              provider: "microsoft",
              subject: msg.subject || "(No Subject)",
              from: msg.from?.emailAddress?.address ? `${msg.from?.emailAddress?.name || ''} <${msg.from?.emailAddress?.address}>` : "Unknown Sender",
              snippet: msg.bodyPreview || "",
              date: msg.receivedDateTime,
              unread: !msg.isRead,
              body: msg.body?.content || msg.bodyPreview || ""
            }));
            allMessages.push(...msMessages);
          }
        } catch (msErr: any) {
          console.warn(`[OAuth Engine] Failed to fetch MS messages for ${accData.emailAddress}:`, msErr.message);
        }
      } else if ((accData.provider === "yahoo" || accData.provider === "sky") && accData.accessTokenEncrypted) {
        allMessages.push({
          id: `yahoo_${accDoc.id}_sample`,
          accountId: accDoc.id,
          accountEmail: accData.emailAddress,
          provider: "yahoo",
          subject: "Sky Mail Inbox Connected",
          from: "Sky Mail <support@sky.com>",
          snippet: "Your Sky Mail / Yahoo Mail account has been linked to Tribe.",
          date: new Date().toISOString(),
          unread: false,
          body: "Your Sky Mail / Yahoo Mail account has been linked to Tribe."
        });
      } else if (accData.provider === "apple" || accData.provider === "google" || accData.provider === "gmail" || accData.provider === "yahoo" || accData.provider === "sky" || (accData.accessTokenEncrypted === "" && accData.refreshTokenEncrypted)) {
        let decryptedPassword = "";
        try {
          decryptedPassword = decryptToken(accData.refreshTokenEncrypted);
        } catch (decErr) {
          console.warn(`[IMAP] Failed to decrypt token for ${accData.emailAddress}`);
          continue;
        }

        if (!decryptedPassword) continue;

        const isGoogle = accData.provider === "google" || accData.provider === "gmail";
        let imapHost = "imap.mail.me.com";
        let providerTag = "apple";

        if (isGoogle) {
          imapHost = "imap.gmail.com";
          providerTag = "google";
        } else if (accData.provider === "microsoft" || accData.provider === "outlook") {
          imapHost = "outlook.office365.com";
          providerTag = "microsoft";
        } else if (accData.provider === "yahoo" || accData.provider === "sky") {
          imapHost = "imap.mail.yahoo.com";
          providerTag = "yahoo";
        }

        const imapClient = new ImapFlow({
          host: imapHost,
          port: 993,
          secure: true,
          auth: {
            user: accData.emailAddress,
            pass: decryptedPassword
          },
          logger: false
        });

        try {
          const connectPromise = imapClient.connect();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("IMAP timeout")), 8000));
          await Promise.race([connectPromise, timeoutPromise]);

          const lock = await imapClient.getMailboxLock("INBOX");
          try {
            const mailbox = imapClient.mailbox;
            if (mailbox && mailbox.exists > 0) {
              const fetchRange = `${Math.max(1, mailbox.exists - 14)}:*`;
              for await (const msg of imapClient.fetch(fetchRange, { envelope: true, source: true, flags: true })) {
                try {
                  const parsed = await simpleParser(msg.source);
                  const isUnread = !msg.flags || !msg.flags.has("\\Seen");
                  allMessages.push({
                    id: `${providerTag}_${accDoc.id}_${msg.uid}`,
                    accountId: accDoc.id,
                    accountEmail: accData.emailAddress,
                    provider: providerTag as any,
                    subject: parsed.subject || "(No Subject)",
                    from: parsed.from?.text || parsed.from?.value?.[0]?.address || "Unknown Sender",
                    snippet: (parsed.text || "").slice(0, 160).replace(/\s+/g, " ").trim(),
                    date: (parsed.date || new Date()).toISOString(),
                    unread: isUnread,
                    body: (parsed.html || parsed.text || "").toString()
                  });
                } catch (parseErr) {
                  console.warn(`[${providerTag} IMAP] Message parse error:`, parseErr);
                }
              }
            }
          } finally {
            lock.release();
            await imapClient.logout().catch(() => {});
          }
        } catch (imapErr: any) {
          console.warn(`[${providerTag} IMAP] Fetch error for ${accData.emailAddress}:`, imapErr.message);
          try { await imapClient.logout().catch(() => {}); } catch (e) {}
        }
      }
    }

    res.json({ success: true, count: allMessages.length, messages: allMessages });
  } catch (err: any) {
    console.error("[OAuth Engine] Error fetching connected messages:", err);
    res.status(500).json({ error: err.message });
  }
});

// Auth URL Generator
app.get("/api/auth/url", (req, res) => {
  const originParam = (req.query.origin as string) || req.get('origin') || req.get('referer') || process.env.FRONTEND_URL || '';
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    prompt: "consent",
    state: originParam ? encodeURIComponent(originParam) : undefined
  });
  res.json({ url });
});

// Token Refresh
app.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).send("No refresh token provided");
  try {
    const requestClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID?.trim(),
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
      `${APP_URL}/auth/callback`
    );
    requestClient.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await requestClient.refreshAccessToken();
    res.json(credentials);
  } catch (error) {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// OAuth Callback
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.redirect("/");
  }
  try {
    const { tokens } = await oauth2Client.getToken(code as string);

    let targetOrigin = process.env.FRONTEND_URL || process.env.APP_URL || '';
    if (state && typeof state === 'string') {
      try {
        const decodedState = decodeURIComponent(state);
        if (decodedState.startsWith('http://') || decodedState.startsWith('https://')) {
          targetOrigin = new URL(decodedState).origin;
        }
      } catch (err) {
        // Fall back if state parsing fails
      }
    }

    if (!targetOrigin || (process.env.NODE_ENV === 'production' && targetOrigin.includes('localhost'))) {
      targetOrigin = 'https://tribetrader.web.app';
    }

    res.send(`<html><body><script>
      let targetOrigin = '${targetOrigin}';
      if (!targetOrigin || targetOrigin === 'undefined') {
        targetOrigin = window.location.origin;
      }
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, targetOrigin);
        } catch (err) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
        }
      }
      window.close();
    </script></body></html>`);
  } catch (error) {
    res.status(500).send("Auth Failed");
  }
});

// Calendar Sync
app.get("/api/calendar/events", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("No Token or invalid format");
  }
  const token = authHeader.split(" ")[1];
  try {
    oauth2Client.setCredentials({ access_token: token });
    const cal = googleCalendar({ version: "v3", auth: oauth2Client as any });
    const response = await cal.events.list({ calendarId: "primary", maxResults: 10 });
    res.json(response.data.items);
  } catch (error) {
    res.status(500).json({ error: "Calendar Sync Failed" });
  }
});

// Google Places API Proxy
// Helper function to calculate offset coordinates
function getOffsetCoordinate(lat: number, lng: number, offsetMiles: number, angleDegrees: number) {
  const R = 3959; // Earth radius in miles
  const d = offsetMiles;
  const brng = angleDegrees * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1), Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));

  return { lat: lat2 * 180 / Math.PI, lng: lon2 * 180 / Math.PI };
}

app.get("/api/places/search", async (req, res) => {
  const { query, location, radius } = req.query;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "No API key configured for Google Maps." });
  }
  
  let q = query ? String(query) : 'family activity playground park';
  let isCoords = false;
  let centerLat = 0;
  let centerLng = 0;
  
  if (location) {
    const locStr = String(location);
    const match = locStr.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (match) {
      isCoords = true;
      centerLat = parseFloat(match[1]);
      centerLng = parseFloat(match[2]);
    } else if (q.indexOf(locStr) === -1) {
      q = `${q} near ${locStr}`;
    }
  }
  
  let radiusMiles = radius ? parseFloat(String(radius)) : 10;
  if (isNaN(radiusMiles)) radiusMiles = 10;
  const radiusMeters = Math.min(Math.round(radiusMiles * 1609.34), 50000); // Max 50km radius
  
  try {
    if (isCoords) {
      // 1. Exact Center
      const points = [{ lat: centerLat, lng: centerLng }];
      // 2. Offset 1 (50% of radius, random angle)
      const angle1 = Math.random() * 360;
      points.push(getOffsetCoordinate(centerLat, centerLng, radiusMiles * 0.5, angle1));
      // 3. Offset 2 (80% of radius, roughly opposite angle for spread)
      const angle2 = (angle1 + 180 + (Math.random() * 40 - 20)) % 360;
      points.push(getOffsetCoordinate(centerLat, centerLng, radiusMiles * 0.8, angle2));

      const requests = points.map((p, index) => {
        let currentQuery = q;
        // Inject massive variety into the 3 requests if it's a generic family search
        if (q.toLowerCase().includes('family activit')) {
           if (index === 0) currentQuery = q + ' indoor entertainment, cinema, museum, arcade, bowling, soft play';
           if (index === 1) currentQuery = q + ' outdoor, park, farm, zoo, nature reserve, theme park';
           if (index === 2) currentQuery = q + ' leisure centre, sports, swimming, active, climbing';
        }

        const endpoint = `https://places.googleapis.com/v1/places:searchText`;
        const body = {
          textQuery: currentQuery,
          locationBias: {
            circle: {
              center: { latitude: p.lat, longitude: p.lng },
              radius: radiusMeters
            }
          }
        };
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.primaryType,places.formattedAddress'
          },
          body: JSON.stringify(body)
        }).then(r => r.json()).catch(() => null);
      });

      const results = await Promise.all(requests);
      
      let allPlaces: any[] = [];
      results.forEach(data => {
        if (data && data.places && Array.isArray(data.places)) {
          allPlaces = allPlaces.concat(data.places);
        }
      });
      
      // Deduplicate by id and map to legacy format
      const uniqueMap = new Map();
      allPlaces.forEach(p => {
        if (p.id && !uniqueMap.has(p.id)) {
          uniqueMap.set(p.id, {
            place_id: p.id,
            name: p.displayName?.text || p.id,
            types: p.primaryType ? [p.primaryType] : [],
            rating: p.rating || 0,
            geometry: {
              location: {
                lat: p.location?.latitude,
                lng: p.location?.longitude
              }
            },
            formatted_address: p.formattedAddress || ''
          });
        }
      });
      
      const mergedResults = Array.from(uniqueMap.values()).slice(0, 20);
      res.json({ status: 'OK', results: mergedResults });
    } else {
      // Fallback to simple text search without explicit coordinates
      const endpoint = `https://places.googleapis.com/v1/places:searchText`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.primaryType,places.formattedAddress'
        },
        body: JSON.stringify({ textQuery: q })
      });
      const data = await response.json();
      
      let mappedResults = [];
      if (data && data.places && Array.isArray(data.places)) {
        mappedResults = data.places.map((p: any) => ({
          place_id: p.id,
          name: p.displayName?.text || p.id,
          types: p.primaryType ? [p.primaryType] : [],
          rating: p.rating || 0,
          geometry: {
            location: {
              lat: p.location?.latitude,
              lng: p.location?.longitude
            }
          },
          formatted_address: p.formattedAddress || ''
        }));
      }
      res.json({ status: 'OK', results: mappedResults });
    }
  } catch (error) {
    console.error("Places Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch from Google Places API", details: String(error) });
  }
});

/**
 * INTERNAL TICKER (Triggered by Cloud Scheduler)
 * Polls for upcoming reminders and sends push notifications.
 */
async function processRemindersLogic() {
  const now = new Date();
  // 2-hour freshness window: avoid blasting notifications for ancient overdue items
  const freshnessWindow = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  console.log(`[Ticker] Starting efficient run at ${now.toISOString()}`);

  let sentCount = 0;
  const collections = ["tasks", "calendarEvents"];

  for (const col of collections) {
    const snap = await db.collectionGroup(col)
      .where("notified", "==", false)
      .where("reminderTime", "<=", now)
      .where("reminderTime", ">=", freshnessWindow)
      .get();

    if (snap.empty) continue;

    console.log(`[Ticker] Found ${snap.size} reminders to process in '${col}'`);

    for (const doc of snap.docs) {
      const data = doc.data();
      const tradeUserId = doc.ref.parent.parent?.id;
      if (!tradeUserId) continue;

      console.log(`[Ticker] Processing: ${data.title} for family ${tradeUserId}`);

      // Skip completed tasks and mark them as notified so they don't fire late reminders
      if (col === 'tasks' && (data.status === 'completed' || data.status === 'done')) {
        await doc.ref.update({ notified: true });
        continue;
      }

      const userSnap = await db.collection("users")
        .where("tradeUserId", "==", tradeUserId)
        .get();

      // Get family config & members
      const familySnap = await db.collection("trade_users").doc(tradeUserId).get();
      const familyData = familySnap.data();
      const notifyBothAdultsForChildTasks = familyData?.notifyBothAdultsForChildTasks ?? true;

      const membersSnap = await db.collection("trade_users").doc(tradeUserId).collection("members").get();
      const membersList = membersSnap.docs.map(mDoc => ({ id: mDoc.id, ...mDoc.data() }));

      const memberRolesMap: Record<string, string> = {};
      const memberUserIdMap: Record<string, string> = {};
      membersList.forEach((m: any) => {
        if (m.role) memberRolesMap[m.id] = m.role.toLowerCase();
        if (m.userId) memberUserIdMap[m.id] = m.userId;
      });

      // Determine who is assigned
      let notifyAll = false;
      const assignedIds = Array.isArray(data.assignedTo) 
        ? data.assignedTo 
        : (data.assignedTo && data.assignedTo !== 'all' ? [data.assignedTo] : []);

      if (!data.assignedTo || data.assignedTo === 'all' || assignedIds.length === 0) {
        notifyAll = true;
      }

      // Check if any child is assigned
      let childAssigned = false;
      for (const id of assignedIds) {
        const role = memberRolesMap[id];
        if (role === 'son' || role === 'daughter' || role === 'child' || role === 'kid') {
          childAssigned = true;
          break;
        }
      }

      // Determine target user IDs to notify
      const targetUserIds = new Set<string>();

      if (notifyAll || (childAssigned && notifyBothAdultsForChildTasks)) {
        userSnap.docs.forEach(uDoc => targetUserIds.add(uDoc.id));
      } else {
        for (const id of assignedIds) {
          const memberUserId = memberUserIdMap[id];
          if (memberUserId) {
            targetUserIds.add(memberUserId);
          } else {
            const memberDoc = membersList.find((m: any) => m.id === id) as any;
            if (memberDoc) {
              userSnap.docs.forEach(uDoc => {
                const uData = uDoc.data();
                if (
                  (memberDoc.email && uData.email === memberDoc.email) ||
                  (memberDoc.name && uData.displayName === memberDoc.name)
                ) {
                  targetUserIds.add(uDoc.id);
                }
              });
            }
          }
        }
        if (targetUserIds.size === 0) {
          userSnap.docs.forEach(uDoc => targetUserIds.add(uDoc.id));
        }
      }

      for (const uDoc of userSnap.docs) {
        if (!targetUserIds.has(uDoc.id)) continue;

        const settingsSnap = await db.collection("users").doc(uDoc.id).collection("settings").doc("notifications").get();
        const settingsData = settingsSnap.data();

        if (!settingsData || !settingsData.enabled) continue;

        const tokens: string[] = [];
        if (Array.isArray(settingsData.fcmTokens)) {
          tokens.push(...settingsData.fcmTokens);
        } else if (settingsData.fcmToken) {
          tokens.push(settingsData.fcmToken);
        }

        for (const token of [...new Set(tokens)]) {
          try {
            const isEvent = doc.ref.parent.id === 'calendarEvents';
            const view = isEvent ? 'calendar' : 'tasks';
            const deepLink = `/?view=${view}&id=${doc.id}`;
            const notifTitle = isEvent ? `📅 ${data.title || 'Family Event'}` : `✅ ${data.title || 'Scheduled Task'}`;
            const notifBody = data.description 
              ? (data.description.length > 90 ? `${data.description.substring(0, 87)}...` : data.description) 
              : (isEvent ? "Upcoming family event" : "Scheduled family task");

            await messaging.send({
              token: token,
              notification: {
                title: notifTitle,
                body: notifBody
              },
              data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                type: 'reminder',
                id: doc.id,
                link: deepLink
              },
              android: {
                priority: 'high',
                notification: {
                  channelId: 'tribe_reminders',
                  color: '#10b981',
                  sound: 'default'
                },
              },
              apns: {
                payload: { aps: { sound: 'default', contentAvailable: true } },
              },
              webpush: {
                headers: { Urgency: "high" },
                notification: {
                  icon: "/icon-192.png",
                  badge: "/badge.svg",
                  tag: doc.id
                },
                fcmOptions: { link: `${APP_URL}${deepLink}` }
              }
            });
            sentCount++;
          } catch (sendError: any) {
            console.warn(`[Ticker] Failed to send to token:`, sendError.message);
          }
        }
      }
      await doc.ref.update({ notified: true });
    }
  }
  return sentCount;
}

app.post("/api/internal/process-reminders", checkInternalAuth, async (req, res) => {
  try {
    const sentCount = await processRemindersLogic();
    res.json({ success: true, notificationsSent: sentCount });
  } catch (error) {
    console.error("[Ticker] Failed via API endpoint:", error);
    res.status(500).json({ error: "Internal processing failed" });
  }
});

// Run local cron job every minute to process reminders without needing Cloud Scheduler
cron.schedule("* * * * *", async () => {
  try {
    await processRemindersLogic();
  } catch (err) {
    console.error("[Cron] Failed to process reminders:", err);
  }
});

/**
 * GOOGLE CALENDAR WEBHOOK
 */
app.post("/api/webhooks/google-calendar", async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  console.log(`Calendar Webhook received: ${channelId} - ${resourceState}`);
  res.status(200).send('OK');
});

/**
 * TEST NOTIFICATION ENDPOINT
 */
app.post("/api/internal/test-notification", checkInternalAuth, async (req, res) => {
  const { token, title, body } = req.body;
  if (!token) return res.status(400).json({ error: "No token provided" });

  console.log(`Sending test notification to token: ${token.substring(0, 15)}...`);

  try {
    await messaging.send({
      token: token,
      notification: {
        title: 'Tribe',
        body: body || "This is a test notification from Tribe."
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        type: 'reminder',
        id: 'test-id'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'tribe_reminders',
          color: '#10b981',
          sound: 'default',
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          title: title || "Test Notification",
          body: body || "This is a test notification from Tribe.",
          icon: "/icon-192.png",
          badge: "/badge.svg",
          tag: "test-notification",
          renotify: true,
          requireInteraction: true
        }
      }
    });
    console.log("Test notification sent successfully");
    res.json({ success: true });
  } catch (error: any) {
    console.error("Test notification failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * REGENERATE DAILY BRIEFING
 */
async function regenerateBriefing(tradeUserId: string) {
  try {
    console.log(`[Briefing] Regenerating for family: ${tradeUserId}`);

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [membersSnap, tasksSnap, eventsSnap] = await Promise.all([
      db.collection('trade_users').doc(tradeUserId).collection('members').get(),
      db.collection('trade_users').doc(tradeUserId).collection('tasks')
        .where('dueDate', '>=', now)
        .where('dueDate', '<=', weekFromNow)
        .get(),
      db.collection('trade_users').doc(tradeUserId).collection('calendarEvents')
        .where('startTime', '>=', now)
        .where('startTime', '<=', weekFromNow)
        .get()
    ]);

    const members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const memberMap: Record<string, string> = {};
    members.forEach((m: any) => {
      memberMap[m.id] = m.name;
      if (m.email) memberMap[m.email] = m.name;
    });

    const familyContext = members.map((m: any) =>
      `${m.name} (${m.role}): Interests: ${m.favoriteThings?.join(', ') || 'none'}, Allergies: ${m.allergies?.join(', ') || 'none'}`
    ).join('\n');

    const agenda = [
      ...events.map((e: any) => {
        const assigned = e.assignedTo === 'all' ? 'All Family' : (memberMap[e.assignedTo] || e.assignedTo || 'All Family');
        return `[Event] ${e.title} at ${e.startTime} (Location: ${e.location || 'None'}, Assigned to: ${assigned})`;
      }),
      ...tasks.map((t: any) => {
        const assigned = t.assignedTo === 'all' ? 'All Family' : (memberMap[t.assignedTo] || t.assignedTo || 'General Family');
        return `[Task] ${t.title} due ${t.dueDate} (Assigned to: ${assigned})`;
      })
    ].join('\n');

    const todayStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const systemInstruction = `You are Tribe, a family AI strategist.
Family Profile:
${familyContext}

Always construct all summary text, safety warnings, and suggestions dynamically based on the actual family profile data fetched from Firestore.
- If any family member has listed allergies, mention food safety precautions for events.
- If any family member has listed interests, suggest related activities during downtime.
- NEVER use hardcoded or generic member names (like 'Rosie' or 'Jack') unless they are explicitly present in the Family Profile above.`;

    const prompt = `Today is: ${todayStr}
    Current Time: ${now.toLocaleString('en-GB')}
    
    Weekly Agenda (Next 7 Days):
    ${agenda || 'No events or tasks scheduled.'}
    
    TASK: Create a "Plan of Attack" for the next 7 days.
    - STRICT DATE RANGE: Only mention items that fall on or after today (${todayStr}) and within the next 7 days. Do NOT reference anything outside this window.
    - Use the exact date "${todayStr}" as today. Do NOT assume or calculate a different date.
    - MEMBER ATTRIBUTION & PERSONALISATION:
      * Clearly distinguish between who is assigned to each event/task based on the "Assigned to:" field in the agenda above.
      * Attribute items explicitly to their assigned family member's name (e.g., "Sarah has...", "John has...").
      * Attribute items assigned to children/kids specifically to their names or "The kids have..." (e.g., "The kids have swimming lessons").
      * For items assigned to "All Family" or general tasks, refer to them as shared family plans (e.g., "As a family, you have..."). DO NOT claim unassigned or family items belong solely to one person.
    - Keep it high-level, encouraging, and extremely concise.
    - Highlight potential conflicts (e.g. two people in different places at once).
    - Format with exactly these four sections: **Today:** | **Coming Up:** | **Reminders:** | **Fun Strategy:**
    - Each section heading must be bold (e.g. **Today:**) and on its own line, followed by content on the next line. Do NOT use asterisks (*) as bullet points.
    - NO markdown headers (###). Use plain text under each bold heading.
    
    Return the briefing as plain text.`;

    if (!ai) {
      throw new Error("Vertex AI is not configured on this server");
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });

    const briefingText = response.text;

    await db.collection('trade_users').doc(tradeUserId).collection('briefing').doc('current').set({
      content: briefingText,
      updatedAt: FieldValue.serverTimestamp(),
      stale: false
    });

    console.log(`[Briefing] Successfully updated for ${tradeUserId}`);
    return briefingText;
  } catch (error) {
    console.error(`[Briefing] Failed for ${tradeUserId}:`, error);
    throw error;
  }
}

/**
 * DYNAMIC TIMEZONE-AWARE BRIEFING CRON JOB
 * Runs every hour and checks if it is 6 AM in the family's local timezone.
 */
async function getFamilyTimezone(tradeUserId: string): Promise<string> {
  try {
    // 1. Check family document itself
    const familyDoc = await db.collection('trade_users').doc(tradeUserId).get();
    if (familyDoc.exists) {
      const data = familyDoc.data();
      if (data?.timezone) return data.timezone;
      if (data?.timeZone) return data.timeZone;
    }

    // 2. Check family preferences collection
    const prefSnap = await db.collection('trade_users').doc(tradeUserId).collection('preferences').get();
    for (const doc of prefSnap.docs) {
      const data = doc.data();
      if (data?.timezone) return data.timezone;
      if (data?.timeZone) return data.timeZone;
    }

    // 3. Check users in this family and their settings
    const usersSnap = await db.collection('users').where('tradeUserId', '==', tradeUserId).limit(5).get();
    for (const userDoc of usersSnap.docs) {
      const settingsSnap = await db.collection('users').doc(userDoc.id).collection('settings').get();
      for (const doc of settingsSnap.docs) {
        const data = doc.data();
        if (data?.timezone) return data.timezone;
        if (data?.timeZone) return data.timeZone;
      }
    }
  } catch (err: any) {
    console.error(`Error fetching timezone for family ${tradeUserId}:`, err.message);
  }
  return 'Europe/London';
}

cron.schedule("0 * * * *", async () => {
  console.log("[Cron] Running timezone-aware 6 AM briefing checks...");
  try {
    const trade_usersSnap = await db.collection('trade_users').get();
    for (const famDoc of trade_usersSnap.docs) {
      const tz = await getFamilyTimezone(famDoc.id);
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          hour12: false
        });
        const localHour = parseInt(formatter.format(new Date()), 10);
        if (localHour === 6) {
          console.log(`[Cron] It is 6 AM in ${tz} for family ${famDoc.id}. Refreshing briefing...`);
          await regenerateBriefing(famDoc.id);
        }
      } catch (err: any) {
        console.error(`[Cron] Timezone evaluation failed for ${tz}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Cron] Timezone cron run failed:", err);
  }
});

/**
 * WHITEBOARD NOTIFICATION ENDPOINT
 * Broadcasts a push notification to other family members when a sticky note or message is placed on the whiteboard.
 */
app.post("/api/whiteboard/notify", verifyFirebaseAuth, async (req: express.Request, res: express.Response) => {
  try {
    const user = (req as any).user;
    const { authorName, textSnippet, noteId } = req.body;
    const tradeUserId = user.tradeUserId;
    const senderUid = user.uid;

    if (!tradeUserId) {
      return res.status(400).json({ error: "Missing tradeUserId" });
    }

    // Query all other users in this family
    const familyUsersSnap = await db.collection("users")
      .where("tradeUserId", "==", tradeUserId)
      .get();

    const recipientTokens: string[] = [];
    for (const doc of familyUsersSnap.docs) {
      if (doc.id === senderUid) continue; // Skip author
      
      const settingsSnap = await db.collection("users")
        .doc(doc.id)
        .collection("settings")
        .doc("notifications")
        .get();

      if (settingsSnap.exists) {
        const settingsData = settingsSnap.data();
        if (settingsData && settingsData.enabled !== false) {
          if (Array.isArray(settingsData.fcmTokens)) {
            recipientTokens.push(...settingsData.fcmTokens);
          } else if (settingsData.fcmToken) {
            recipientTokens.push(settingsData.fcmToken);
          }
        }
      }
    }

    const uniqueTokens = [...new Set(recipientTokens.filter(t => typeof t === "string" && t.length > 0))];

    if (uniqueTokens.length > 0) {
      const displayName = authorName || "A family member";
      const title = `📌 Whiteboard: ${displayName} left a note`;
      const body = textSnippet ? (textSnippet.length > 100 ? `${textSnippet.substring(0, 97)}...` : textSnippet) : "Check the family whiteboard for a new update.";
      
      const sendResults = await Promise.allSettled(
        uniqueTokens.map(token =>
          messaging.send({
            token,
            notification: {
              title,
              body,
            },
            data: {
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              type: "whiteboard",
              id: noteId || "",
              link: "/?view=hub"
            },
            webpush: {
              notification: {
                title,
                body,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                tag: "whiteboard-update",
                renotify: true
              },
              fcmOptions: {
                link: "/?view=hub"
              }
            }
          })
        )
      );

      const successful = sendResults.filter(r => r.status === "fulfilled").length;
      console.log(`[Whiteboard Notify] Sent notification to ${successful}/${uniqueTokens.length} devices for family ${tradeUserId}`);
    }

    return res.json({ success: true, notifiedCount: uniqueTokens.length });
  } catch (error: any) {
    console.error("[Whiteboard Notify] Failed to send whiteboard notification:", error);
    return res.status(500).json({ error: error.message || "Failed to notify family" });
  }
});

/**
 * REFRESH BRIEFING ENDPOINT
 */
app.post("/api/internal/refresh-briefing", checkInternalAuth, async (req, res) => {
  const { tradeUserId, force } = req.body;
  if (!tradeUserId) return res.status(400).send("No tradeUserId");

  try {
    const doc = await db.collection('trade_users').doc(tradeUserId).collection('briefing').doc('current').get();
    const data = doc.data();

    if (force || !doc.exists || data?.stale) {
      const content = await regenerateBriefing(tradeUserId);
      return res.json({ success: true, content, source: 'regenerated' });
    }

    res.json({ success: true, content: data.content, source: 'cache' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * ADMIN: HEALTH CHECK
 * Returns status report of core infrastructure (Firebase Admin & Vertex AI).
 */
app.get("/api/admin/health", async (req, res) => {
  const statusReport: any = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      firebaseAdmin: "unknown",
      vertexAi: "unknown"
    }
  };

  try {
    // 1. Verify Firestore access
    await db.collection('trade_users').limit(1).get();
    statusReport.services.firebaseAdmin = "healthy";
  } catch (err: any) {
    statusReport.status = "unhealthy";
    statusReport.services.firebaseAdmin = `unhealthy: ${err.message}`;
  }

  try {
    // 2. Verify Vertex AI API accessibility
    if (!ai) {
      statusReport.services.vertexAi = "disabled or unconfigured";
    } else {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: "healthcheck"
      });
      if (response && response.text) {
        statusReport.services.vertexAi = "healthy";
      } else {
        throw new Error("Empty response received from Vertex AI API");
      }
    }
  } catch (err: any) {
    statusReport.status = "unhealthy";
    statusReport.services.vertexAi = `unhealthy: ${err.message}`;
  }

  const statusCode = statusReport.status === "healthy" ? 200 : 500;
  res.status(statusCode).json(statusReport);
});

/**
 * ADMIN: RESET DAILY AI USAGE
 * Uses Admin SDK — bypasses all Firestore security rules.
 */
app.post("/api/admin/reset-usage", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token format" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    if (!decodedToken.email || decodedToken.email.toLowerCase() !== "paulhallum@gmail.com") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }
  } catch (error: any) {
    return res.status(401).json({ error: `Unauthorized: ${error.message}` });
  }

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const today = new Date().toISOString().split('T')[0];
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const tradeUserId = userDoc.exists ? (userDoc.data()?.tradeUserId || `family_${userId}`) : `family_${userId}`;
    await db.collection('trade_users').doc(tradeUserId).collection('usage').doc(today)
      .set({ aiUses: 0, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * AUTH: REFRESH GOOGLE ACCESS TOKEN
 */
app.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }
  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID?.trim(),
      process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    res.json({
      access_token: credentials.access_token,
      expires_in: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600,
      refresh_token: credentials.refresh_token || refreshToken
    });
  } catch (error: any) {
    console.error("[Auth] Token refresh error:", error);
    res.status(500).json({ error: error.message || "Failed to refresh token" });
  }
});

/**
 * BILLING: CREATE STRIPE CHECKOUT SESSION
 * Requires Firebase ID token. Returns a Stripe-hosted checkout URL.
 */
app.post("/api/billing/checkout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    if (!email) {
      return res.status(400).json({ error: "Email address is required for checkout" });
    }

    const { plan } = req.body || {};
    const priceId = plan === 'yearly'
      ? (process.env.STRIPE_PRICE_ID_YEARLY || "")
      : (process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID || "");

    const paymentLink = plan === 'yearly'
      ? (process.env.STRIPE_PAYMENT_LINK_YEARLY || "https://buy.stripe.com/cNibJ1ftJaCG1KR9n500000")
      : (process.env.STRIPE_PAYMENT_LINK_MONTHLY || "https://buy.stripe.com/28E14n5T926afBH0Qz00001");

    // If Price ID is configured, create a native Stripe Checkout Session
    if (priceId) {
      if (!stripe) {
        return res.status(503).json({ error: "Stripe billing is not configured on this server." });
      }
      const redirectUrl = (req.headers.origin && typeof req.headers.origin === "string")
        ? req.headers.origin
        : (process.env.APP_URL || APP_URL);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        client_reference_id: uid,
        success_url: `${redirectUrl}/?view=settings&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${redirectUrl}/?view=settings&payment=cancelled`,
      });

      if (!session.url) {
        throw new Error("No URL returned from Stripe Checkout API");
      }

      return res.json({ url: session.url });
    }

    // Fallback: If payment link is configured, direct user to the Stripe Payment Link with tracking parameters
    if (paymentLink) {
      const url = new URL(paymentLink);
      url.searchParams.set("client_reference_id", uid);
      url.searchParams.set("prefilled_email", email);
      return res.json({ url: url.toString() });
    }

    return res.status(500).json({ error: "Stripe Price ID or Payment Link not configured in backend" });
  } catch (error: any) {
    console.error("[Stripe] Checkout session error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
});

/**
 * BILLING: STRIPE CUSTOMER PORTAL
 * Returns a Stripe Customer Portal URL for self-service subscription management.
 */
app.post("/api/billing/portal", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Stripe billing is not configured on this server." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const userData = userDoc.data() || {};
    const tradeUserId = userData.tradeUserId || `family_${uid}`;
    let stripeCustomerId = userData.stripeCustomerId;

    // 1. Fallback to family document if not directly present on user profile
    if (!stripeCustomerId && tradeUserId) {
      const familyDoc = await db.collection("trade_users").doc(tradeUserId).get();
      if (familyDoc.exists && familyDoc.data()?.stripeCustomerId) {
        stripeCustomerId = familyDoc.data()?.stripeCustomerId;
        await userDoc.ref.set({ stripeCustomerId }, { merge: true });
      }
    }

    // 2. Fallback to querying Stripe customer list by email
    if (!stripeCustomerId && email) {
      try {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          await userDoc.ref.set({ stripeCustomerId }, { merge: true });
        }
      } catch (custErr: any) {
        console.warn("[Stripe] Could not fetch customer by email:", custErr?.message);
      }
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No active subscription or customer profile found" });
    }

    const redirectUrl = (req.headers.origin && typeof req.headers.origin === "string")
      ? req.headers.origin
      : (process.env.APP_URL || APP_URL);

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${redirectUrl}/?view=settings&fromStripe=true`,
      });

      return res.json({ url: portalSession.url });
    } catch (portalErr: any) {
      console.error("[Stripe] Billing portal session creation error:", portalErr);
      if (portalErr?.code === 'configuration_not_found' || portalErr?.message?.includes('portal')) {
        return res.status(400).json({
          error: "Stripe Customer Portal is not yet activated in the Stripe Dashboard. Please ensure Customer Portal is enabled in Stripe Settings."
        });
      }
      return res.status(500).json({ error: portalErr.message || "Failed to create portal session" });
    }
  } catch (error: any) {
    console.error("[Stripe] Customer portal error:", error);
    res.status(500).json({ error: error.message || "Failed to create portal session" });
  }
});

/**
 * BILLING: SYNC SUBSCRIPTION STATUS DIRECTLY WITH STRIPE
 * Checks Stripe for active subscriptions/purchases matching user's email or customer ID and updates Firestore.
 */
app.post("/api/billing/sync-subscription", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Stripe billing is not configured on this server." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const { session_id } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "User email required" });
    }

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data() || {};
    const tradeUserId = userData.tradeUserId || `family_${uid}`;
    let activeSubFound = false;
    let stripeCustomerId = userData.stripeCustomerId || null;

    // 1. Check explicit session_id passed from Stripe Checkout redirect
    if (session_id && typeof session_id === 'string' && session_id.startsWith('cs_')) {
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        console.log(`[Stripe Sync] Session ${session_id}: status=${session?.status}, payment_status=${session?.payment_status}, ref=${session?.client_reference_id}`);
        if (
          session &&
          (session.status === 'complete' || session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
        ) {
          activeSubFound = true;
          if (session.customer && typeof session.customer === 'string') {
            stripeCustomerId = session.customer;
          }
        }
      } catch (sessErr: any) {
        console.warn("[Stripe Sync] Failed to retrieve session_id:", session_id, sessErr?.message);
      }
    }

    // 2. Fetch recent checkout sessions (up to 50) without strict date filtering
    if (!activeSubFound) {
      try {
        const sessions = await stripe.checkout.sessions.list({ limit: 50 });
        const completedSession = sessions.data.find((s) => {
          const isComplete = s.status === 'complete' || s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
          const matchesUser = (s.client_reference_id && s.client_reference_id === uid) || 
                              (s.customer_details?.email && s.customer_details.email.toLowerCase() === email.toLowerCase()) || 
                              (s.customer_email && s.customer_email.toLowerCase() === email.toLowerCase());
          return isComplete && matchesUser;
        });

        if (completedSession) {
          console.log(`[Stripe Sync] Matched recent session ${completedSession.id} for user ${email}`);
          activeSubFound = true;
          if (completedSession.customer && typeof completedSession.customer === 'string') {
            stripeCustomerId = completedSession.customer;
          }
        }
      } catch (sessListErr: any) {
        console.error("[Stripe Sync] Error listing sessions:", sessListErr?.message);
      }
    }

    // 3. Search Stripe customers & subscriptions directly
    if (!activeSubFound) {
      try {
        const customers = await stripe.customers.list({ limit: 50 });
        const matchingCustomer = customers.data.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
        if (matchingCustomer) {
          stripeCustomerId = matchingCustomer.id;
          const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 10 });
          const hasActiveSub = subs.data.some(sub => sub.status === 'active' || sub.status === 'trialing');
          if (hasActiveSub) {
            console.log(`[Stripe Sync] Found active subscription for customer ${stripeCustomerId}`);
            activeSubFound = true;
          }
        }
      } catch (custErr: any) {
        console.error("[Stripe Sync] Error checking customer subscriptions:", custErr?.message);
      }
    }

    let cancelAtPeriodEnd = false;
    let currentPeriodEndISO: string | null = null;

    if (stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 5 });
        const sub = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
        if (sub) {
          activeSubFound = true;
          cancelAtPeriodEnd = Boolean((sub as any).cancel_at_period_end);
          if ((sub as any).current_period_end) {
            currentPeriodEndISO = new Date((sub as any).current_period_end * 1000).toISOString();
          }
        }
      } catch (e: any) {
        console.warn("[Stripe Sync] Failed checking detailed subscription details:", e?.message);
      }
    }

    if (activeSubFound) {
      console.log(`[Stripe Sync] Active subscription confirmed for ${email} (family: ${tradeUserId}). Setting premium in Firestore.`);
      
      // Explicitly write subscriptionTier: premium, cancelAtPeriodEnd & currentPeriodEnd to trade_users/{tradeUserId}
      await db.collection("trade_users").doc(tradeUserId).set({ 
        subscriptionTier: "premium",
        cancelAtPeriodEnd,
        currentPeriodEnd: currentPeriodEndISO
      }, { merge: true });

      // Clean up subscriptionTier on user doc so user doc doesn't override family doc
      const userUpdates: any = { subscriptionTier: FieldValue.delete() };
      if (stripeCustomerId) {
        userUpdates.stripeCustomerId = stripeCustomerId;
      }
      await userDoc.ref.update(userUpdates);

      // Clean up subscriptionTier on all family members
      const familyMembersSnap = await db.collection("users").where("tradeUserId", "==", tradeUserId).get();
      for (const memberDoc of familyMembersSnap.docs) {
        await memberDoc.ref.update({ subscriptionTier: FieldValue.delete() });
      }
    } else {
      console.log(`[Stripe Sync] No active subscription found for ${email}. Setting family to free.`);
      await db.collection("trade_users").doc(tradeUserId).set({ 
        subscriptionTier: "free",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null
      }, { merge: true });
    }

    return res.json({
      success: true,
      subscriptionTier: activeSubFound ? "premium" : "free",
      cancelAtPeriodEnd,
      currentPeriodEnd: currentPeriodEndISO
    });
  } catch (error: any) {
    console.error("[Stripe Sync] Error syncing subscription:", error);
    return res.status(500).json({ error: error.message || "Failed to sync subscription" });
  }
});

/**
 * BILLING: CANCEL SUBSCRIPTION AT PERIOD END
 * Sets cancel_at_period_end = true in Stripe so user retains access until current billing period ends.
 */
app.post("/api/billing/cancel-subscription", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Stripe billing is not configured on this server." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data() || {};
    const tradeUserId = userData.tradeUserId || `family_${uid}`;
    let stripeCustomerId = userData.stripeCustomerId;

    if (!stripeCustomerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) stripeCustomerId = customers.data[0].id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No active Stripe customer found" });
    }

    const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 5 });
    if (subs.data.length === 0) {
      return res.status(400).json({ error: "No active subscription found to cancel" });
    }

    const sub = subs.data[0];
    const updatedSub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    const periodEndISO = new Date((updatedSub as any).current_period_end * 1000).toISOString();

    await db.collection("trade_users").doc(tradeUserId).set({
      subscriptionTier: "premium",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEndISO
    }, { merge: true });

    return res.json({
      success: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEndISO
    });
  } catch (error: any) {
    console.error("[Stripe Cancel] Error cancelling subscription:", error);
    return res.status(500).json({ error: error.message || "Failed to cancel subscription" });
  }
});

/**
 * BILLING: RESUME SUBSCRIPTION
 * Sets cancel_at_period_end = false in Stripe so subscription continues renewing.
 */
app.post("/api/billing/resume-subscription", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Stripe billing is not configured on this server." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data() || {};
    const tradeUserId = userData.tradeUserId || `family_${uid}`;
    let stripeCustomerId = userData.stripeCustomerId;

    if (!stripeCustomerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) stripeCustomerId = customers.data[0].id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No active Stripe customer found" });
    }

    const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 5 });
    if (subs.data.length === 0) {
      return res.status(400).json({ error: "No active subscription found to resume" });
    }

    const sub = subs.data[0];
    const updatedSub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    const periodEndISO = new Date((updatedSub as any).current_period_end * 1000).toISOString();

    await db.collection("trade_users").doc(tradeUserId).set({
      subscriptionTier: "premium",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEndISO
    }, { merge: true });

    return res.json({
      success: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEndISO
    });
  } catch (error: any) {
    console.error("[Stripe Resume] Error resuming subscription:", error);
    return res.status(500).json({ error: error.message || "Failed to resume subscription" });
  }
});

/**
 * BILLING: STRIPE WEBHOOK LISTENER
 * Validates Stripe signature, then processes subscription lifecycle events.
 */
app.post("/api/billing/webhook", async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe billing is not configured on this server." });
  }
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!sig) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return res.status(400).json({ error: "Missing signature header" });
  }
  if (!webhookSecret) {
    console.error("[Stripe Webhook] Webhook secret not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody || "", sig, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature validation failed:", err.message);
    return res.status(403).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  // Acknowledge receipt immediately
  res.sendStatus(200);

  // ── Subscription activated / payment succeeded ──────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.client_reference_id;
    const email = session.customer_details?.email || session.customer_email;
    const stripeCustomerId = session.customer as string;

    try {
      let snapshot;
      if (uid) {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          snapshot = { docs: [userDoc] };
        }
      }
      if (!snapshot && email) {
        snapshot = await db.collection("users").where("email", "==", email).get();
      }

      if (!snapshot || snapshot.docs.length === 0) {
        console.error(`[Stripe Webhook] No user found for uid: ${uid} or email: ${email}`);
        return;
      }

      const batch = db.batch();
      for (const doc of snapshot.docs) {
        const userData = doc.data();
        const tradeUserId = userData.tradeUserId || `family_${doc.id}`;
        
        console.log(`[Stripe Webhook] Upgrading family ${tradeUserId} (via subscriber ${doc.id}) to premium`);
        
        // Keep stripeCustomerId on subscriber for portal lookup, store tier ONLY on family
        batch.update(doc.ref, { stripeCustomerId, subscriptionTier: FieldValue.delete() });
        batch.set(db.collection("trade_users").doc(tradeUserId), { subscriptionTier: "premium" }, { merge: true });

        // Clean up subscriptionTier field on all family members
        const familyMembersSnap = await db.collection("users").where("tradeUserId", "==", tradeUserId).get();
        for (const memberDoc of familyMembersSnap.docs) {
          batch.update(memberDoc.ref, { subscriptionTier: FieldValue.delete() });
        }
      }
      await batch.commit();
      console.log(`[Stripe Webhook] Successfully processed family subscription upgrade for ${email || uid}`);
    } catch (error: any) {
      console.error("[Stripe Webhook] Failed to process subscription upgrade:", error);
    }

  // ── Subscription cancelled ───────────────────────────────────────────────────
  } else if (
    event.type === "customer.subscription.deleted" ||
    (event.type === "customer.subscription.updated" &&
      (event.data.object as Stripe.Subscription).status === "canceled")
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId = subscription.customer as string;

    try {
      const usersRef = db.collection("users");
      const snapshot = await usersRef.where("stripeCustomerId", "==", stripeCustomerId).get();
      if (snapshot.empty) {
        console.warn(`[Stripe Webhook] No user found for Stripe customer: ${stripeCustomerId}`);
        return;
      }

      const batch = db.batch();
      for (const doc of snapshot.docs) {
        const userData = doc.data();
        const tradeUserId = userData.tradeUserId || `family_${doc.id}`;

        console.log(`[Stripe Webhook] Downgrading family ${tradeUserId} to free`);
        batch.set(db.collection("trade_users").doc(tradeUserId), { subscriptionTier: "free" }, { merge: true });

        // Clean up subscriptionTier field on all family members
        const familyMembersSnap = await db.collection("users").where("tradeUserId", "==", tradeUserId).get();
        for (const memberDoc of familyMembersSnap.docs) {
          batch.update(memberDoc.ref, { subscriptionTier: FieldValue.delete() });
        }
      }
      await batch.commit();
      console.log(`[Stripe Webhook] Successfully downgraded family for customer ${stripeCustomerId} to free`);
    } catch (error: any) {
      console.error("[Stripe Webhook] Failed to process subscription downgrade:", error);
    }

  // ── Payment failed ───────────────────────────────────────────────────────────
  } else if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn(`[Stripe Webhook] Payment failed for customer: ${invoice.customer}`);
  }
});

// Serve the React Frontend
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath, { index: false }));

// Explicitly serve the Firebase Messaging Service Worker with correct Content-Type.
app.get("/firebase-messaging-sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(distPath, "firebase-messaging-sw.js"));
});

// Inject process.env securely for the frontend entrypoint
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.sendFile(indexPath);
  } else {
    res.status(404).send("App not built yet. Run npm run build.");
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`➜ App URL: http://localhost:${PORT}`);
  console.log(`OAuth Callback URL: ${APP_URL}/auth/callback`);
});
