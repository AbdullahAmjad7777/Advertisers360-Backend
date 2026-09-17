import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// New uploads go to UploadThing (see utils/uploadthing.js); BACKEND_ROOT is
// kept only to resolve file_path/attachment_path values for files that were
// captured before that migration and still live on local disk.
export const BACKEND_ROOT = path.join(__dirname, '..', '..');
