import { asyncHandler } from '../utils/asyncHandler.js';
import * as taskService from '../services/task.service.js';

export const create = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.user.id, {
    title: req.body.title,
    description: req.body.description,
    assignedTo: Number(req.body.assignedTo),
    dueDate: req.body.dueDate,
  });
  res.status(201).json({ success: true, message: 'Task created', data: task });
});

export const list = asyncHandler(async (req, res) => {
  const tasks = await taskService.listTasks(req.user, {
    assignedTo: req.query.assignedTo ? Number(req.query.assignedTo) : undefined,
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, message: 'Tasks fetched', data: tasks });
});

export const update = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(Number(req.params.id), {
    title: req.body.title,
    description: req.body.description,
    assignedTo: req.body.assignedTo !== undefined ? Number(req.body.assignedTo) : undefined,
    dueDate: req.body.dueDate,
  });
  res.json({ success: true, message: 'Task updated', data: task });
});

export const complete = asyncHandler(async (req, res) => {
  const task = await taskService.setCompletion(req.user, Number(req.params.id), req.body.completed);
  res.json({ success: true, message: 'Task updated', data: task });
});

export const remove = asyncHandler(async (req, res) => {
  const task = await taskService.removeTask(Number(req.params.id));
  res.json({ success: true, message: 'Task deleted', data: task });
});
