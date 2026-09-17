import { asyncHandler } from '../utils/asyncHandler.js';
import * as agentService from '../services/agent.service.js';

export const refreshAll = asyncHandler(async (req, res) => {
  const result = await agentService.requestResyncAll(req.user.id);
  res.status(201).json({ success: true, message: 'Resync signal sent', data: result });
});

export const pushUpdate = asyncHandler(async (req, res) => {
  const result = await agentService.requestUpdateCheckAll(req.user.id);
  res.status(201).json({ success: true, message: 'Update-check signal sent', data: result });
});

export const resyncStatus = asyncHandler(async (req, res) => {
  const result = await agentService.getResyncStatus(req.user.id);
  res.json({ success: true, message: 'Resync status fetched', data: result });
});

export const ack = asyncHandler(async (req, res) => {
  await agentService.ackResync(Number(req.body.requestId), req.user.id, req.body.updateOutcome);
  res.json({ success: true, message: 'Resync acknowledged' });
});

export const progress = asyncHandler(async (req, res) => {
  const result = await agentService.getResyncRequestProgress(Number(req.params.requestId));
  res.json({ success: true, message: 'Resync progress fetched', data: result });
});

// "Fix All Agents Now" — combines refresh-all + push-update into one click.
export const fixAll = asyncHandler(async (req, res) => {
  const result = await agentService.requestFixAll(req.user.id);
  res.status(201).json({ success: true, message: 'Fix-all signal sent', data: result });
});

export const fixAllProgress = asyncHandler(async (req, res) => {
  const result = await agentService.getFixAllProgress(
    Number(req.query.resyncRequestId),
    Number(req.query.updateRequestId),
  );
  res.json({ success: true, message: 'Fix-all progress fetched', data: result });
});

export const pendingUninstalls = asyncHandler(async (req, res) => {
  const result = await agentService.getPendingUninstalls();
  res.json({ success: true, message: 'Pending agent uninstalls fetched', data: result });
});

export const resolveUninstall = asyncHandler(async (req, res) => {
  await agentService.resolveUninstallManually(Number(req.params.employeeId), req.user.id);
  res.json({ success: true, message: 'Marked as resolved' });
});
