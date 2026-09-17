import dotenv from 'dotenv';
import { UTApi } from 'uploadthing/server';
import { ApiError } from './ApiError.js';

// Defensive dotenv.config() call, same as config/db.js and config/office-location.js:
// ES module imports are hoisted and evaluated before server.js's own top-level
// dotenv.config() call runs, so without this, process.env.UPLOADTHING_TOKEN
// would still be undefined when the UTApi instance below is constructed.
dotenv.config();

export const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

export async function uploadBufferToUploadThing(buffer, filename, mimetype) {
  const file = new File([buffer], filename, { type: mimetype });
  const result = await utapi.uploadFiles(file);

  if (result.error) {
    throw new ApiError(502, `File upload failed: ${result.error.message}`);
  }

  return result.data.url;
}
