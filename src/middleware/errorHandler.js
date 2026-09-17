import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
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

  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong on our end' });
}
