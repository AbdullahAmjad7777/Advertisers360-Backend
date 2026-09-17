import { findAllRoles, findAllDepartments, findAllDesignations } from '../models/lookup.model.js';

export async function listRoles() {
  return findAllRoles();
}

export async function listDepartments() {
  return findAllDepartments();
}

export async function listDesignations() {
  return findAllDesignations();
}
