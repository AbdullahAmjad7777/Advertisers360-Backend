import { asyncHandler } from '../utils/asyncHandler.js';
import * as lookupService from '../services/lookup.service.js';

export const roles = asyncHandler(async (req, res) => {
  const data = await lookupService.listRoles();
  res.json({ success: true, message: 'Roles fetched', data });
});

export const departments = asyncHandler(async (req, res) => {
  const data = await lookupService.listDepartments();
  res.json({ success: true, message: 'Departments fetched', data });
});

export const designations = asyncHandler(async (req, res) => {
  const data = await lookupService.listDesignations();
  res.json({ success: true, message: 'Designations fetched', data });
});
