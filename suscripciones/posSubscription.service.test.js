import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosSubscriptionService, isAccessAllowed, normalizeAmount, stripeStatus } from './posSubscription.service.js';

function createOrganizationSubscriptionPool(current, statements) {
  return {
    async execute(sql) {
      if (sql.includes('FROM organizaciones o')) {
        return [[{
          organization_id: 8,
          organization_name: 'Tienda Norte',
          subscription_id: current?.id || null,
          status: current?.status || 'inactive',
          current_period_start: current?.current_period_start || null,
          current_period_end: current?.current_period_end || null,
          cancel_at_period_end: 0,
          stripe_managed: Boolean(current?.stripe_subscription_id)
        }]];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql, params) {
          statements.push({ sql, params });
          if (sql.includes('FROM organizaciones')) return [[{ id: 8, nombre_org: 'Tienda Norte' }]];
          if (sql.includes('SELECT id, stripe_subscription_id')) return current ? [[current]] : [[]];
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
}

test('validates a monthly subscription price in pesos with cent precision', () => {
  assert.equal(normalizeAmount(599), 599);
  assert.equal(normalizeAmount(599.99), 599.99);
  assert.throws(() => normalizeAmount(0), { code: 'INVALID_SUBSCRIPTION_PRICE' });
  assert.throws(() => normalizeAmount(599.999), { code: 'INVALID_SUBSCRIPTION_PRICE' });
});

test('only active, unexpired subscriptions grant POS access', () => {
  assert.equal(isAccessAllowed({ status: 'active', current_period_end: null }), true);
  assert.equal(isAccessAllowed({ status: 'trialing', current_period_end: new Date(Date.now() + 60000) }), true);
  assert.equal(isAccessAllowed({
    status: 'active',
    current_period_start: new Date(Date.now() + 60000),
    current_period_end: new Date(Date.now() + 86400000)
  }), false);
  assert.equal(isAccessAllowed({
    status: 'active',
    current_period_start: new Date(Date.now() - 60000),
    current_period_end: new Date(Date.now() + 60000)
  }), true);
  assert.equal(isAccessAllowed({ status: 'active', current_period_end: new Date(Date.now() - 60000) }), false);
  assert.equal(isAccessAllowed({ status: 'past_due', current_period_end: null }), false);
  assert.equal(isAccessAllowed(null), false);
});

test('organization subscription list distinguishes manual subscriptions from Stripe subscriptions', async () => {
  const service = createPosSubscriptionService({
    pool: {
      async execute() {
        return [[
          {
            organization_id: 8,
            organization_name: 'Tienda Norte',
            subscription_id: 44,
            status: 'active',
            current_period_end: '2099-12-31T23:59:59Z',
            cancel_at_period_end: 0,
            stripe_managed: '0'
          },
          {
            organization_id: 9,
            organization_name: 'Tienda Sur',
            subscription_id: 45,
            status: 'active',
            current_period_end: '2099-12-31T23:59:59Z',
            cancel_at_period_end: 0,
            stripe_managed: '1'
          }
        ]];
      },
      async getConnection() {}
    }
  });

  const organizations = await service.listOrganizationSubscriptions();

  assert.equal(organizations[0].stripe_managed, false);
  assert.equal(organizations[1].stripe_managed, true);
});

test('maps unknown Stripe statuses to a non-entitled state', () => {
  assert.equal(stripeStatus('active'), 'active');
  assert.equal(stripeStatus('past_due'), 'past_due');
  assert.equal(stripeStatus('unknown'), 'suspended');
});

test('creates an idempotent Stripe Checkout session for the authenticated organization', async () => {
  const calls = [];
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM pos_subscription_plans')) {
        return [[{
          code: 'monthly',
          name: 'Suscripción mensual',
          description: 'Acceso mensual al POS',
          amount: '599.00',
          currency: 'MXN',
          interval_unit: 'month',
          interval_count: 1,
          is_active: 1,
          stripe_price_id: 'price_monthly'
        }]];
      }
      if (sql.includes('FROM pos_subscriptions')) return [[]];
      if (sql.includes('FROM pos_subscription_customers')) return [[]];
      if (sql.includes('FROM organizaciones')) return [[{ correo: 'billing@example.com' }]];
      calls.push(sql);
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      throw new Error('Checkout should not open a database transaction');
    }
  };
  const stripe = {
    customers: {
      create: async customer => {
        calls.push(customer);
        return { id: 'cus_123' };
      }
    },
    checkout: {
      sessions: {
        list: async () => ({ data: [] }),
        create: async (session, options) => {
          calls.push({ session, options });
          return { url: 'https://checkout.stripe.test/session' };
        }
      }
    },
    subscriptions: { list: async () => ({ data: [] }) }
  };
  const service = createPosSubscriptionService({ pool, stripe });

  const result = await service.createCheckout(
    21,
    { email: '', role: 'cashier', organizationName: 'Tienda Demo' },
    'hashed-idempotency-key',
    'https://pos.example.com/'
  );

  assert.equal(result.checkout_url, 'https://checkout.stripe.test/session');
  const checkoutCall = calls.find(call => call.session);
  assert.equal(checkoutCall.session.line_items[0].price, 'price_monthly');
  assert.equal(checkoutCall.session.metadata.organization_id, '21');
  assert.equal(checkoutCall.session.success_url, 'https://pos.example.com/suscripcion?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(checkoutCall.options.idempotencyKey, 'hashed-idempotency-key');
  assert.equal(calls.find(call => call.email)?.email, 'billing@example.com');
});

test('returns the historical contracted price with the organization subscription', async () => {
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM pos_subscription_plans')) {
        return [[{
          code: 'monthly',
          name: 'Suscripción mensual',
          description: 'Acceso mensual al sistema POS',
          amount: '699.00',
          currency: 'MXN',
          interval_unit: 'month',
          interval_count: 1,
          is_active: 1,
          stripe_price_id: 'price_current'
        }]];
      }
      if (sql.includes('FROM pos_subscriptions')) {
        return [[{
          status: 'active',
          contracted_amount: '599.00',
          contracted_currency: 'MXN',
          contracted_interval_unit: 'month',
          contracted_interval_count: 1,
          current_period_end: new Date(Date.now() + 86400000).toISOString(),
          cancel_at_period_end: 0,
          canceled_at: null
        }]];
      }
      return [[]];
    },
    async getConnection() {
      throw new Error('Status lookup should not open a database transaction');
    }
  };
  const service = createPosSubscriptionService({ pool });

  const result = await service.getStatus(21);

  assert.equal(result.plan.amount, 699);
  assert.equal(result.plan.has_stripe_price, true);
  assert.equal(result.plan.checkout_available, true);
  assert.equal(result.subscription.amount, 599);
  assert.equal(result.subscription.currency, 'MXN');
  assert.equal(result.subscription.interval_unit, 'month');
  assert.equal(result.access_allowed, true);
});

