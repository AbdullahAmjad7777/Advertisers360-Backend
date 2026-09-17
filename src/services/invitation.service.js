import bcrypt from 'bcrypt';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { generateSecureToken, hashToken } from '../utils/token.js';
import { pktDateString } from '../utils/timezone.js';
import { sendMail } from '../utils/mailer.js';
import { onboardingInviteEmail } from '../utils/emailTemplates.js';
import { pool } from '../config/db.js';
import { findAllDepartments, findAllDesignations, findRoleIdByName } from '../models/lookup.model.js';
import { findByEmailWithRole, hasAgentSignedIn } from '../models/employee.model.js';
import { syncBasicSalaryFromEmployee } from '../models/payroll.model.js';
import {
  generateNextEmployeeCode,
  insertEmployee,
  insertBankDetails,
  findEmployeeDetailById,
} from '../models/employee.model.js';
import {
  insertInvitation,
  findPendingInvitationByEmail,
  findInvitationByTokenHash,
  findInvitationById,
  updateInvitationToken,
  markInvitationCompleted,
  markInvitationRevoked,
  listInvitations,
  findManagersForOnboarding,
} from '../models/invitation.model.js';

const EXPIRY_DAYS = 3;
const SALT_ROUNDS = 10;

function frontendBaseUrl() {
  const configured = process.env.FRONTEND_URL || (process.env.CLIENT_ORIGIN ?? '').split(',')[0];
  return (configured || 'http://localhost:5173').trim().replace(/\/$/, '');
}

function expiryDate() {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

async function sendInvitationEmail(email, rawToken) {
  const link = `${frontendBaseUrl()}/onboarding/${rawToken}`;
  const { subject, text, html } = onboardingInviteEmail(link, EXPIRY_DAYS);
  await sendMail({ to: email, subject, text, html });
}

export async function createInvitation(email, invitedBy) {
  const existingEmployee = await findByEmailWithRole(email);
  if (existingEmployee) {
    throw new ApiError(409, 'An employee with this email already exists');
  }

  const existingInvitation = await findPendingInvitationByEmail(email);
  if (existingInvitation) {
    throw new ApiError(409, 'A pending invitation already exists for this email. Resend it instead.');
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const id = await insertInvitation({ email, tokenHash, invitedBy, expiresAt: expiryDate() });
  await sendInvitationEmail(email, rawToken);
  return findInvitationById(id);
}

export async function resendInvitation(id) {
  const invitation = await findInvitationById(id);
  if (!invitation) {
    throw new ApiError(404, 'Invitation not found');
  }
  if (invitation.status !== 'pending') {
    throw new ApiError(409, 'Only pending invitations can be resent');
  }

  const { rawToken, tokenHash } = generateSecureToken();
  await updateInvitationToken(id, { tokenHash, expiresAt: expiryDate() });
  await sendInvitationEmail(invitation.email, rawToken);
  return findInvitationById(id);
}

export async function revokeInvitation(id) {
  const revoked = await markInvitationRevoked(id);
  if (!revoked) {
    throw new ApiError(409, 'Only pending invitations can be revoked');
  }
}

export async function listPendingInvitations({ page, limit, offset, status }) {
  const { rows, total } = await listInvitations({ limit, offset, status });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function loadValidInvitation(rawToken) {
  const tokenHash = hashToken(rawToken);
  const invitation = await findInvitationByTokenHash(tokenHash);
  if (!invitation) {
    throw new ApiError(404, 'This invitation link is invalid');
  }
  if (invitation.status !== 'pending') {
    throw new ApiError(410, 'This invitation has already been used or was revoked');
  }
  if (new Date(invitation.expires_at) <= new Date()) {
    throw new ApiError(410, 'This invitation link has expired. Ask your CEO/manager to resend it.');
  }
  return invitation;
}

// Step 2 of onboarding (desktop-agent setup) reuses the same one-time
// token as step 1, but looks for the *completed* invitation it left behind
// instead of a pending one — the token's job at this point is just to
// identify "which employee just finished onboarding", not to gate a second
// profile submission. Expiry is deliberately not enforced here: the token
// already did its one real job (creating the account) by the time this is
// called, and someone slowly working through installing/signing into the
// agent shouldn't get locked out of checking their own status.
export async function getAgentSignInStatus(rawToken) {
  const tokenHash = hashToken(rawToken);
  const invitation = await findInvitationByTokenHash(tokenHash);
  if (!invitation || invitation.status !== 'completed' || !invitation.employee_id) {
    throw new ApiError(404, 'No completed onboarding found for this link');
  }

  const signedIn = await hasAgentSignedIn(invitation.employee_id);
  return { signedIn };
}

export async function getInvitationForOnboarding(rawToken) {
  const invitation = await loadValidInvitation(rawToken);
  const [departments, designations, managers] = await Promise.all([
    findAllDepartments(),
    findAllDesignations(),
    findManagersForOnboarding(),
  ]);
  return { email: invitation.email, departments, designations, managers };
}

export async function completeOnboarding(rawToken, profile) {
  const invitation = await loadValidInvitation(rawToken);

  const alreadyRegistered = await findByEmailWithRole(invitation.email);
  if (alreadyRegistered) {
    throw new ApiError(409, 'An employee with this email already exists');
  }

  const roleId = await findRoleIdByName('employee');
  if (!roleId) {
    throw new ApiError(500, "The 'employee' role is not configured");
  }

  const passwordHash = await bcrypt.hash(profile.password, SALT_ROUNDS);
  const connection = await pool.getConnection();

  let insertId;
  try {
    await connection.beginTransaction();
    const employeeCode = await generateNextEmployeeCode(connection);
    insertId = await insertEmployee(connection, {
      employeeCode,
      fullName: profile.fullName,
      email: invitation.email,
      passwordHash,
      phone: profile.phone,
      cnicNumber: profile.cnicNumber,
      address: profile.address,
      profilePictureUrl: profile.profilePictureUrl,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      emergencyContactRelation: profile.emergencyContactRelation,
      gender: profile.gender,
      dateOfBirth: profile.dateOfBirth,
      departmentId: profile.departmentId,
      designationId: profile.designationId,
      roleId,
      managerId: profile.managerId,
      joinDate: pktDateString(),
      baseSalary: profile.baseSalary ?? 0,
    });

    if (profile.bankName && profile.accountTitle && profile.accountNumber) {
      await insertBankDetails(connection, insertId, {
        bankName: profile.bankName,
        accountTitle: profile.accountTitle,
        accountNumber: profile.accountNumber,
        iban: profile.iban,
      });
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  await syncBasicSalaryFromEmployee(insertId, profile.baseSalary ?? 0, pktDateString());
  await markInvitationCompleted(invitation.id, insertId);

  return findEmployeeDetailById(insertId);
}
