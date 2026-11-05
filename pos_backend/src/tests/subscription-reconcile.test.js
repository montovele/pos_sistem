import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosSubscriptionService } from '../../../suscripciones/posSubscription.service.js';

function createPool() {
  const statements = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      statements.push({ sql, values });
      return [{ affectedRows: 1 }, []];
    }
  };
  return {
    statements,
    execute: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT organization_id FROM pos_subscription_customers')) {
        return [[{ organization_id: 23 }], []];
      }
      return [[], []];
    },
    getConnection: async () => connection
  };
}

function createCheckoutSession(paymentStatus = 'paid') {
  return {
    id: 'cs_test_12345678',
    mode: 'subscription',
    status: 'complete',
    payment_status: paymentStatus,
    customer: 'cus_test_123',
    subscription: 'sub_test_123',
    metadata: {
      pending_signup_id: 'signup-test-id',
      plan_code: 'monthly',
      price_id: 'price_test'
    }
  };
}

test('manually reconciles a paid guest checkout without the webhook', async () => {
  const pool = createPool();
  const session = createCheckoutSession();
  const activation = { signupId: 'signup-test-id' };
  let provisionedSession = null;
  let sentActivation = null;
  const service = createPosSubscriptionService({
    pool,
    stripe: {
      checkout: { sessions: { retrieve: async () => session } },
      subscriptions: {
        retrieve: async () => ({
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          metadata: { pending_signup_id: 'signup-test-id', plan_code: 'monthly', price_id: 'price_test' },
          items: { data: [{ price: { id: 'price_test' } }] },
          current_period_start: 1793750400,
          current_period_end: 1796342400,
          cancel_at_period_end: false
        })
      }
    },
    guestSignupService: {
      provisionPaidCheckout: async (verifiedSession) => {
        provisionedSession = verifiedSession;
        return activation;
      },
      sendActivationEmail: async (delivery) => { sentActivation = delivery; }
    }
  });

  const result = await service.reconcileGuestCheckout(session.id);
  assert.deepEqual(result, { payment_confirmed: true, status: 'account_ready', email_sent: true });
  assert.equal(provisionedSession, session);
  assert.equal(sentActivation, activation);
  assert.ok(pool.statements.some(({ sql }) => sql.includes('INSERT INTO pos_subscriptions')));
});

test('does not provision an unpaid guest checkout during reconciliation', async () => {
  const pool = createPool();
  let provisioned = false;
  const service = createPosSubscriptionService({
    pool,
    stripe: {
      checkout: { sessions: { retrieve: async () => createCheckoutSession('unpaid') } },
      subscriptions: { retrieve: async () => { throw new Error('Unpaid session must not retrieve subscription'); } }
    },
    guestSignupService: {
      provisionPaidCheckout: async () => { provisioned = true; },
      sendActivationEmail: async () => {}
    }
  });

  const result = await service.reconcileGuestCheckout('cs_test_12345678');
  assert.deepEqual(result, { payment_confirmed: false, status: 'processing' });
  assert.equal(provisioned, false);
  assert.equal(pool.statements.length, 0);
});

test('does not activate a paid checkout with a different Stripe price', async () => {
  const pool = createPool();
  const session = createCheckoutSession();
  let provisioned = false;
  const service = createPosSubscriptionService({
    pool,
    stripe: {
      checkout: { sessions: { retrieve: async () => session } },
      subscriptions: {
        retrieve: async () => ({
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          metadata: { pending_signup_id: 'signup-test-id', plan_code: 'monthly', price_id: 'price_test' },
          items: { data: [{ price: { id: 'price_unexpected' } }] }
        })
      }
    },
    guestSignupService: {
      provisionPaidCheckout: async () => { provisioned = true; },
      sendActivationEmail: async () => {}
    }
  });

  const result = await service.reconcileGuestCheckout(session.id);
  assert.deepEqual(result, { payment_confirmed: false, status: 'processing' });
  assert.equal(provisioned, false);
});

test('acknowledges guest subscription events that arrive before checkout provisioning', async () => {
  const statements = [];
  const pool = {
    statements,
    execute: async (sql, values) => {
      statements.push({ sql, values });
      return [[], []];
    },
    getConnection: async () => {
      throw new Error('Unassociated guest subscription must be deferred');
    }
  };
  const subscription = {
    id: 'sub_guest_123',
    customer: 'cus_guest_123',
    status: 'active',
    metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' },
    items: { data: [] }
  };
  const service = createPosSubscriptionService({
    pool,
    stripe: { subscriptions: { retrieve: async () => subscription } }
  });

  await service.processStripeEvent({
    id: 'evt_subscription_created',
    type: 'customer.subscription.created',
    data: { object: subscription }
  });
  await service.processStripeEvent({
    id: 'evt_invoice_paid',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_guest_123',
        status: 'paid',
        customer: 'cus_guest_123',
        subscription: 'sub_guest_123',
        amount_paid: 59900,
        currency: 'mxn'
      }
    }
  });

  assert.equal(statements.length, 3);
});

test('does not fail paid checkout webhook when activation email delivery fails', async () => {
  const pool = createPool();
  const subscription = {
    id: 'sub_guest_123',
    customer: 'cus_test_123',
    status: 'active',
    metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' },
    items: { data: [{ price: { id: 'price_test' } }] },
    current_period_start: 1793750400,
    current_period_end: 1796342400,
    cancel_at_period_end: false
  };
  const service = createPosSubscriptionService({
    pool,
    stripe: { subscriptions: { retrieve: async () => subscription } },
    guestSignupService: {
      provisionPaidCheckout: async () => ({ signupId: 'signup-id' }),
      sendActivationEmail: async () => { throw new Error('SMTP unavailable'); }
    }
  });

  await assert.doesNotReject(service.processStripeEvent({
    id: 'evt_checkout_completed',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_12345678',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_guest_123',
        metadata: { pending_signup_id: 'signup-id', plan_code: 'monthly' }
      }
    }
  }));
  assert.ok(pool.statements.some(({ sql }) => sql.includes('INSERT INTO pos_subscriptions')));
});
