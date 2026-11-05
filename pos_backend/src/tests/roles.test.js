import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignRole } from '../utils/rolePermissions.js';
import {
  isAdminRole,
  requireAdmin,
  requireSuperAdmin,
  requireAssignableRole
} from '../middleware/roles.js';

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('superadmin and admin have administrative access but other roles do not', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('superadmin'), true);
  assert.equal(isAdminRole('manager'), false);
  assert.equal(isAdminRole('cashier'), false);
});

test('admin role middleware allows superadmin and rejects cashier', () => {
  let continued = false;
  requireAdmin({ user: { role: 'superadmin' } }, response(), () => { continued = true; });
  assert.equal(continued, true);

  const res = response();
  requireAdmin({ user: { role: 'cashier' } }, res, () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 403);
});

test('superadmin can assign administrator and lower roles; admin can assign lower roles only', () => {
  assert.equal(canAssignRole('superadmin', 'admin'), true);
  assert.equal(canAssignRole('superadmin', 'cashier'), true);
  assert.equal(canAssignRole('admin', 'admin'), false);
  assert.equal(canAssignRole('admin', 'manager'), true);
  assert.equal(canAssignRole('admin', 'cashier'), true);
  assert.equal(canAssignRole('admin', 'vendedor'), true);
  assert.equal(canAssignRole('admin', 'superadmin'), false);
  assert.equal(canAssignRole('cashier', 'cashier'), false);
  assert.equal(canAssignRole('admin', 'unknown'), false);
});

test('role assignment middleware blocks admin promotion and allows admin to assign lower roles', () => {
  const adminResponse = response();
  requireAssignableRole({ user: { role: 'admin' }, body: { role: 'admin' } }, adminResponse, () => {
    throw new Error('must not continue');
  });
  assert.equal(adminResponse.statusCode, 403);

  let continued = false;
  requireAssignableRole({ user: { role: 'admin' }, body: { role: 'manager' } }, response(), () => {
    continued = true;
  });
  assert.equal(continued, true);

  continued = false;
  requireAssignableRole({ user: { role: 'superadmin' }, body: { role: 'admin' } }, response(), () => {
    continued = true;
  });
  assert.equal(continued, true);

  continued = false;
  requireSuperAdmin({ user: { role: 'superadmin' } }, response(), () => { continued = true; });
  assert.equal(continued, true);
});
