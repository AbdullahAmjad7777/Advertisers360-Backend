import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import * as notificationService from '../services/notification.service.js';

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const result = await notificationService.listForRecipient(req.user.id, pagination);
  res.json({ success: true, message: 'Notifications fetched', data: result });
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markNotificationRead(Number(req.params.id), req.user.id);
  res.json({ success: true, message: 'Notification marked as read' });
});

