import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Frontend and backend are deployed on different origins (e.g.
// advertisers360.vercel.app vs advertiser360-backend.vercel.app), so this
// cookie is sent on cross-site requests. Browsers only attach a cookie
// cross-site when it's SameSite=None, and SameSite=None is rejected outright
// unless paired with Secure — with the previous 'lax' setting, the browser
// silently dropped the cookie on every cross-origin /auth/refresh call, so
// the session never survived a page reload. Secure requires HTTPS, which
// only production has, so local HTTP dev keeps 'lax'.
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

export const login = asyncHandler(async (req, res) => {
  const { email, password, latitude, longitude, accuracy } = req.body;

  const { accessToken, refreshToken, user } = await authService.login({
    email,
    password,
    ipAddress: getClientIp(req),
    deviceInfo: req.headers['user-agent'] ?? null,
    latitude: latitude != null ? Number(latitude) : undefined,
    longitude: longitude != null ? Number(longitude) : undefined,
    accuracyMeters: accuracy != null ? Number(accuracy) : undefined,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logged in successfully', data: { accessToken, user } });
});

export const agentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { accessToken, refreshToken, user } = await authService.agentLogin({
    email,
    password,
    ipAddress: getClientIp(req),
    deviceInfo: req.headers['user-agent'] ?? null,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logged in successfully', data: { accessToken, user } });
});

export const verifyLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracy } = req.body;
  const result = await authService.verifyLocation(
    req.user.id,
    latitude != null ? Number(latitude) : undefined,
    longitude != null ? Number(longitude) : undefined,
    accuracy != null ? Number(accuracy) : undefined,
  );
  res.json({ success: true, message: 'Location checked', data: result });
});

export const refresh = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken } = await authService.refreshAccessToken(
    req.cookies?.[REFRESH_COOKIE_NAME],
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({ success: true, message: 'Token refreshed', data: { accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.json({ success: true, message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user.id);
  res.json({ success: true, message: 'Profile fetched', data: profile });
});
