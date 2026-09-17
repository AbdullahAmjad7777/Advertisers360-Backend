import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import {
  insertConversation,
  addParticipants,
  findOneOnOneConversation,
  findConversationById,
  isParticipant,
  findConversationsPaginated,
  findParticipantsForConversations,
} from '../models/conversation.model.js';

function attachParticipants(conversations, participantRows) {
  const byConversation = new Map();
  for (const row of participantRows) {
    const list = byConversation.get(row.conversation_id) ?? [];
    list.push({
      employee_id: row.employee_id,
      full_name: row.full_name,
      employee_code: row.employee_code,
    });
    byConversation.set(row.conversation_id, list);
  }
  return conversations.map((conversation) => ({
    ...conversation,
    participants: byConversation.get(conversation.id) ?? [],
  }));
}

export async function createConversation({ createdBy, participantIds, isGroup, name }) {
  const uniqueOthers = [...new Set(participantIds.filter((id) => id !== createdBy))];

  if (uniqueOthers.length === 0) {
    throw new ApiError(422, 'At least one other participant is required');
  }

  const isActuallyGroup = isGroup ?? uniqueOthers.length > 1;

  if (isActuallyGroup && !name) {
    throw new ApiError(422, 'A group conversation requires a name');
  }

  if (!isActuallyGroup) {
    const existingId = await findOneOnOneConversation(createdBy, uniqueOthers[0]);
    if (existingId) {
      return getConversationForRequester(existingId, createdBy);
    }
  }

  const allParticipantIds = [createdBy, ...uniqueOthers];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const conversationId = await insertConversation(connection, {
      isGroup: isActuallyGroup,
      name: isActuallyGroup ? name : null,
      createdBy,
    });
    await addParticipants(connection, conversationId, allParticipantIds);
    await connection.commit();
    return getConversationForRequester(conversationId, createdBy);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function listConversationsForEmployee(employeeId, { page, limit, offset }) {
  const { rows, total } = await findConversationsPaginated(employeeId, { limit, offset });
  const participantRows = await findParticipantsForConversations(rows.map((row) => row.id));
  return {
    items: attachParticipants(rows, participantRows),
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function getConversationForRequester(conversationId, employeeId) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  const member = await isParticipant(conversationId, employeeId);
  if (!member) {
    throw new ApiError(403, 'You are not a participant in this conversation');
  }
  const participantRows = await findParticipantsForConversations([conversationId]);
  return attachParticipants([conversation], participantRows)[0];
}

export async function assertParticipant(conversationId, employeeId) {
  const member = await isParticipant(conversationId, employeeId);
  if (!member) {
    throw new ApiError(403, 'You are not a participant in this conversation');
  }
}
