import crypto from 'node:crypto';

// Raw token goes in the emailed link and is never stored; only its hash is
// persisted, so a DB leak alone can't be used to complete an invitation.
export function generateSecureToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
