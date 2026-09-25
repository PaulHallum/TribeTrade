import { setGlobalOptions } from "firebase-functions";
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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

  const bucket = admin.storage().bucket("tribetrader.firebasestorage.app");
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
