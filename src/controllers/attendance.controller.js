import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { hasPermission } from '../permissions/permissions.js';
import * as attendanceService from '../services/attendance.service.js';
import { pktDateString } from '../utils/timezone.js';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

export const checkIn = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.checkIn(req.user.id, getClientIp(req));
  res.status(201).json({ success: true, message: 'Checked in successfully', data: attendance });
});

export const checkOut = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.checkOut(req.user.id);
  res.json({ success: true, message: 'Checked out successfully', data: attendance });
});

export const today = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const result = await attendanceService.getToday(pagination);
  res.json({ success: true, message: "Today's attendance fetched", data: result });
});

export const currentStatus = asyncHandler(async (req, res) => {
  const record = await attendanceService.getCurrentStatus(req.user.id);
  res.json({ success: true, message: 'Current shift status fetched', data: record });
});

export const correct = asyncHandler(async (req, res) => {
  const record = await attendanceService.correctAttendance(Number(req.params.id), req.user.id, {
    checkInTime: req.body.checkInTime,
    checkOutTime: req.body.checkOutTime,
    status: req.body.status,
    reason: req.body.reason,
  });
  res.json({ success: true, message: 'Attendance record updated', data: record });
});

export const editLog = asyncHandler(async (req, res) => {
  const log = await attendanceService.getAttendanceEditLog(Number(req.params.id));
  res.json({ success: true, message: 'Attendance edit history fetched', data: log });
});

export const trend = asyncHandler(async (req, res) => {
  const requester = {
    id: req.user.id,
    canViewAllAttendance: hasPermission(req.user.role, 'viewAllAttendance'),
  };
  const result = await attendanceService.getTrend(requester, {
    days: req.query.days,
    employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
  });
  res.json({ success: true, message: 'Attendance trend fetched', data: result });
});

export const historyByEmployee = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const requester = {
    id: req.user.id,
    canViewAllAttendance: hasPermission(req.user.role, 'viewAllAttendance'),
  };
  const result = await attendanceService.getEmployeeHistory(Number(req.params.id), requester, {
    ...pagination,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, message: 'Attendance history fetched', data: result });
});

export const checkInBlock = asyncHandler(async (req, res) => {
  const result = await attendanceService.getCheckInBlock(req.user.id);
  res.json({ success: true, message: 'Check-in eligibility fetched', data: result });
});

export const missedCheckouts = asyncHandler(async (req, res) => {
  const rows = await attendanceService.listMissedCheckouts(req.user);
  res.json({ success: true, message: 'Missed check-outs fetched', data: rows });
});

export const closeMissedCheckout = asyncHandler(async (req, res) => {
  const record = await attendanceService.closeMissedCheckout(req.user, Number(req.params.id), {
    checkOutTime: req.body.checkOutTime,
    reason: req.body.reason,
  });
  res.json({ success: true, message: 'Missed check-out closed; the employee can check in again', data: record });
});

function currentPktYearMonth() {
  const [year, month] = pktDateString().split('-').map(Number);
  return { year, month };
}

export const calendar = asyncHandler(async (req, res) => {
  const result = await attendanceService.getYearCalendar(req.user, {
    employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    year: req.query.year ? Number(req.query.year) : currentPktYearMonth().year,
  });
  res.json({ success: true, message: 'Attendance calendar fetched', data: result });
});

export const stats = asyncHandler(async (req, res) => {
  const now = currentPktYearMonth();
  const result = await attendanceService.getAttendanceStats(req.user, {
    year: req.query.year ? Number(req.query.year) : now.year,
    month: req.query.month ? Number(req.query.month) : now.month,
  });
  res.json({ success: true, message: 'Attendance stats fetched', data: result });
});

export const lateSummary = asyncHandler(async (req, res) => {
  const now = currentPktYearMonth();
  const result = await attendanceService.getLateSummary(req.user, {
    month: req.query.month ? Number(req.query.month) : now.month,
    year: req.query.year ? Number(req.query.year) : now.year,
  });
  res.json({ success: true, message: 'Late summary fetched', data: result });
});
