import path from 'node:path';
import fs from 'node:fs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { ApiError } from '../utils/ApiError.js';
import { BACKEND_ROOT } from '../config/uploads.js';
import { uploadBufferToUploadThing } from '../utils/uploadthing.js';
import { isRemoteUrl, proxyRemoteFile } from '../utils/remoteFile.js';
import * as messageService from '../services/message.service.js';

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const result = await messageService.listMessages(
    Number(req.params.id),
    req.user.id,
    pagination,
  );
  res.json({ success: true, message: 'Messages fetched', data: result });
});

export const create = asyncHandler(async (req, res) => {
  let attachmentPath = null;
  let attachmentMimeType = null;
  if (req.file) {
    const ext = path.extname(req.file.originalname) || '';
    const filename = `msg_${req.user.id}_${Date.now()}${ext}`;
    attachmentPath = await uploadBufferToUploadThing(req.file.buffer, filename, req.file.mimetype);
    attachmentMimeType = req.file.mimetype;
  }

  const { message, participantIds } = await messageService.sendMessage({
    conversationId: Number(req.params.id),
    senderId: req.user.id,
    content: req.body.content,
    attachmentPath,
    attachmentMimeType,
  });

  const io = req.app.get('io');
  if (io) {
    for (const employeeId of participantIds) {
      if (employeeId !== req.user.id) {
        io.to(`user:${employeeId}`).emit('message:new', message);
      }
    }
  }

  res.status(201).json({ success: true, message: 'Message sent', data: message });
});

export const markRead = asyncHandler(async (req, res) => {
  await messageService.markMessageRead(Number(req.params.id), req.user.id);
  res.json({ success: true, message: 'Message marked as read' });
});

export const getAttachment = asyncHandler(async (req, res) => {
  const message = await messageService.getMessageAttachment(Number(req.params.id), req.user.id);

  // Prefer the mime type captured at upload time. Express/mime and
  // UploadThing both default .webm to video/webm, but the only .webm files
  // this app ever stores are voice message recordings (video/webm isn't in
  // the allowed upload types) — force the correct audio type for <audio>
  // tags. Messages sent before attachment_mime_type existed fall back to
  // that extension check.
  const contentTypeOverride =
    message.attachment_mime_type ??
    (message.attachment_path.endsWith('.webm') ? 'audio/webm' : undefined);

  // New attachments are uploaded to UploadThing (attachment_path is a URL);
  // older attachments sent before this migration are still on local disk and
  // were deliberately not migrated — both need to keep working.
  if (isRemoteUrl(message.attachment_path)) {
    await proxyRemoteFile(message.attachment_path, res, { contentTypeOverride });
    return;
  }

  const absolutePath = path.join(BACKEND_ROOT, message.attachment_path);

  if (!fs.existsSync(absolutePath)) {
    throw new ApiError(404, 'Attachment file is missing on disk');
  }

  // Helmet's default same-origin CORP header blocks the frontend (different
  // port) from embedding this as an
  // <img> or downloading it, even though the request itself succeeds.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');

  if (contentTypeOverride) {
    res.type(contentTypeOverride);
  }

  res.sendFile(absolutePath);
});
