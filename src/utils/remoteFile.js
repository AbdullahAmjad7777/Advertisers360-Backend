import { Readable } from 'node:stream';
import { ApiError } from './ApiError.js';

export function isRemoteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

// Fetches a file from UploadThing (or any http(s) URL) and streams it through
// to the response, preserving the auth/permission checks the caller already
// did — the client only ever talks to our own API, never UploadThing directly.
export async function proxyRemoteFile(url, res, { contentTypeOverride } = {}) {
  const upstream = await fetch(url);

  if (!upstream.ok || !upstream.body) {
    throw new ApiError(404, 'File is missing from storage');
  }

  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.type(contentTypeOverride ?? upstream.headers.get('content-type') ?? 'application/octet-stream');

  Readable.fromWeb(upstream.body).pipe(res);
}
