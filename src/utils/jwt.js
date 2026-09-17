import jwt from 'jsonwebtoken';

export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// Same signature check as verifyRefreshToken, but doesn't reject an expired
// token. Used only by the agent-uninstall check/ack endpoints (see
// routes/agent-uninstall.routes.js): a machine that's been offline long
// enough for its 7-day refresh token to lapse is exactly the "forgotten
// laptop" case that feature exists for, and the signature alone (which
// never expires and can't be forged without JWT_REFRESH_SECRET) is enough
// to trust "this really is a device we once issued a credential to" for
// that narrow, read-only purpose — nothing this proves lets the caller
// mint a session or read/write anything beyond its own uninstall flag.
export function verifyRefreshTokenIgnoringExpiry(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, { ignoreExpiration: true });
}
