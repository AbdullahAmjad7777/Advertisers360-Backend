// New attachments go to UploadThing (see utils/uploadthing.js); the local
// chat-attachments directory is no longer written to. config/uploads.js's
// BACKEND_ROOT still resolves attachment_path values for messages sent
// before this migration.

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Video
  'video/mp4',
  'video/quicktime',
  // Audio (voice messages and common audio file uploads)
  'audio/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
