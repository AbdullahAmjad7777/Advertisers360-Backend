import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import * as conversationService from '../services/conversation.service.js';

export const create = asyncHandler(async (req, res) => {
  const { participantIds, isGroup, name } = req.body;

  const conversation = await conversationService.createConversation({
    createdBy: req.user.id,
    participantIds: participantIds.map(Number),
    isGroup,
    name,
  });

  res.status(201).json({ success: true, message: 'Conversation created', data: conversation });
});

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const result = await conversationService.listConversationsForEmployee(req.user.id, pagination);
  res.json({ success: true, message: 'Conversations fetched', data: result });
});