test('superadmin plan changes update the Stripe price and plan activation state', async () => {
  const statements = [];
  const currentPlan = {
    code: 'monthly',
    name: 'Suscripción mensual',
    description: 'Acceso mensual al POS',
    amount: '599.00',
    currency: 'MXN',
    interval_unit: 'month',
    interval_count: 1,
    is_active: 1,
    stripe_price_id: 'price_old',
    stripe_product_id: 'prod_monthly'
  };
  const pool = {
    async execute(sql) {
      statements.push(sql);
      if (sql.includes('FROM pos_subscription_plans')) return [[currentPlan]];
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql) {
          statements.push(sql);
          if (sql.includes('SELECT stripe_price_id')) return [[{ stripe_price_id: 'price_old' }]];
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const stripe = {
    products: { update: async () => ({ id: 'prod_monthly' }) },
    prices: { create: async () => ({ id: 'price_new' }) }
  };
  const service = createPosSubscriptionService({ pool, stripe });

  await service.updateMonthlyPlan({
    name: 'Plan POS Plus',
    description: 'Acceso integral al POS',
    amount: 699,
    is_active: false
  }, 137, '127.0.0.1');

  assert.ok(statements.some(sql => sql.includes("SET name = ?, description = ?")));
  assert.ok(statements.some(sql => sql.includes('is_active = ?')));
  assert.ok(statements.some(sql => sql.includes("SET status = 'archived'")));
});

test('superadmin can manually activate a canceled organization independently of plan publication', async () => {
  const connectionStatements = [];
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM organizaciones o')) {
        return [[{
          organization_id: 8,
          organization_name: 'Tienda Norte',
          subscription_id: 44,
          status: 'active',
          current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
          cancel_at_period_end: 0,
          stripe_managed: 0
        }]];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql, params) {
          connectionStatements.push({ sql, params });
          if (sql.includes('FROM organizaciones')) return [[{ id: 8, nombre_org: 'Tienda Norte' }]];
          if (sql.includes('SELECT id, stripe_subscription_id')) return [[{ id: 43, stripe_subscription_id: null, status: 'canceled' }]];
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const service = createPosSubscriptionService({ pool });

  const result = await service.setOrganizationSubscription(8, { action: 'activate' }, 137, '127.0.0.1');

  assert.equal(result.organization_id, 8);
  assert.ok(connectionStatements.some(({ sql }) => sql.includes("VALUES (?, ?, NULL, 'active', ?, ?, 0)")));
  assert.ok(connectionStatements.some(({ sql, params }) => sql.includes('INSERT INTO pos_subscription_audit')
    && params?.[2] === 'subscription.manually_activated'));
});

test('superadmin can activate a manual membership through a specified expiration date', async () => {
  const statements = [];
  const service = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool(null, statements)
  });

  await service.setOrganizationSubscription(
    8,
    { action: 'activate', current_period_end: '2099-12-31' },
    137,
    '127.0.0.1'
  );

  const activation = statements.find(({ sql }) => sql.includes("VALUES (?, ?, NULL, 'active', ?, ?, 0)"));
  assert.match(activation.params[2], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(activation.params[3], '2099-12-31 23:59:59');
  const audit = statements.find(({ sql, params }) => sql.includes('INSERT INTO pos_subscription_audit')
    && params?.[2] === 'subscription.manually_activated');
  assert.equal(JSON.parse(audit.params[3]).current_period_end, '2099-12-31T23:59:59.000Z');
});

test('superadmin can update the expiration date of an existing manual membership', async () => {
  const statements = [];
  const service = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool({
      id: 44,
      stripe_subscription_id: null,
      status: 'active',
      current_period_end: '2099-01-01 23:59:59'
    }, statements)
  });

  await service.setOrganizationSubscription(
    8,
    { action: 'set_expiration', current_period_end: '2099-06-30' },
    137,
    '127.0.0.1'
  );

  const update = statements.find(({ sql }) => sql.includes("SET status = 'active', current_period_end"));
  assert.equal(update.params[0], '2099-06-30 23:59:59');
  assert.equal(update.params[2], 44);
  const audit = statements.find(({ sql, params }) => sql.includes('INSERT INTO pos_subscription_audit')
    && params?.[2] === 'subscription.expiration_assigned');
  assert.equal(JSON.parse(audit.params[3]).previous_period_end, '2099-01-01 23:59:59');
});

