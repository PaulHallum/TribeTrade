import { setGlobalOptions } from "firebase-functions";
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as textToSpeech from "@google-cloud/text-to-speech";

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10, region: "europe-west2" });

// Lazy init the client to avoid cold start issues if not called
let ttsClient: textToSpeech.TextToSpeechClient | null = null;

function getTtsClient() {
  if (!ttsClient) {
    ttsClient = new textToSpeech.TextToSpeechClient();
  }
  return ttsClient;
}

export const getTribeAudio = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called by an authenticated user.");
  }
  const text = request.data.text;
  if (!text || typeof text !== 'string') {
    throw new HttpsError("invalid-argument", "The function must be called with a 'text' string parameter.");
  }

  // Allow optional voiceOverride parameter (e.g. 'en-GB-Neural2-A' or 'en-GB-Neural2-B')
  const voiceName = request.data.voice || 'en-GB-Neural2-A';

  try {
    const client = getTtsClient();
    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: 'en-GB',
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9, // 0.9x speed for a natural human pace
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new HttpsError("internal", "No audio content returned from Text-to-Speech API.");
    }

    // Convert to base64 string
    const base64Audio = typeof audioContent === 'string' 
      ? audioContent 
      : Buffer.from(audioContent).toString('base64');

    return { audioContent: base64Audio };
  } catch (error: any) {
    throw new HttpsError("internal", `Text-to-Speech failed: ${error.message}`);
  }
});

