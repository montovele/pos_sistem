import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../services/authService.js';

test('verifies scrypt password hashes and preserves legacy plain passwords', () => {
  const hash = hashPassword('strong-password');
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword('strong-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
  assert.equal(verifyPassword('legacy-password', 'legacy-password'), true);
  assert.equal(verifyPassword('wrong-password', 'legacy-password'), false);
  assert.equal(verifyPassword('password', 'scrypt$broken'), false);
});