test('superadmin can set both the contract start and expiration dates', async () => {
  const statements = [];
  const service = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool({
      id: 44,
      stripe_subscription_id: null,
      status: 'active',
      current_period_start: '2099-01-01 00:00:00',
      current_period_end: '2099-03-01 23:59:59'
    }, statements)
  });

  await service.setOrganizationSubscription(
    8,
    {
      action: 'set_period',
      current_period_start: '2099-05-01',
      current_period_end: '2099-06-30'
    },
    137,
    '127.0.0.1'
  );

  const update = statements.find(({ sql }) => sql.includes('current_period_start = ?'));
  assert.deepEqual(update.params, ['2099-06-30 23:59:59', '2099-05-01 00:00:00', 44]);
  const audit = statements.find(({ sql, params }) => sql.includes('INSERT INTO pos_subscription_audit')
    && params?.[2] === 'subscription.dates_assigned');
  assert.equal(JSON.parse(audit.params[3]).current_period_start, '2099-05-01T00:00:00.000Z');
});

test('manual membership expiration rejects invalid, past, missing, and Stripe-managed dates', async () => {
  const invalidDateService = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool(null, [])
  });
  await assert.rejects(
    invalidDateService.setOrganizationSubscription(8, {
      action: 'activate',
      current_period_end: '2099-02-30'
    }, 137, '127.0.0.1'),
    { status: 422, code: 'INVALID_CURRENT_PERIOD_END' }
  );
  await assert.rejects(
    invalidDateService.setOrganizationSubscription(8, {
      action: 'activate',
      current_period_start: '2099-05-01',
      current_period_end: '2099-04-30'
    }, 137, '127.0.0.1'),
    { status: 422, code: 'INVALID_SUBSCRIPTION_PERIOD' }
  );
  await assert.rejects(
    invalidDateService.setOrganizationSubscription(8, {
      action: 'activate',
      current_period_end: '2000-01-01'
    }, 137, '127.0.0.1'),
    { status: 422, code: 'INVALID_CURRENT_PERIOD_END' }
  );

  const manualService = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool({
      id: 44,
      stripe_subscription_id: null,
      status: 'active',
      current_period_end: '2099-01-01 23:59:59'
    }, [])
  });
  await assert.rejects(
    manualService.setOrganizationSubscription(8, { action: 'set_expiration' }, 137, '127.0.0.1'),
    { status: 422, code: 'INVALID_CURRENT_PERIOD_END' }
  );

  const stripeService = createPosSubscriptionService({
    pool: createOrganizationSubscriptionPool({
      id: 45,
      stripe_subscription_id: 'sub_live',
      status: 'active',
      current_period_end: '2099-01-01 23:59:59'
    }, [])
  });
  await assert.rejects(
    stripeService.setOrganizationSubscription(8, {
      action: 'set_period',
      current_period_start: '2099-05-01',
      current_period_end: '2099-06-30'
    }, 137, '127.0.0.1'),
    { status: 409, code: 'STRIPE_EXPIRATION_MANAGED' }
  );
});

