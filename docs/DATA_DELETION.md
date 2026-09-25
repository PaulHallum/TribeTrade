# Data Deletion Instructions

**Effective Date:** 12 August 2026

At Tribe, we believe you should have complete control over your personal and family data. If you wish to stop using Tribe, you can permanently delete your account and all associated data directly from within the app.

## How to Delete Your Account

You can initiate the account deletion process at any time by following these steps:

1. Open the Tribe application.
2. Navigate to the **Settings** menu.
3. Scroll to the bottom of the page and select **Delete Account**.
4. You will be prompted to confirm this action. Please note that **this action is irreversible**.

## What Happens When You Delete Your Account?

Because Tribe operates on a shared "Family Hub" model, the deletion process varies slightly depending on whether you are the sole member of your family or if other members are actively using the shared workspace. 

When you confirm account deletion, our automated backend systems (`onDeleteUser` Cloud Function) will immediately execute the following actions:

### 1. Your Personal Data is Wiped
Regardless of your family status, the following personal data is permanently scrubbed from our database:
- Your main user profile and authentication credentials.
- Your personal settings, UI preferences, and push notification tokens.
- All encrypted OAuth tokens (Google, Microsoft, Yahoo) associated exclusively with your user ID.
- Your billing and subscription metadata.

### 2. If You Are the ONLY Member of Your Family Hub
If no other registered users belong to your Family Hub, the entire multi-tenant workspace is permanently destroyed. This includes the deletion of:
- All family Tasks, Subtasks, and Task Categories.
- All family Calendar Events and Reminders.
- All family Notes, Meal Plans, Recipes, and Shopping Lists.
- Daily Briefings, AI Usage Logs, and Family Memories.
- The root Family document itself.

*Once completed, no trace of your family's workspace will remain on our servers.*

### 3. If Other Members Remain in Your Family Hub
If your Family Hub has other active users (e.g., your partner or children), the shared family workspace (like family tasks and the shopping list) will remain intact so as not to disrupt their service. However, your specific footprint will be scrubbed:
- Your specific "Member" profile within the family will be deleted.
- Your name and email will be scrubbed from the family member roster.
- Any connected email accounts you linked to the hub will be disconnected and the tokens destroyed.

## Third-Party Connections (Google, Microsoft, Yahoo)

Deleting your Tribe account automatically destroys our access tokens. However, for complete peace of mind, you can also revoke Tribe's access directly from your email provider's security settings prior to deleting your account:
- **Google:** Go to your [Google Account Security Page](https://myaccount.google.com/permissions) and remove access for "Tribe".
- **Microsoft:** Go to your [Microsoft Account Privacy Page](https://account.microsoft.com/privacy) and revoke access.
- **Yahoo:** Go to your Yahoo Account Security settings and manage app connections.

## Need Help?

If you lose access to your account and need us to manually process a deletion request on your behalf, please reach out to our support team with the email address associated with your account, and we will process the deletion within 30 days in compliance with GDPR.
