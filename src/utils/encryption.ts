import crypto from 'node:crypto';

/**
 * Derives a 32-byte (256-bit) encryption key from environment variable or fallback secret.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.OAUTH_ENCRYPTION_KEY || 
                 process.env.ENCRYPTION_KEY || 
                 process.env.INTERNAL_SHARED_SECRET || 
                 'notegenius-family-oauth-vault-key-32bytes';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext OAuth token using AES-256-GCM.
 * Returns a colon-delimited string format: `iv:authTag:encryptedData`
 */
export function encryptToken(text: string): string {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token string.
 * Expects colon-delimited format: `iv:authTag:encryptedData`
 */
export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format. Expected iv:authTag:encryptedData');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// Aliases for general purpose encryption
export const encrypt = encryptToken;
export const decrypt = decryptToken;