test('superadmin can persistently deactivate an organization subscription', async () => {
  const statements = [];
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM organizaciones o')) {
        return [[{
          organization_id: 8,
          organization_name: 'Tienda Norte',
          subscription_id: 44,
          status: 'canceled',
          current_period_end: null,
          cancel_at_period_end: 0,
          stripe_managed: 0
        }]];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql) {
          statements.push(sql);
          if (sql.includes('FROM organizaciones')) return [[{ id: 8, nombre_org: 'Tienda Norte' }]];
          if (sql.includes('SELECT id, stripe_subscription_id')) {
            return [[{ id: 44, stripe_subscription_id: null, status: 'active' }]];
          }
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const service = createPosSubscriptionService({ pool });

  const result = await service.setOrganizationSubscription(8, { action: 'deactivate' }, 137, '127.0.0.1');

  assert.equal(result.status, 'canceled');
  assert.equal(result.access_allowed, false);
  assert.ok(statements.some(sql => sql.includes("SET status = 'canceled'")));
  assert.ok(statements.some(sql => sql.includes('subscription.manually_deactivated')));
});

test('lists persistent paid invoices for the authenticated organization', async () => {
  const pool = {
    async execute(sql, params) {
      assert.match(sql, /FROM pos_subscription_payments/);
      assert.deepEqual(params, [21]);
      return [[{
        stripe_invoice_id: 'in_123',
        stripe_subscription_id: 'sub_123',
        invoice_number: 'INV-123',
        amount_paid_minor: '59900',
        currency: 'MXN',
        status: 'paid',
        paid_at: new Date().toISOString(),
        hosted_invoice_url: 'https://invoice.stripe.test/in_123'
      }]];
    },
    async getConnection() {
      throw new Error('Payment history lookup should not open a database transaction');
    }
  };
  const service = createPosSubscriptionService({ pool });

  const payments = await service.listOrganizationPayments(21);

  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 599);
  assert.equal(payments[0].invoice_id, 'in_123');
  assert.equal(payments[0].invoice_url, 'https://invoice.stripe.test/in_123');
});

test('persists paid Stripe invoices received by the webhook', async () => {
  const paymentParameters = [];
  const pool = {
    async execute(sql, params) {
      if (sql.includes('FROM pos_subscription_customers')) return [[{ organization_id: 21 }]];
      if (sql.includes('INSERT INTO pos_subscription_payments')) {
        paymentParameters.push(params);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute() {
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000),
        cancel_at_period_end: false,
        metadata: { organization_id: '21', plan_code: 'monthly' },
        items: { data: [{ price: { id: 'price_monthly' } }] }
      })
    }
  };
  const service = createPosSubscriptionService({ pool, stripe });

  await service.processStripeEvent({
    id: 'evt_paid_invoice',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_123',
        status: 'paid',
        customer: 'cus_123',
        subscription: 'sub_123',
        payment_intent: 'pi_123',
        number: 'INV-123',
        amount_paid: 59900,
        currency: 'mxn',
        status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
        hosted_invoice_url: 'https://invoice.stripe.test/in_123'
      }
    }
  });

  assert.equal(paymentParameters.length, 1);
  assert.equal(paymentParameters[0][1], 'in_123');
  assert.equal(paymentParameters[0][5], 59900);
  assert.equal(paymentParameters[0][6], 'MXN');
});

