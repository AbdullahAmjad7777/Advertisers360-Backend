import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';

export const getOfficeHours = asyncHandler(async (req, res) => {
  const hours = await settingsService.getOfficeHours();
  res.json({ success: true, message: 'Office hours fetched', data: hours });
});

export const updateOfficeHours = asyncHandler(async (req, res) => {
  const hours = await settingsService.setOfficeHours({
    officeStartTime: req.body.officeStartTime,
    officeEndTime: req.body.officeEndTime,
    updatedBy: req.user.id,
  });
  res.json({ success: true, message: 'Office hours updated', data: hours });
});

export const getLocationRestriction = asyncHandler(async (req, res) => {
  const setting = await settingsService.getLocationRestrictionSetting();
  res.json({ success: true, message: 'Location restriction setting fetched', data: setting });
});

export const updateLocationRestriction = asyncHandler(async (req, res) => {
  const setting = await settingsService.setLocationRestrictionEnabled({
    enabled: req.body.enabled,
    updatedBy: req.user.id,
  });
  res.json({ success: true, message: 'Location restriction setting updated', data: setting });
});

export const getLatePolicy = asyncHandler(async (req, res) => {
  const policy = await settingsService.getLatePolicy();
  res.json({ success: true, message: 'Late policy fetched', data: policy });
});

export const updateLatePolicy = asyncHandler(async (req, res) => {
  const policy = await settingsService.setLateGraceMinutes({
    minutes: Number(req.body.graceMinutes),
    updatedBy: req.user.id,
  });
  res.json({ success: true, message: 'Late policy updated', data: policy });
});
