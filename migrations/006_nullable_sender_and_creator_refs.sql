-- 006_nullable_sender_and_creator_refs
-- Deactivation is being changed to a full hard-delete of the employee row.
-- messages.sender_id and conversations.created_by were NOT NULL, which would
-- either block deleting an employee who ever sent a message / started a
-- conversation, or force deleting that shared content along with them —
-- losing history for other, still-active participants. Relax both to
-- nullable so the employee reference can be cleared while the message/
-- conversation itself (and everyone else's data in it) stays intact.

ALTER TABLE messages MODIFY COLUMN sender_id BIGINT UNSIGNED NULL;
ALTER TABLE conversations MODIFY COLUMN created_by BIGINT UNSIGNED NULL;