test('reconciles a paid Stripe Checkout session into the organization subscription when webhook was missed', async () => {
  let persistedSubscription = null;
  const paymentStatements = [];
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM pos_subscription_customers')) {
        return sql.includes('SELECT organization_id')
          ? [[{ organization_id: 21 }]]
          : [[{ stripe_customer_id: 'cus_123' }]];
      }
      if (sql.includes('FROM pos_subscription_plans')) {
        return [[{
          code: 'monthly',
          name: 'Suscripción mensual',
          amount: '599.00',
          currency: 'MXN',
          interval_unit: 'month',
          interval_count: 1,
          is_active: 1,
          stripe_price_id: 'price_monthly'
        }]];
      }
      if (sql.includes('FROM pos_subscriptions')) return [persistedSubscription ? [persistedSubscription] : []];
      if (sql.includes('INSERT INTO pos_subscription_payments')) {
        paymentStatements.push(sql);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql, params) {
          if (sql.includes('INSERT INTO pos_subscriptions')) {
            persistedSubscription = {
              status: params[5],
              contracted_amount: '599.00',
              contracted_currency: 'MXN',
              contracted_interval_unit: 'month',
              contracted_interval_count: 1,
              current_period_start: params[6] ? new Date(`${params[6].replace(' ', 'T')}Z`).toISOString() : null,
              current_period_end: new Date(`${params[7].replace(' ', 'T')}Z`).toISOString(),
              cancel_at_period_end: params[8],
              canceled_at: null
            };
          }
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const stripe = {
    checkout: {
      sessions: {
        list: async () => ({
          data: [{
            mode: 'subscription',
            payment_status: 'paid',
            customer: 'cus_123',
            client_reference_id: '21',
            metadata: {
              organization_id: '21',
              plan_code: 'monthly',
              price_id: 'price_monthly'
            },
            subscription: 'sub_123'
          }]
        })
      }
    },
    invoices: {
      list: async () => ({
        data: [{
          id: 'in_123',
          status: 'paid',
          customer: 'cus_123',
          subscription: 'sub_123',
          payment_intent: 'pi_123',
          number: 'INV-123',
          amount_paid: 59900,
          currency: 'mxn',
          status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
          hosted_invoice_url: 'https://invoice.stripe.test/in_123'
        }]
      })
    },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000),
        cancel_at_period_end: false,
        metadata: { organization_id: '21', plan_code: 'monthly' },
        items: { data: [{ price: { id: 'price_monthly' } }] }
      })
    }
  };
  const service = createPosSubscriptionService({ pool, stripe });

  const result = await service.reconcileCheckout(21);

  assert.equal(result.payment_confirmed, true);
  assert.equal(result.access_allowed, true);
  assert.equal(result.subscription.status, 'active');
  assert.equal(paymentStatements.length, 1);
});

test('does not activate an organization when Stripe Checkout is unpaid', async () => {
  let subscriptionPersisted = false;
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM pos_subscription_customers')) return [[{ stripe_customer_id: 'cus_123' }]];
      if (sql.includes('FROM pos_subscription_plans')) {
        return [[{
          code: 'monthly',
          name: 'Suscripción mensual',
          amount: '599.00',
          currency: 'MXN',
          interval_unit: 'month',
          interval_count: 1,
          is_active: 1,
          stripe_price_id: 'price_monthly'
        }]];
      }
      if (sql.includes('FROM pos_subscriptions')) {
        return [subscriptionPersisted ? [{ status: 'active', current_period_end: null }] : []];
      }
      return [{ affectedRows: 1 }];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql) {
          if (sql.includes('INSERT INTO pos_subscriptions')) subscriptionPersisted = true;
          return [{ affectedRows: 1 }];
        },
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
  const stripe = {
    checkout: {
      sessions: {
        list: async () => ({
          data: [{
            mode: 'subscription',
            payment_status: 'unpaid',
            customer: 'cus_123',
            client_reference_id: '21',
            metadata: { organization_id: '21', plan_code: 'monthly', price_id: 'price_monthly' },
            subscription: 'sub_123'
          }]
        })
      }
    },
    invoices: { list: async () => ({ data: [] }) }
  };
  const service = createPosSubscriptionService({ pool, stripe });

  const result = await service.reconcileCheckout(21);

  assert.equal(result.payment_confirmed, false);
  assert.equal(result.access_allowed, false);
  assert.equal(subscriptionPersisted, false);
});
