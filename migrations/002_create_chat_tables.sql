-- 002_create_chat_tables
-- Internal chat: conversations, participants, messages, read receipts.

CREATE TABLE conversations (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    is_group      TINYINT(1) NOT NULL DEFAULT 0,
    name          VARCHAR(150) NULL,
    created_by    BIGINT UNSIGNED NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE conversation_participants (
    conversation_id  BIGINT UNSIGNED NOT NULL,
    employee_id      BIGINT UNSIGNED NOT NULL,
    joined_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, employee_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_participants_employee ON conversation_participants(employee_id);

CREATE TABLE messages (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id   BIGINT UNSIGNED NOT NULL,
    sender_id         BIGINT UNSIGNED NOT NULL,
    content           TEXT NULL,
    attachment_path   VARCHAR(500) NULL,
    sent_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted        TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);

CREATE TABLE message_read_receipts (
    message_id   BIGINT UNSIGNED NOT NULL,
    employee_id  BIGINT UNSIGNED NOT NULL,
    read_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, employee_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;
