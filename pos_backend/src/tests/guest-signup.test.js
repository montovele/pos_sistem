import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGuestSignupService } from '../services/guestSignupService.js';

test('does not provision an organization before Stripe confirms payment', async () => {
  let connectionRequested = false;
  const service = createGuestSignupService({
    pool: {
      execute: async () => { throw new Error('Unexpected database query'); },
      getConnection: async () => {
        connectionRequested = true;
        throw new Error('Unexpected database connection');
      }
    }
  });

  await assert.rejects(
    service.provisionPaidCheckout({
      id: 'cs_test_12345678',
      mode: 'subscription',
      payment_status: 'unpaid',
      subscription: 'sub_test',
      metadata: { pending_signup_id: 'signup-id' }
    }),
    (error) => error.code === 'PAYMENT_NOT_CONFIRMED'
  );
  assert.equal(connectionRequested, false);
});

test('issues a fresh activation email only for the matching checkout email', async () => {
  const statements = [];
  const signup = {
    id: 'signup-id',
    nombre_org: 'Tienda',
    nombre: 'Ana',
    apellido: 'Lopez',
    email: 'ana@example.com',
    telefono: null,
    stripe_customer_id: 'cus_test',
    stripe_checkout_session_id: 'cs_test_12345678',
    status: 'provisioned',
    organization_id: 3,
    user_id: 9,
    account_email_sent_at: '2026-01-01 00:00:00',
    email_resend_allowed: 1
  };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('FROM pos_pending_signups')) return [[signup], []];
      if (sql.includes('SELECT username FROM usuarios')) return [[{ username: 'admin-test' }], []];
      return [{ affectedRows: 1, insertId: 14 }, []];
    }
  };
  const service = createGuestSignupService({
    pool: {
      execute: async () => [{ affectedRows: 1 }, []],
      getConnection: async () => connection
    },
    passwordHasher: (password) => `hashed:${password}`
  });
  const session = {
    id: 'cs_test_12345678',
    mode: 'subscription',
    payment_status: 'paid',
    customer: 'cus_test',
    subscription: 'sub_test',
    metadata: { pending_signup_id: 'signup-id' }
  };

  const delivery = await service.provisionPaidCheckout(session, {
    resendEmail: true,
    email: 'ANA@example.com'
  });
  assert.equal(delivery.email, 'ana@example.com');
  assert.equal(delivery.username, 'admin-test');
  assert.ok(delivery.token);
  assert.ok(statements.some(({ sql }) => sql.includes('account_email_last_attempt_at = UTC_TIMESTAMP()')));

  await assert.rejects(
    service.provisionPaidCheckout(session, { resendEmail: true, email: 'wrong@example.com' }),
    (error) => error.code === 'SIGNUP_NOT_FOUND'
  );
});

test('throttles repeated activation email requests', async () => {
  let tokenInserted = false;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      if (sql.includes('FROM pos_pending_signups')) {
        return [[{
          id: 'signup-id',
          email: 'ana@example.com',
          stripe_customer_id: 'cus_test',
          stripe_checkout_session_id: 'cs_test_12345678',
          status: 'provisioned',
          account_email_sent_at: '2026-01-01 00:00:00',
          email_resend_allowed: 0
        }], []];
      }
      if (sql.includes('INSERT INTO pos_account_setup_tokens')) tokenInserted = true;
      return [{ affectedRows: 1 }, []];
    }
  };
  const service = createGuestSignupService({
    pool: { execute: async () => [[], []], getConnection: async () => connection }
  });

  await assert.rejects(
    service.provisionPaidCheckout({
      id: 'cs_test_12345678',
      mode: 'subscription',
      payment_status: 'paid',
      customer: 'cus_test',
      subscription: 'sub_test',
      metadata: { pending_signup_id: 'signup-id' }
    }, { resendEmail: true, email: 'ana@example.com' }),
    (error) => error.code === 'EMAIL_RESEND_TOO_SOON' && error.status === 429
  );
  assert.equal(tokenInserted, false);
});

test('activates an account with a valid token once', async () => {
  const token = 'a'.repeat(43);
  const setupToken = { id: 7, user_id: 12, consumed_at: null, is_valid: 1 };
  const executed = [];
  let rollbacks = 0;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => { rollbacks += 1; },
    release: () => {},
    execute: async (sql, values) => {
      executed.push({ sql, values });
      if (sql.includes('FROM pos_account_setup_tokens')) return [[setupToken], []];
      if (sql.includes('UPDATE pos_account_setup_tokens')) setupToken.consumed_at = '2026-01-01 00:00:00';
      return [{ affectedRows: 1 }, []];
    }
  };
  const service = createGuestSignupService({
    pool: {
      execute: async () => [[], []],
      getConnection: async () => connection
    },
    passwordHasher: (password) => `hashed:${password}`
  });

  assert.deepEqual(await service.activateAccount(token, 'Metroman_1'), { activated: true });
  assert.equal(executed[0].values[0], createHash('sha256').update(token).digest('hex'));
  assert.deepEqual(executed[1].values, ['hashed:Metroman_1', 12]);
  assert.match(executed[0].sql, /UTC_TIMESTAMP\(\)/);

  await assert.rejects(
    service.activateAccount(token, 'Metroman_1'),
    (error) => error.code === 'INVALID_SETUP_TOKEN'
  );
  assert.equal(rollbacks, 1);
});

test('rejects activation passwords shorter than 10 characters', async () => {
  const service = createGuestSignupService({
    pool: {
      execute: async () => [[], []],
      getConnection: async () => { throw new Error('Password validation should run first'); }
    }
  });

  await assert.rejects(
    service.activateAccount('a'.repeat(43), 'Metro_123'),
    (error) => error.code === 'INVALID_PASSWORD' && error.status === 422
  );
});
