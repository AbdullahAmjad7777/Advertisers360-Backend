import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { findByRecipientPaginated, markAsRead } from '../models/notification.model.js';

export async function listForRecipient(recipientId, { page, limit, offset }) {
  const { rows, total } = await findByRecipientPaginated(recipientId, { limit, offset });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

export async function markNotificationRead(notificationId, recipientId) {
  const updated = await markAsRead(notificationId, recipientId);
  if (!updated) {
    throw new ApiError(404, 'Notification not found');
  }
}
