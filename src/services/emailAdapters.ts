/**
 * UNIFIED EMAIL NORMALISER ADAPTERS
 * Maps raw payloads from Gmail API, Microsoft Graph API, and Yahoo REST API
 * into a single unified NormalisedEmailMessage structure for EmailView.tsx.
 */

export interface NormalisedEmailMessage {
  id: string;
  accountId?: string;
  accountEmail?: string;
  provider: 'google' | 'microsoft' | 'yahoo' | 'apple';
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
  body?: string;
  bodyError?: string;
}

/**
 * Adapter: Microsoft Graph REST API (/v1.0/me/messages)
 */
export function normalizeMicrosoftEmail(rawMsg: any, accountId?: string, accountEmail?: string): NormalisedEmailMessage {
  const fromAddress = rawMsg.from?.emailAddress?.address || '';
  const fromName = rawMsg.from?.emailAddress?.name || fromAddress;
  const fromFormatted = fromAddress ? `${fromName} <${fromAddress}>` : 'Unknown Sender';

  return {
    id: rawMsg.id,
    accountId,
    accountEmail,
    provider: 'microsoft',
    subject: rawMsg.subject || '(No Subject)',
    from: fromFormatted,
    snippet: rawMsg.bodyPreview || '',
    date: rawMsg.receivedDateTime || new Date().toISOString(),
    unread: !rawMsg.isRead,
    body: rawMsg.body?.content || rawMsg.bodyPreview || ''
  };
}

/**
 * Adapter: Yahoo REST / Sky Mail
 */
export function normalizeYahooEmail(rawMsg: any, accountId?: string, accountEmail?: string): NormalisedEmailMessage {
  return {
    id: rawMsg.id || `yahoo_${Date.now()}`,
    accountId,
    accountEmail,
    provider: 'yahoo',
    subject: rawMsg.subject || '(No Subject)',
    from: rawMsg.from || 'Yahoo Mail',
    snippet: rawMsg.snippet || rawMsg.body || '',
    date: rawMsg.date || new Date().toISOString(),
    unread: !!rawMsg.unread,
    body: rawMsg.body || ''
  };
}

/**
 * Adapter: Google Gmail API
 */
export function normalizeGmailEmail(rawMsg: any, accountId?: string, accountEmail?: string): NormalisedEmailMessage {
  const headers = rawMsg.payload?.headers || [];
  const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
  const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
  const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

  return {
    id: rawMsg.id,
    accountId,
    accountEmail,
    provider: 'google',
    subject: subjectHeader?.value || '(No Subject)',
    from: fromHeader?.value || 'Unknown Sender',
    snippet: rawMsg.snippet || '',
    date: dateHeader?.value ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
    unread: Array.isArray(rawMsg.labelIds) && rawMsg.labelIds.includes('UNREAD'),
    body: rawMsg.snippet || ''
  };
}

/**
 * Service function: Fetches connected messages across all non-Google connected OAuth accounts via backend endpoint
 */
export async function fetchConnectedAccountsMessages(idToken: string): Promise<NormalisedEmailMessage[]> {
  if (!idToken) return [];
  try {
    const res = await fetch('/api/oauth/messages', {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    const contentType = res.headers.get('content-type');
    if (!res.ok || !contentType?.includes('application/json')) return [];
    const data = await res.json();
    return (data.messages || []).map((msg: any) => ({
      id: msg.id,
      accountId: msg.accountId,
      accountEmail: msg.accountEmail,
      provider: msg.provider || 'microsoft',
      subject: msg.subject || '(No Subject)',
      from: msg.from || 'Unknown Sender',
      snippet: msg.snippet || '',
      date: msg.date || new Date().toISOString(),
      unread: !!msg.unread,
      body: msg.body || ''
    }));
  } catch (err) {
    console.warn('[EmailAdapters] Failed to fetch connected messages:', err);
    return [];
  }
}
