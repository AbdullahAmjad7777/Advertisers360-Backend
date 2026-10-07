import { asyncHandler } from '../utils/asyncHandler.js';
import * as breakService from '../services/break.service.js';

export const start = asyncHandler(async (req, res) => {
  const record = await breakService.startBreak(req.user.id);
  res.status(201).json({ success: true, message: 'Break started', data: record });
});

export const end = asyncHandler(async (req, res) => {
  const record = await breakService.endBreak(req.user.id);
  res.json({ success: true, message: 'Break ended', data: record });
});

export const current = asyncHandler(async (req, res) => {
  const record = await breakService.getActiveBreak(req.user.id);
  res.json({ success: true, message: 'Active break fetched', data: record });
});

export const history = asyncHandler(async (req, res) => {
  const result = await breakService.getBreakHistory(req.user, {
    employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, message: 'Break history fetched', data: result });
});
