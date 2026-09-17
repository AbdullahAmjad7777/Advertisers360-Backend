import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { assertParticipant } from './conversation.service.js';
import { findParticipantIds } from '../models/conversation.model.js';
import {
  insertMessage,
  findMessageById,
  findMessagesPaginated,
  insertReadReceipt,
} from '../models/message.model.js';

export async function sendMessage({ conversationId, senderId, content, attachmentPath, attachmentMimeType }) {
  await assertParticipant(conversationId, senderId);

  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  if (!trimmedContent && !attachmentPath) {
    throw new ApiError(422, 'A message needs text content or an attachment');
  }

  const id = await insertMessage({
    conversationId,
    senderId,
    content: trimmedContent || null,
    attachmentPath,
    attachmentMimeType,
  });
  const message = await findMessageById(id);
  const participantIds = await findParticipantIds(conversationId);

  return { message, participantIds };
}

export async function listMessages(conversationId, employeeId, { page, limit, offset }) {
  await assertParticipant(conversationId, employeeId);
  const { rows, total } = await findMessagesPaginated({ conversationId, limit, offset });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

export async function markMessageRead(messageId, employeeId) {
  const message = await findMessageById(messageId);
  if (!message) {
    throw new ApiError(404, 'Message not found');
  }
  await assertParticipant(message.conversation_id, employeeId);
  await insertReadReceipt(messageId, employeeId);
  return message;
}

export async function getMessageAttachment(messageId, employeeId) {
  const message = await findMessageById(messageId);
  if (!message || !message.attachment_path) {
    throw new ApiError(404, 'Attachment not found');
  }
  await assertParticipant(message.conversation_id, employeeId);
  return message;
}
