import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnforceSubscription } from '../middleware/auth.js';

test('superadmin can access POS APIs without an organization subscription', () => {
  assert.equal(shouldEnforceSubscription({ role: 'superadmin' }, '/api/employees'), false);
  assert.equal(shouldEnforceSubscription({ role: 'superadmin' }, '/api/backups'), false);
});

test('subscription is not required for authentication and subscription routes', () => {
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/auth/current-user'), false);
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/suscripciones'), false);
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/suscripciones/checkout'), false);
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/suscripciones/instaladores'), false);
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/suscripciones/instaladores/agent.exe/descargar'), false);
});

test('subscription remains required for other organization users and administrators', () => {
  assert.equal(shouldEnforceSubscription({ role: 'admin' }, '/api/employees'), true);
  assert.equal(shouldEnforceSubscription({ role: 'cashier' }, '/api/backups'), true);
  assert.equal(shouldEnforceSubscription({ role: 'manager' }, '/api/products'), true);
});
