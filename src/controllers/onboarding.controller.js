import { asyncHandler } from '../utils/asyncHandler.js';
import * as invitationService from '../services/invitation.service.js';

export const getByToken = asyncHandler(async (req, res) => {
  const data = await invitationService.getInvitationForOnboarding(req.params.token);
  res.json({ success: true, message: 'Invitation fetched', data });
});

export const getAgentStatus = asyncHandler(async (req, res) => {
  const data = await invitationService.getAgentSignInStatus(req.params.token);
  res.json({ success: true, message: 'Agent sign-in status fetched', data });
});

// Multipart form fields all arrive as strings (or are absent entirely for
// unfilled optional selects) — normalize the numeric/optional ones here so
// the service layer sees the same shape as the JSON employee-create flow.
function toOptionalInt(value) {
  return value ? Number(value) : undefined;
}

function toOptionalFloat(value) {
  return value ? Number(value) : undefined;
}

export const complete = asyncHandler(async (req, res) => {
  const employee = await invitationService.completeOnboarding(req.params.token, {
    fullName: req.body.fullName,
    password: req.body.password,
    phone: req.body.phone || undefined,
    cnicNumber: req.body.cnicNumber || undefined,
    address: req.body.address || undefined,
    emergencyContactName: req.body.emergencyContactName || undefined,
    emergencyContactPhone: req.body.emergencyContactPhone || undefined,
    emergencyContactRelation: req.body.emergencyContactRelation || undefined,
    gender: req.body.gender || undefined,
    dateOfBirth: req.body.dateOfBirth || undefined,
    departmentId: toOptionalInt(req.body.departmentId),
    designationId: toOptionalInt(req.body.designationId),
    managerId: toOptionalInt(req.body.managerId),
    bankName: req.body.bankName || undefined,
    accountTitle: req.body.accountTitle || undefined,
    accountNumber: req.body.accountNumber || undefined,
    iban: req.body.iban || undefined,
    baseSalary: toOptionalFloat(req.body.baseSalary),
    profilePictureUrl: null,
  });
  res.status(201).json({ success: true, message: 'Profile submitted successfully', data: employee });
});
