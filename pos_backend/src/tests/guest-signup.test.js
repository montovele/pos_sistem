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

test('sends a generic payment recovery email and stores only the token hash', async () => {
  let storedTokenHash = '';
  let recoveryEmail;
  const service = createGuestSignupService({
    pool: {
      execute: async (sql, values) => {
        if (sql.includes('FROM pos_pending_signups')) {
          return [[{ id: 'signup-id', recovery_allowed: 1 }], []];
        }
        if (sql.includes('SET recovery_token_hash')) {
          storedTokenHash = values[0];
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
      getConnection: async () => { throw new Error('No transaction expected'); }
    },
    emailService: {
      sendPaymentRecovery: async (message) => { recoveryEmail = message; }
    },
    frontendUrl: 'https://pos.example.com'
  });

  assert.deepEqual(await service.requestPaymentRecovery('ANA@example.com'), { accepted: true });
  const token = new URL(recoveryEmail.recoveryUrl).searchParams.get('token');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(recoveryEmail.to, 'ana@example.com');
  assert.equal(storedTokenHash, createHash('sha256').update(token).digest('hex'));
  assert.notEqual(storedTokenHash, token);
});

test('returns a safe live status and amount for a recovery token', async () => {
  const token = 'r'.repeat(43);
  const signup = {
    id: 'signup-id',
    email: 'ana@example.com',
    nombre_org: 'Tienda',
    stripe_customer_id: 'cus_test',
    stripe_checkout_session_id: 'cs_test_12345678',
    status: 'checkout_created',
    account_email_sent_at: null,
    recovery_valid: 1,
    setup_completed_at: null,
    plan_name: 'Plan mensual',
    plan_amount: '299.00',
    plan_currency: 'MXN',
    created_at: '2026-01-01 10:00:00',
    updated_at: '2026-01-01 10:00:00'
  };
  const service = createGuestSignupService({
    pool: {
      execute: async (_sql, values) => {
        assert.equal(values[0], createHash('sha256').update(token).digest('hex'));
        return [[signup], []];
      },
      getConnection: async () => { throw new Error('No transaction expected'); }
    },
    stripe: {
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: 'cs_test_12345678',
            mode: 'subscription',
            status: 'open',
            payment_status: 'unpaid',
            amount_total: 29900,
            currency: 'mxn',
            created: 1760000000,
            customer: 'cus_test',
            client_reference_id: 'signup-id',
            metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' },
            url: 'https://checkout.stripe.com/session'
          })
        }
      }
    }
  });

  const result = await service.getPaymentRecovery(token);
  assert.equal(result.status, 'requires_action');
  assert.equal(result.nextAction, 'continue_payment');
  assert.equal(result.payment.amount, 299);
  assert.equal(result.payment.currency, 'MXN');
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/session');
  assert.equal(result.signupEmail, 'ana@example.com');
});

test('retries payment only after Stripe reports an expired unpaid session', async () => {
  const token = 't'.repeat(43);
  const checkoutCalls = [];
  const signup = {
    id: 'signup-id',
    email: 'ana@example.com',
    nombre_org: 'Tienda',
    nombre: 'Ana',
    apellido: 'Lopez',
    telefono: null,
    stripe_customer_id: 'cus_test',
    stripe_checkout_session_id: 'cs_test_12345678',
    status: 'checkout_created',
    account_email_sent_at: null,
    recovery_valid: 1,
    setup_completed_at: null,
    plan_name: 'Plan mensual',
    plan_amount: '299.00',
    plan_currency: 'MXN'
  };
  const pendingSignup = {
    id: 'signup-id',
    idempotency_key: 'old-key',
    stripe_customer_id: 'cus_test',
    stripe_checkout_session_id: 'cs_test_12345678',
    status: 'checkout_created'
  };
  const pool = {
    execute: async (sql) => {
      if (sql.includes('WHERE signup.recovery_token_hash')) return [[signup], []];
      if (sql.includes('SELECT id FROM usuarios')) return [[], []];
      if (sql.includes('FROM pos_subscription_plans')) {
        return [[{
          code: 'monthly',
          name: 'Plan mensual',
          amount: 299,
          currency: 'MXN',
          interval_unit: 'month',
          interval_count: 1,
          is_active: 1,
          stripe_price_id: 'price_monthly'
        }], []];
      }
      if (sql.includes('SELECT nombre_org, nombre, apellido, email, telefono')) {
        return [[{
          nombre_org: 'Tienda',
          nombre: 'Ana',
          apellido: 'Lopez',
          email: 'ana@example.com',
          telefono: null
        }], []];
      }
      if (sql.includes('SELECT id, idempotency_key')) return [[pendingSignup], []];
      return [{ affectedRows: 1 }, []];
    },
    getConnection: async () => { throw new Error('No transaction expected'); }
  };
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async () => ({
          id: 'cs_test_12345678',
          mode: 'subscription',
          status: 'expired',
          payment_status: 'unpaid',
          customer: 'cus_test',
          client_reference_id: 'signup-id',
          metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' }
        }),
        create: async (params, options) => {
          checkoutCalls.push({ params, options });
          return { id: 'cs_test_87654321', url: 'https://checkout.stripe.com/new' };
        }
      }
    }
  };
  const service = createGuestSignupService({ pool, stripe });

  const result = await service.retryPaymentRecovery(token);
  assert.deepEqual(result, { checkout_url: 'https://checkout.stripe.com/new' });
  assert.equal(checkoutCalls.length, 1);
  assert.equal(checkoutCalls[0].params.client_reference_id, 'signup-id');
  assert.equal(checkoutCalls[0].params.metadata.price_id, 'price_monthly');
  assert.equal(checkoutCalls[0].params.subscription_data.metadata.price_id, 'price_monthly');
  assert.match(checkoutCalls[0].options.idempotencyKey, /^pos-guest-checkout-/);
});

test('does not create another checkout while Stripe payment is still pending', async () => {
  const token = 'p'.repeat(43);
  const service = createGuestSignupService({
    pool: {
      execute: async () => [[{
        id: 'signup-id',
        email: 'ana@example.com',
        nombre_org: 'Tienda',
        stripe_customer_id: 'cus_test',
        stripe_checkout_session_id: 'cs_test_12345678',
        status: 'checkout_created',
        recovery_valid: 1,
        plan_name: 'Plan mensual',
        plan_amount: 299,
        plan_currency: 'MXN'
      }], []],
      getConnection: async () => { throw new Error('No transaction expected'); }
    },
    stripe: {
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: 'cs_test_12345678',
            mode: 'subscription',
            status: 'open',
            payment_status: 'unpaid',
            customer: 'cus_test',
            client_reference_id: 'signup-id',
            metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' },
            url: 'https://checkout.stripe.com/session'
          }),
          create: async () => { throw new Error('A duplicate checkout must not be created'); }
        }
      }
    }
  });

  await assert.rejects(
    service.retryPaymentRecovery(token),
    (error) => error.code === 'PAYMENT_RETRY_NOT_ALLOWED' && error.status === 409
  );
});
