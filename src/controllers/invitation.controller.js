import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import * as invitationService from '../services/invitation.service.js';

export const invite = asyncHandler(async (req, res) => {
  const invitation = await invitationService.createInvitation(req.body.email, req.user.id);
  res.status(201).json({ success: true, message: 'Invitation sent', data: invitation });
});

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const status = ['pending', 'completed', 'revoked'].includes(req.query.status)
    ? req.query.status
    : undefined;
  const result = await invitationService.listPendingInvitations({ ...pagination, status });
  res.json({ success: true, message: 'Invitations fetched', data: result });
});

export const resend = asyncHandler(async (req, res) => {
  const invitation = await invitationService.resendInvitation(Number(req.params.id));
  res.json({ success: true, message: 'Invitation resent', data: invitation });
});

export const revoke = asyncHandler(async (req, res) => {
  await invitationService.revokeInvitation(Number(req.params.id));
  res.json({ success: true, message: 'Invitation revoked', data: null });
});
