# Support & Refund Playbook

> **Target Audience:** Internal Ops & Customer Support  
> **Scope:** Stripe Billing & Firestore Manual Overrides  
> **Status:** ACTIVE REFERENCE

This playbook provides foolproof, step-by-step instructions for handling billing-related support tickets, processing refunds, and manually correcting account statuses. These actions should take less than 2 minutes per ticket.

---

## 1. Issuing a Refund (via Stripe)

**Scenario:** A user forgot to cancel their 21-day reverse trial and was charged. They emailed support asking for a refund.

1. **Log in** to your [Stripe Dashboard](https://dashboard.stripe.com/).
2. In the top search bar, search for the user's **email address** or their **name**.
3. Click on the customer from the search results to open their **Customer Details page**.
4. Scroll down to the **Payments** section.
5. Click on the specific successful payment (charge) that needs to be refunded.
6. In the top right corner of the Payment details page, click the **Refund** button.
7. A modal will appear. Choose to issue a **Full refund** or enter a specific amount for a **Partial refund**.
8. Select a **Reason** for the refund from the dropdown (e.g., "Requested by customer").
9. Click **Refund**. 
   *(Note: The funds will take 5-10 business days to appear in the customer's bank account).*

---

## 2. Manual Subscription Cancellation (via Stripe)

**Scenario:** A user emails support asking to cancel their subscription because they cannot figure out how to do it in the app.

1. **Log in** to your [Stripe Dashboard](https://dashboard.stripe.com/).
2. Search for the user's **email address** in the top search bar and click their profile.
3. Scroll down to the **Subscriptions** section.
4. Click on the active subscription (usually labeled with the £7.95/month or £79.00/year plan).
5. In the top right corner of the Subscription details page, click **Cancel subscription**.
6. A modal will appear. You must choose *when* the cancellation takes effect:
   - **Immediately:** (Recommended for refunds or angry customers) Revokes access right now.
   - **At the end of the current period:** (Recommended for standard requests) Allows them to use the app until their paid month runs out.
7. Click **Cancel subscription**. 
   *(Note: The Stripe webhook will automatically fire and update their Firestore status).*

---

## 3. Manual Firestore Override (The "Webhook Failed" Fix)

**Scenario:** The user cancelled their subscription in Stripe (or payment failed), but they claim they are either locked out in error, or they are still getting premium features for free. The Stripe webhook failed to update their Firestore document. 

You must manually update their `subscriptionStatus` in the Firebase Console.

### Step 3.1: Find the User's `familyId`
1. Open the [Firebase Console](https://console.firebase.google.com/) and navigate to your `notegeniusfamily` project.
2. Go to **Authentication** in the left sidebar.
3. Search for the user by their **email address**.
4. Copy their **User UID**.

### Step 3.2: Locate the Family Document
1. Go to **Firestore Database** in the left sidebar.
2. Select the `users` collection.
3. Paste the **User UID** into the filter/search bar (or find the document matching the UID).
4. Look at the document data and copy the value of the `familyId` field.

### Step 3.3: Override the Subscription Status
1. Navigate to the `families` collection.
2. Find the document that matches the `familyId` you just copied.
3. Locate the `subscriptionStatus` field. 
4. Click the **pencil icon** next to the value and change it to the correct status:
   - Type `"active"` (to grant premium access)
   - Type `"canceled"` (to revoke premium access)
   - Type `"trialing"` (to put them back in the 21-day trial)
5. Click **Update** to save the changes. The user's app will instantly reflect the new status via real-time listeners.

*(Optional Check: You may also want to manually update the `subscriptionTier` field to `"free"` or `"premium"` to ensure absolute consistency, depending on how your client-side logic prioritizes the fields).*
