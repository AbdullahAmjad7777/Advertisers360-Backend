-- 013_add_message_attachment_mime_type
-- Attachments are stored on UploadThing and attachment_path is just the
-- resulting URL, which does not preserve the original filename/extension
-- (the file key UploadThing issues is an opaque id). That made it
-- impossible for the frontend to reliably tell a voice message (audio)
-- apart from any other attachment by looking at attachment_path alone,
-- so voice notes fell back to the generic file-attachment UI instead of
-- a dedicated audio player. Store the mime type we already receive from
-- multer at upload time so both the API response and the attachment
-- proxy route can use it directly.

ALTER TABLE messages
  ADD COLUMN attachment_mime_type VARCHAR(100) NULL AFTER attachment_path;