export const getTribeAudioCached = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called by an authenticated user.");
  }

  const { tradeUserId, userId, briefingText } = request.data;
  if (!tradeUserId || !userId || !briefingText) {
    throw new HttpsError("invalid-argument", "Missing required parameters: tradeUserId, userId, or briefingText.");
  }

  // 1. Verify premium subscriber status via claims first
  let isPremium = request.auth.token.subscriptionTier === 'premium';
  if (!isPremium) {
    // Fallback: check Firestore user document directly
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (userDoc.exists && userDoc.data()?.subscriptionTier === 'premium') {
      isPremium = true;
    }
  }

  // Check family document's subscriptionTier
  if (!isPremium && tradeUserId) {
    const familyDoc = await db.collection("trade_users").doc(tradeUserId).get();
    if (familyDoc.exists && familyDoc.data()?.subscriptionTier === 'premium') {
      isPremium = true;
    }
  }

  if (!isPremium) {
    // Check billing document for beta tester bypass or active 21-day trial
    const billingDoc = await db.collection("users").doc(request.auth.uid).collection("private").doc("billing").get();
    if (billingDoc.exists) {
      const bData = billingDoc.data();
      if (bData?.isBetaTester === true) {
        isPremium = true;
      } else if (bData?.trialEndsAt) {
        const trialEnds = new Date(bData.trialEndsAt).getTime();
        if (trialEnds > Date.now()) {
          isPremium = true;
        }
      }
    }
  }

  // Check if family is marked as a beta tester
  if (!isPremium && tradeUserId) {
    const familyDoc = await db.collection("trade_users").doc(tradeUserId).get();
    if (familyDoc.exists && familyDoc.data()?.isBetaTester === true) {
      isPremium = true;
    } else {
      // Propagate beta tester status from user to family document
      const billingDoc = await db.collection("users").doc(request.auth.uid).collection("private").doc("billing").get();
      if (billingDoc.exists && billingDoc.data()?.isBetaTester === true) {
        await db.collection("trade_users").doc(tradeUserId).set({ isBetaTester: true }, { merge: true });
        isPremium = true;
      }
    }
  }

  if (!isPremium) {
    throw new HttpsError("permission-denied", "Only active Premium subscribers or verified Beta Testers can use cached audio synthesis.");
  }

  // 2. Generate daily filename key using today's date
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}_${mm}_${dd}`;
  const filePath = `audio_cache/${tradeUserId}/briefing_${dateStr}.mp3`;

  const bucketName = process.env.STORAGE_BUCKET || "tribetrader-audio-cache";
  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(filePath);

  try {
    // 3. Check if today's file already exists in Storage
    const [exists] = await file.exists();
    if (exists) {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days expiry
      });
      return { audioUrl: url };
    }

    // 4. Generate new audio via Google Cloud TTS API (premium voice en-GB-Neural2-A at 0.9x speed)
    const client = getTtsClient();
    const [response] = await client.synthesizeSpeech({
      input: { text: briefingText },
      voice: {
        languageCode: 'en-GB',
        name: 'en-GB-Neural2-A',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9,
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new HttpsError("internal", "No audio content returned from Text-to-Speech API.");
    }

    // 5. Upload buffer to Firebase Storage
    const buffer = Buffer.from(audioContent as Uint8Array);
    await file.save(buffer, {
      contentType: 'audio/mpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // 6. Return 30-day signed URL
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days expiry
    });

    return { audioUrl: url };
  } catch (error: any) {
    throw new HttpsError("internal", `getTribeAudioCached failed: ${error.message}`);
  }
});

export const onDeleteUser = functions.auth.user().onDelete(async (user: admin.auth.UserRecord) => {
  const { uid, email, displayName } = user;
  console.log(`User deletion triggered for uid: ${uid}, email: ${email}`);

  const collectionsToDelete = [
    'tasks', 'notes', 'members', 'calendarEvents', 'shoppingList', 
    'taskCategories', 'meals', 'mealPlans', 'preferences', 'memories', 
    'logs', 'nearby', 'briefing'
  ];

  async function deleteCollection(ref: admin.firestore.CollectionReference) {
    const snapshot = await ref.limit(100).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    if (snapshot.size === 100) {
      await deleteCollection(ref);
    }
  }

  try {
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      const tradeUserId = userDoc.data()?.tradeUserId;
      if (tradeUserId) {
        // Check if other users belong to this family
        const otherUsersSnap = await db.collection('users')
          .where('tradeUserId', '==', tradeUserId)
          .get();
        
        const otherUsersCount = otherUsersSnap.docs.filter(doc => doc.id !== uid).length;

        if (otherUsersCount === 0) {
          console.log(`No other users in family ${tradeUserId}. Deleting family data...`);
          // WIPE all family subcollections
          for (const sub of collectionsToDelete) {
            await deleteCollection(db.collection('trade_users').doc(tradeUserId).collection(sub));
          }
          // Delete main family doc
          await db.collection('trade_users').doc(tradeUserId).delete();
        } else {
          console.log(`Other users exist in family ${tradeUserId}. Removing user metadata...`);
          // Delete member document with ID of user's UID
          await db.collection('trade_users').doc(tradeUserId).collection('members').doc(uid).delete();
          // Scan members for email/name/userId matching matches
          const membersSnap = await db.collection('trade_users').doc(tradeUserId).collection('members').get();
          for (const doc of membersSnap.docs) {
            const data = doc.data();
            if (data.email === email || data.userId === uid || data.name === displayName) {
              await doc.ref.delete();
            }
          }
        }
      }
    }

    // Delete user subcollections
    await deleteCollection(db.collection('users').doc(uid).collection('usage'));
    await deleteCollection(db.collection('users').doc(uid).collection('settings'));
    
    // Delete main user profile document
    await userDocRef.delete();

    // Clean up auxiliary collections
    await db.collection('user_tokens').doc(uid).delete().catch(() => {});
    await db.collection('shared_data').doc(uid).delete().catch(() => {});

    console.log(`User data successfully wiped for uid: ${uid}`);
  } catch (error) {
    console.error(`Error wiping data for user ${uid}:`, error);
  }
});

export const onSupportTicketCreated = onDocumentCreated("/support_tickets/{ticketId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the support ticket event");
    return;
  }

  const ticket = snapshot.data();
  const { email, category, message } = ticket;
  const ticketId = event.params.ticketId;

  try {
    // Find the admin user by email to retrieve their tradeUserId
    const userQuery = await db.collection("users")
      .where("email", "in", ["paulhallum@gmail.com", "paulhallum@googlemail.com"])
      .limit(1)
      .get();

    if (!userQuery.empty) {
      const adminUserDoc = userQuery.docs[0];
      const adminUid = adminUserDoc.id;
      const tradeUserId = adminUserDoc.data()?.tradeUserId;

      if (tradeUserId) {
        // Create a new task in the admin's family tasks subcollection (private to admin)
        const taskRef = await db.collection("trade_users")
          .doc(tradeUserId)
          .collection("tasks")
          .add({
            title: `Support: ${category}`,
            description: `From: ${email || "Anonymous"}\n\n${message}`,
            status: "pending",
            isShared: false,
            authorId: adminUid,
            isSupport: true,
            ticketId: ticketId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        console.log(`Support ticket successfully saved as private task: ${taskRef.id} for tradeUserId: ${tradeUserId}`);

        // Try to send push notification to admin
        try {
          const settingsSnap = await db.collection("users")
            .doc(adminUid)
            .collection("settings")
            .doc("notifications")
            .get();

          if (settingsSnap.exists) {
            const settingsData = settingsSnap.data();
            if (settingsData && settingsData.enabled) {
              const tokens: string[] = [];
              if (Array.isArray(settingsData.fcmTokens)) {
                tokens.push(...settingsData.fcmTokens);
              } else if (settingsData.fcmToken) {
                tokens.push(settingsData.fcmToken);
              }

              const uniqueTokens = [...new Set(tokens)];
              if (uniqueTokens.length > 0) {
                await Promise.all(uniqueTokens.map(token => 
                  admin.messaging().send({
                    token: token,
                    notification: {
                      title: `New Support: ${category}`,
                      body: message.length > 100 ? `${message.substring(0, 97)}...` : message
                    },
                    data: {
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      type: 'task',
                      id: taskRef.id
                    }
                  }).catch(err => console.error("Error sending message to token", token, err))
                ));
                console.log(`Sent support ticket push notifications to ${uniqueTokens.length} devices.`);
              }
            }
          }
        } catch (notifErr: any) {
          console.error("Failed to send push notification to admin for support ticket:", notifErr.message);
        }
      } else {
        console.error("Found admin user document for paulhallum@gmail.com but it has no tradeUserId.");
      }
    } else {
      console.error("No user document found for admin email: paulhallum@gmail.com");
    }
  } catch (error) {
    console.error("Error creating support ticket task in admin family dashboard:", error);
  }
});

export const processDueReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west2",
    timeZone: "Europe/London",
    retryCount: 1,
    maxInstances: 1,
  },
  async () => {
    const now = new Date();
    // 2-hour freshness window: avoid blasting notifications for ancient overdue items
    const freshnessWindow = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const appUrl = process.env.APP_URL || "https://tribetrader.web.app";
    console.log(`[Scheduled Reminder Ticker] Starting run at ${now.toISOString()}`);

    const collections = ["tasks", "calendarEvents"];
    let totalSent = 0;

    for (const col of collections) {
      try {
        const snap = await db.collectionGroup(col)
          .where("notified", "==", false)
          .where("reminderTime", "<=", now)
          .where("reminderTime", ">=", freshnessWindow)
          .get();

        if (snap.empty) continue;

        console.log(`[Scheduled Reminder Ticker] Found ${snap.size} reminders to process in '${col}'`);

        for (const doc of snap.docs) {
          const data = doc.data();
          const tradeUserId = doc.ref.parent.parent?.id;
          if (!tradeUserId) continue;

          // Skip completed tasks and mark them as notified so they don't fire late reminders
          if (col === "tasks" && (data.status === "completed" || data.status === "done")) {
            await doc.ref.update({ notified: true });
            continue;
          }

          const userSnap = await db.collection("users")
            .where("tradeUserId", "==", tradeUserId)
            .get();

          if (userSnap.empty) {
            await doc.ref.update({ notified: true });
            continue;
          }

          // Get family config & members
          const familySnap = await db.collection("trade_users").doc(tradeUserId).get();
          const familyData = familySnap.data();
          const notifyBothAdultsForChildTasks = familyData?.notifyBothAdultsForChildTasks ?? true;

          const membersSnap = await db.collection("trade_users").doc(tradeUserId).collection("members").get();
          const membersList = membersSnap.docs.map(mDoc => ({ id: mDoc.id, ...mDoc.data() }));

          const memberRolesMap: Record<string, string> = {};
          const memberUserIdMap: Record<string, string> = {};
          membersList.forEach((m: any) => {
            if (m.role) memberRolesMap[m.id] = String(m.role).toLowerCase();
            if (m.userId) memberUserIdMap[m.id] = m.userId;
          });

          // Determine who is assigned
          let notifyAll = false;
          const assignedIds = Array.isArray(data.assignedTo)
            ? data.assignedTo
            : (data.assignedTo && data.assignedTo !== "all" ? [data.assignedTo] : []);

          if (!data.assignedTo || data.assignedTo === "all" || assignedIds.length === 0) {
            notifyAll = true;
          }

          // Check if any child is assigned
          let childAssigned = false;
          for (const id of assignedIds) {
            const role = memberRolesMap[id];
            if (role === "son" || role === "daughter" || role === "child" || role === "kid") {
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

            const uniqueTokens = [...new Set(tokens)];
            for (const token of uniqueTokens) {
              try {
                const isEvent = doc.ref.parent.id === "calendarEvents";
                const view = isEvent ? "calendar" : "tasks";
                const deepLink = `/?view=${view}&id=${doc.id}`;
                const notifTitle = isEvent ? `📅 ${data.title || 'Job Booking'}` : `✅ ${data.title || 'Trade Task'}`;
                const notifBody = data.description
                  ? (data.description.length > 90 ? `${data.description.substring(0, 87)}...` : data.description)
                  : (isEvent ? "Upcoming job booking in diary" : "Scheduled trade task due now");

                await admin.messaging().send({
                  token: token,
                  notification: {
                    title: notifTitle,
                    body: notifBody,
                  },
                  data: {
                    click_action: "FLUTTER_NOTIFICATION_CLICK",
                    type: "reminder",
                    id: doc.id,
                    link: deepLink,
                  },
                  android: {
                    priority: "high",
                    notification: {
                      channelId: "tribe_reminders",
                      color: "#10b981",
                      sound: "default",
                    },
                  },
                  apns: {
                    payload: { aps: { sound: "default", contentAvailable: true } },
                  },
                  webpush: {
                    headers: { Urgency: "high" },
                    notification: {
                      icon: "/icon-192.png",
                      badge: "/badge.svg",
                      tag: doc.id,
                    },
                    fcmOptions: { link: `${appUrl}${deepLink}` },
                  },
                });
                totalSent++;
              } catch (sendError: any) {
                console.warn(`[Scheduled Reminder Ticker] Failed to send to token:`, sendError.message);
              }
            }
          }

          // Mark as notified in Firestore so it doesn't trigger again
          await doc.ref.update({ notified: true });
        }
      } catch (err: any) {
        console.error(`[Scheduled Reminder Ticker] Error processing collection ${col}:`, err);
      }
    }

    console.log(`[Scheduled Reminder Ticker] Run finished. Sent ${totalSent} notifications.`);
  }
);

