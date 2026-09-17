import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { hasPermission } from '../permissions/permissions.js';
import { pktYear } from '../utils/timezone.js';
import * as leaveService from '../services/leave.service.js';

function buildRequester(req) {
  return {
    id: req.user.id,
    canManageLeaves: hasPermission(req.user.role, 'approveLeaves'),
  };
}

export const types = asyncHandler(async (req, res) => {
  const leaveTypes = await leaveService.listLeaveTypes();
  res.json({ success: true, message: 'Leave types fetched', data: leaveTypes });
});

export const apply = asyncHandler(async (req, res) => {
  const leave = await leaveService.applyForLeave(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Leave request submitted', data: leave });
});

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const requester = buildRequester(req);
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;

  const result = await leaveService.listLeaves(requester, {
    ...pagination,
    status: req.query.status,
    employeeId,
  });
  res.json({ success: true, message: 'Leave requests fetched', data: result });
});

export const getById = asyncHandler(async (req, res) => {
  const requester = buildRequester(req);
  const leave = await leaveService.getLeaveById(Number(req.params.id), requester);
  res.json({ success: true, message: 'Leave request fetched', data: leave });
});

export const approve = asyncHandler(async (req, res) => {
  const leave = await leaveService.approveLeave(Number(req.params.id), req.user.id);
  res.json({ success: true, message: 'Leave request approved', data: leave });
});

export const reject = asyncHandler(async (req, res) => {
  const leave = await leaveService.rejectLeave(Number(req.params.id), req.user.id);
  res.json({ success: true, message: 'Leave request rejected', data: leave });
});

export const cancel = asyncHandler(async (req, res) => {
  const requester = buildRequester(req);
  const leave = await leaveService.cancelLeave(Number(req.params.id), requester);
  res.json({ success: true, message: 'Leave request cancelled', data: leave });
});

export const balance = asyncHandler(async (req, res) => {
  const requester = buildRequester(req);
  const year = req.query.year ? Number(req.query.year) : pktYear();
  const balances = await leaveService.getBalances(Number(req.params.id), year, requester);
  res.json({ success: true, message: 'Leave balances fetched', data: balances });
});
