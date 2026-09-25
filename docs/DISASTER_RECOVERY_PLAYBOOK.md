# Firestore Disaster Recovery Playbook

> **Target Audience:** Internal Engineering / Ops  
> **Scope:** Cloud Firestore (Native Mode) Recovery Procedures  
> **Status:** HIGH PRIORITY EMERGENCY REFERENCE

This document outlines the exact procedures for responding to data loss events in the Tribe production environment. 

---

## 1. Enabling Backups (Pre-Requisites)

To ensure these recovery steps work during an emergency, both Point-in-Time Recovery (PITR) and Scheduled Backups **must** be active in the Google Cloud Console.

### 1.1 Enable Point-in-Time Recovery (PITR)
PITR allows you to read data from exactly how it looked at any microsecond within the past **7 days**.
1. Open the [Google Cloud Console > Firestore](https://console.cloud.google.com/firestore).
2. Click on **Databases** and select the `(default)` database.
3. In the right-hand panel (or the **Data Protection** tab), locate **Point-in-Time Recovery (PITR)**.
4. Click **Edit** and toggle PITR to **Enabled**.

### 1.2 Enable Scheduled Daily Backups
For disaster scenarios older than 7 days, or full region failure.
1. Open [Google Cloud Console > Firestore > Data Protection](https://console.cloud.google.com/firestore/data-protection).
2. Under **Backup schedules**, click **Create Backup Schedule**.
3. Select the `(default)` database.
4. Set the retention period to **30 Days** (or company standard).
5. Set the recurrence to **Daily**.

---

## 2. Restoring Data (Single Family / Granular Restore)

**Scenario:** A parent accidentally deleted their entire family hub (tasks, meals, events) 2 hours ago and submitted a frantic support ticket.

Because Tribe uses a multi-tenant architecture where all documents are scoped by `familyId`, you **cannot** simply roll back the entire production database without destroying data for thousands of other active families.

You must use PITR to extract the specific family's data from a past timestamp and re-insert it into production.

### The Granular PITR Recovery Flow

**Step 1: Determine the recovery timestamp**
Calculate the exact UTC timestamp before the accidental deletion occurred (e.g., `2026-08-12T08:00:00Z`).

**Step 2: Export the specific family data from the PITR snapshot**
Use the `gcloud` CLI to perform a PITR export into a temporary Cloud Storage bucket. Note that Firestore exports support filtering by collection groups, but not arbitrary field filters (like `familyId`) natively via CLI. 

The fastest emergency approach is to restore the entire snapshot to a **temporary database**, then run a script to copy the specific `familyId` back.

```bash
# 1. Create a temporary database for recovery
gcloud firestore databases create --database="recovery-db-temp" --location="europe-west2" --type="firestore-native"

# 2. Restore the PITR snapshot to the temporary database
# Replace the timestamp with the exact time BEFORE the deletion
gcloud firestore databases restore \
    --source-database="(default)" \
    --destination-database="recovery-db-temp" \
    --recovery-point="2026-08-12T08:00:00Z"
```

**Step 3: Extract and Inject the Data**
Once the `recovery-db-temp` is populated, use a custom Node.js admin script to read all documents belonging to the affected `familyId` from `recovery-db-temp` and write them back to `(default)`.

```javascript
// Pseudo-code for emergency script
const admin = require('firebase-admin');
const liveDb = admin.firestore(); // (default)
const recoveryDb = admin.initializeApp({ databaseId: 'recovery-db-temp' }, 'recovery').firestore();

const familyId = "TARGET_FAMILY_ID";
const collections = ['tasks', 'meals', 'events', 'notes']; // Add all family subcollections

async function restoreFamily() {
  // 1. Get the core family document
  const familyDoc = await recoveryDb.collection('families').doc(familyId).get();
  await liveDb.collection('families').doc(familyId).set(familyDoc.data());

  // 2. Iterate and copy subcollections
  for (const coll of collections) {
    const snapshot = await recoveryDb.collection('families').doc(familyId).collection(coll).get();
    const batch = liveDb.batch();
    snapshot.forEach(doc => {
      batch.set(liveDb.collection('families').doc(familyId).collection(coll).doc(doc.id), doc.data());
    });
    await batch.commit();
  }
  console.log(`Successfully restored family: ${familyId}`);
}
```

**Step 4: Cleanup**
```bash
gcloud firestore databases delete --database="recovery-db-temp" --quiet
```

---

## 3. The "Break Glass" Scenario (Total Database Restore)

**Scenario:** Catastrophic data corruption across the entire production database, accidental massive script deletion, or a malicious attack. You need to roll back the **entire** Tribe application.

**WARNING:** This will cause all families to lose data created between the backup timestamp and now. This is a last resort.

### Step-by-Step Full Restore

**1. Identify the Backup to Restore**
List all available scheduled backups:
```bash
gcloud firestore backups list --format="table(name, state, expireTime)"
```
Copy the full `name` (the Backup ID) of the target backup.

**2. Initiate the Restore to a NEW Database**
Firestore does not allow you to restore directly over an existing active database. You must restore to a new database ID.
```bash
gcloud firestore databases restore \
    --source-backup="projects/notegeniusfamily/locations/europe-west2/backups/YOUR_BACKUP_ID" \
    --destination-database="restored-default-db"
```
*Note: Depending on database size, this can take anywhere from minutes to hours.*

**3. Cutover Production Traffic**
Once `restored-default-db` is fully restored and verified, you must update the application to point to the new database.
- **Firebase Clients:** Update `firestoreDatabaseId` in `firebase-applet-config.json` (and redeploy hosting).
- **Cloud Run Backend:** Add the `FIRESTORE_DATABASE_ID="restored-default-db"` environment variable to your Cloud Run instances and redeploy.
- **Cloud Functions:** Update initialisation code to target the new database ID and redeploy.

**4. Deprecate the Corrupted Database**
Once all traffic is successfully pointing to `restored-default-db`, revoke access to the original `(default)` database and safely schedule it for deletion.
