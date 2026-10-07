import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}

// Full detail goes to the server logs (Vercel -> Logs), never to the client.
// The request body is deliberately not logged: login bodies hold passwords.
function logServerError(err, req) {
  console.error(
    `[api-error] ${req.method} ${req.originalUrl} user=${req.user?.id ?? 'anonymous'}` +
      ` code=${err.code ?? '-'}${err.sqlMessage ? ` sql="${err.sqlMessage}"` : ''}\n${err.stack ?? err}`,
  );
}

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logServerError(err, req);
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message, code: err.code, details: err.details });
  }

  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum attachment size is 100MB.'
        : 'File upload failed';
    return res.status(422).json({ success: false, message });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'This record already exists' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return res
      .status(422)
      .json({ success: false, message: 'One of the referenced records (department, designation, role, or manager) does not exist' });
  }

  logServerError(err, req);
  res.status(500).json({ success: false, message: 'Something went wrong on our end' });
}
