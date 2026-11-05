import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionService } from './subscription.service.js';
import { requireEntitlement, resolveAccount } from './subscription.middleware.js';

test('returns active subscription with effective entitlement', async () => {
  const service = createSubscriptionService({ repository: { findAccountForUser: async () => ({ id: 25 }), findEffectiveSubscription: async () => [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1, override_enabled: null, limits_json: '{"providers":20}', cancel_at_period_end: 0, current_period_end: new Date('2026-10-01T00:00:00Z') }] } });
  const result = await service.getForUser(7);
  assert.equal(result.entitlements.ct, true);
  assert.equal(result.limits.providers, 20);
  assert.equal(result.access_allowed, true);
  assert.equal(result.days_remaining, 28);
});

test('does not grant entitlements after the subscription period ends', async () => {
  const service = createSubscriptionService({ repository: { findEffectiveSubscription: async () => [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1, current_period_end: new Date('2020-01-01T00:00:00Z') }] } });
  const result = await service.getForAccount(25);
  assert.equal(result.status, 'expired');
  assert.equal(result.access_allowed, false);
  assert.equal(result.is_expired, true);
  assert.equal(result.days_remaining, 0);
  assert.deepEqual(result.entitlements, {});
  assert.equal(await service.hasEntitlement(25, 'ct'), false);
});

test('does not grant a cached entitlement after its period ends', async () => {
  const service = createSubscriptionService({
    redis: { get: async () => JSON.stringify({ status: 'active', current_period_end: '2020-01-01T00:00:00.000Z', entitlements: { ct: true } }) },
    repository: { findEffectiveSubscription: async () => { throw new Error('must use cached projection'); } }
  });
  assert.equal(await service.hasEntitlement(25, 'ct'), false);
});

test('returns an empty projection without a subscription', async () => {
  const service = createSubscriptionService({ repository: { findAccountForUser: async () => ({ id: 25 }), findEffectiveSubscription: async () => [] } });
  const result = await service.getForUser(7);
  assert.equal(result.status, 'expired');
  assert.deepEqual(result.entitlements, {});
});

test('blocks a request without the requested entitlement', async () => {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await requireEntitlement('ct', { service: { hasEntitlement: async () => false } })({ account: { id: 25 } }, response, () => { throw new Error('must not continue'); });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, 'SUBSCRIPTION_REQUIRED');
});

test('invalidates the account cache key', async () => {
  let deletedKey;
  const service = createSubscriptionService({ redis: { del: async key => { deletedKey = key; } }, repository: { findEffectiveSubscription: async () => [] } });
  await service.invalidateAccount(25);
  assert.equal(deletedKey, 'saas:entitlements:account:25:v1');
});

test('refresh invalidates before rebuilding the effective projection', async () => {
  const calls = [];
  const service = createSubscriptionService({
    redis: { del: async key => calls.push(`del:${key}`), get: async () => null, set: async () => calls.push('set') },
    repository: { findAccountForUser: async () => ({ id: 25 }), findEffectiveSubscription: async () => [{ status: 'trialing', plan_id: 'legacy', plan_name: 'Legacy', feature_key: 'ct', enabled: 1 }] }
  });
  const result = await service.refreshForUser(7);
  assert.equal(result.status, 'trialing');
  assert.equal(result.entitlements.ct, true);
  assert.deepEqual(calls, ['del:saas:entitlements:account:25:v1', 'set']);
});

test('does not grant access for non-active subscription states', async () => {
  const service = createSubscriptionService({ repository: { findEffectiveSubscription: async () => [{ status: 'past_due', plan_id: 'legacy', plan_name: 'Legacy', feature_key: 'ct', enabled: 1 }] } });
  const result = await service.getForAccount(25);
  assert.equal(result.status, 'past_due');
  assert.deepEqual(result.entitlements, {});
});

test('returns a public projection after an administrative subscription update', async () => {
  const service = createSubscriptionService({
    redis: { del: async () => {} },
    repository: {
      updateSubscription: async () => [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1 }]
    }
  });
  const result = await service.updateSubscription(25, { status: 'active', plan_id: 'enterprise' }, 7, '127.0.0.1');
  assert.equal(result.account_id, 25);
  assert.equal(result.entitlements.ct, true);
  assert.equal(result.plan.name, 'Enterprise');
});

test('admin role middleware rejects B2B roles', async () => {
  const requireRole = (await import('../middleware/requireRole.js')).default;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  requireRole('admin')({ session: { user: { id: 7, rol: 'proveedor' } } }, response, () => { throw new Error('must not continue'); });
  assert.equal(response.statusCode, 403);
});

test('admin marker can access SaaS permission without admin role text', async () => {
  const requirePermission = (await import('../middleware/requirePermission.js')).default;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  let continued = false;
  requirePermission('saas.subscription.read')({ session: { user: { id: 7, rol: 'proveedor', isAdminUser: true } } }, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(response.statusCode, 200);
});

test('does not resolve an account for a provider outside its SaaS account', async () => {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  const service = {
    findAccountForUser: async () => null,
    isProviderInAccount: async () => false
  };
  let continued = false;
  await resolveAccount({ service })(
    { session: { user: { id: 7, proveedor_id: 99 } } },
    response,
    () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, 'PROVIDER_OUTSIDE_ACCOUNT');
});

test('granular SaaS permission rejects B2B and accepts explicit permission', async () => {
  const requirePermission = (await import('../middleware/requirePermission.js')).default;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  const middleware = requirePermission('saas.subscription.update');
  middleware({ session: { user: { id: 7, rol: 'proveedor' } } }, response, () => { throw new Error('must not continue'); });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, 'PERMISSION_DENIED');

  let continued = false;
  middleware({ session: { user: { id: 7, rol: 'soporte', permisos: ['saas.subscription.update'] } } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('admin permission catalog includes subscription creation and cancellation', async () => {
  const requirePermission = (await import('../middleware/requirePermission.js')).default;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  let continued = false;
  requirePermission('saas.subscription.create')({ session: { user: { id: 7, rol: 'admin', permisos: ['saas.subscription.create'] } } }, response, () => { continued = true; });
  assert.equal(continued, true);
  continued = false;
  requirePermission('saas.subscription.cancel')({ session: { user: { id: 7, rol: 'admin', permisos: ['saas.subscription.cancel'] } } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('admin permission catalog includes plan management permissions', async () => {
  const { permissions } = await import('../utils/permissions.js');
  const saasPermissions = permissions.admin.saas;
  assert.ok(saasPermissions.includes('saas.plan.read'));
  assert.ok(saasPermissions.includes('saas.plan.create'));
  assert.ok(saasPermissions.includes('saas.plan.update'));
  assert.ok(saasPermissions.includes('saas.plan.delete'));
});

test('creates a subscription and invalidates its account cache', async () => {
  let created;
  let invalidated;
  const service = createSubscriptionService({
    repository: {
      createSubscription: async (accountId, values) => { created = { accountId, values }; return [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1 }]; }
    },
    redis: { del: async key => { invalidated = key; } }
  });
  const result = await service.createSubscription(25, { plan_id: 'enterprise', status: 'active' }, 7, '127.0.0.1');
  assert.equal(created.accountId, 25);
  assert.equal(result.entitlements.ct, true);
  assert.equal(invalidated, 'saas:entitlements:account:25:v1');
});

test('creates the initial subscription for the authenticated user without an account id', async () => {
  let received;
  const service = createSubscriptionService({
    repository: {
      createSubscriptionForUser: async (...args) => {
        received = args;
        return { accountId: 25, rows: [{ status: 'active', plan_id: 'starter', plan_name: 'Starter', feature_key: 'ct', enabled: 1 }] };
      }
    },
    redis: { del: async () => {} }
  });

  const result = await service.createSubscriptionForUser(7, { plan_id: 'starter', status: 'active' }, 7, '127.0.0.1', 21);
  assert.equal(received[0], 7);
  assert.equal(received[4], 21);
  assert.equal(result.account_id, 25);
  assert.equal(result.entitlements.ct, true);
});

test('automatically provisions the account and provider relationship during subscription creation', async () => {
  const calls = [];
  const service = createSubscriptionService({
    repository: {
      ensureAccountForSubscription: async (accountId, values) => { calls.push(`account:${accountId}:${values.plan_id}`); return { id: accountId, nombre: 'Cuenta', estado: 'active' }; },
      ensureProviderForAccount: async (accountId, proveedorId) => { calls.push(`provider:${accountId}:${proveedorId}`); return true; },
      createSubscription: async (accountId, values) => { calls.push(`subscription:${accountId}:${values.plan_id}`); return [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1 }]; }
    },
    redis: { del: async () => {} }
  });

  const result = await service.createSubscription(25, { plan_id: 'enterprise', status: 'active', proveedor_id: 21 }, 7, '127.0.0.1');
  assert.equal(result.entitlements.ct, true);
  assert.equal(calls.includes('account:25:enterprise'), true);
  assert.equal(calls.includes('provider:25:21'), true);
  assert.equal(calls.includes('subscription:25:enterprise'), true);
});

test('creates a subscription from repository payloads shaped like { rows }', async () => {
  const service = createSubscriptionService({
    repository: {
      createSubscription: async () => ({
        accountId: 25,
        rows: [{ status: 'active', plan_id: 'enterprise', plan_name: 'Enterprise', feature_key: 'ct', enabled: 1 }]
      })
    },
    redis: { del: async () => {} }
  });

  const result = await service.createSubscription(25, { plan_id: 'enterprise', status: 'active' }, 7, '127.0.0.1');
  assert.equal(result.account_id, 25);
  assert.equal(result.entitlements.ct, true);
});

test('cancels a subscription and invalidates the owning account', async () => {
  let canceled;
  const service = createSubscriptionService({
    repository: {
      cancelSubscription: async subscriptionId => { canceled = subscriptionId; return { account_id: 25 }; },
      findEffectiveSubscription: async () => []
    },
    redis: { del: async () => {} }
  });
  const result = await service.cancelSubscription(11, 7, '127.0.0.1', 'requested');
  assert.equal(canceled, 11);
  assert.equal(result.account_id, 25);
  assert.deepEqual(result.entitlements, {});
});

test('does not list subscriptions for a user without an account relationship', async () => {
  let listed = false;
  const service = createSubscriptionService({ repository: {
    findAccountForUser: async () => null,
    listSubscriptions: async () => { listed = true; return []; }
  } });
  assert.deepEqual(await service.listForUser(7, 99), []);
  assert.equal(listed, false);
});

test('admin service exposes plan and account management helpers', async () => {
  const calls = [];
  const service = createSubscriptionService({
    repository: {
      listPlans: async (filters) => { calls.push(['plans', filters]); return [{ id: 1, codigo: 'pro', nombre: 'Pro', estado: 'active' }]; },
      createPlan: async (values) => { calls.push(['create-plan', values]); return { id: 2, ...values }; },
      updatePlan: async (planId, values) => { calls.push(['update-plan', planId, values]); return { id: planId, ...values }; },
      deletePlan: async (planId) => { calls.push(['delete-plan', planId]); return { id: planId, estado: 'archived' }; },
      getAccount: async (accountId) => { calls.push(['account', accountId]); return { id: accountId, nombre: 'Demo', estado: 'active' }; },
      listAccountProviders: async (accountId) => { calls.push(['providers', accountId]); return [{ account_id: accountId, proveedor_id: 21 }]; }
    }
  });

  assert.deepEqual(await service.listPlans({ estado: 'active' }), [{ id: 1, codigo: 'pro', nombre: 'Pro', estado: 'active' }]);
  assert.deepEqual(await service.createPlan({ codigo: 'starter', nombre: 'Starter', estado: 'active' }, 7, '127.0.0.1'), { id: 2, codigo: 'starter', nombre: 'Starter', estado: 'active' });
  assert.deepEqual(await service.updatePlan(2, { nombre: 'Starter Plus' }, 7, '127.0.0.1'), { id: 2, nombre: 'Starter Plus' });
  assert.deepEqual(await service.deletePlan(2, 7, '127.0.0.1'), { id: 2, estado: 'archived' });
  assert.equal((await service.getAccount(7)).nombre, 'Demo');
  assert.deepEqual(await service.listAccountProviders(7), [{ account_id: 7, proveedor_id: 21 }]);
  assert.equal(calls.length, 6);
});

test('renewals reconcile account, provider and plan entitlements in one lifecycle call', async () => {
  const calls = [];
  const service = createSubscriptionService({
    repository: {
      ensureAccountForSubscription: async (accountId, values) => { calls.push(['ensure-account', accountId, values.plan_id]); return { id: accountId, nombre: 'Demo', estado: 'active' }; },
      ensureProviderForAccount: async (accountId, proveedorId) => { calls.push(['ensure-provider', accountId, proveedorId]); return true; },
      ensurePlanEntitlements: async (planId) => { calls.push(['ensure-plan', planId]); return true; },
      reconcileAccountEntitlements: async (accountId, planId) => { calls.push(['reconcile-entitlements', accountId, planId]); return true; },
      updateSubscription: async (accountId, values) => { calls.push(['update-subscription', accountId, values.plan_id]); return [{ status: 'active', plan_id: values.plan_id, plan_name: 'Enterprise', feature_key: 'ct', enabled: 1, current_period_end: new Date('2026-10-01T00:00:00Z'), cancel_at_period_end: 0 }]; }
    },
    redis: { del: async () => {} }
  });

  const result = await service.renewSubscription(25, { plan_id: 'enterprise', status: 'active', proveedor_id: 21 }, 7, '127.0.0.1');
  assert.equal(result.status, 'active');
  assert.equal(result.entitlements.ct, true);
  assert.equal(calls.some(call => call[0] === 'ensure-account'), true);
  assert.equal(calls.some(call => call[0] === 'ensure-provider'), true);
  assert.equal(calls.some(call => call[0] === 'ensure-plan'), true);
  assert.equal(calls.some(call => call[0] === 'reconcile-entitlements'), true);
});

test('repository list query orders by a selected column when DISTINCT is used', async () => {
  const pool = {
    execute: async (sql) => {
      assert.ok(sql.includes('ORDER BY s.created_at DESC'));
      return [[{ id: 1, account_id: 25, status: 'active', started_at: null, current_period_end: null, cancel_at_period_end: 0, canceled_at: null, created_at: '2026-09-02T00:00:00Z', plan_id: 'enterprise', plan_name: 'Enterprise' }]];
    }
  };

  const repo = (await import('./repository/subscription.repository.js')).createSubscriptionRepository(pool);
  const rows = await repo.listSubscriptions({ accountId: 25 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plan_id, 'enterprise');
});

test('creates a recurring Stripe price from commercial attributes only', async () => {
  let received;
  const service = createSubscriptionService({ repository: {
    getPlan: async () => ({ id: 3, codigo: 'pro', nombre: 'Pro' }),
    createPlanPrice: async (planId, values) => { received = { planId, values }; return { id: 9, plan_id: planId, amount: values.amount, currency: values.currency, status: 'active' }; }
  } });
  const stripe = {
    products: { create: async () => ({ id: 'prod_1' }) },
    prices: { create: async values => { assert.equal(values.unit_amount, 99900); assert.equal(values.recurring.interval, 'year'); return { id: 'price_private' }; } }
  };
  const result = await service.createPlanPrice(3, { amount: 999, currency: 'MXN', interval_unit: 'year', stripe_price_id: 'price_from_browser' }, 7, '127.0.0.1', stripe);
  assert.equal(result.id, 9);
  assert.equal(received.values.stripe_price_id, 'price_private');
  assert.equal(received.values.environment, 'test');
});

test('public plans are delegated with the selected environment', async () => {
  let filters;
  const service = createSubscriptionService({ repository: { listPlans: async values => { filters = values; return [{ codigo: 'pro', precio: 99, stripe_price_id: 'must_not_be_public' }]; } } });
  const plans = await service.listPublicPlans('live');
  assert.equal(filters.publicOnly, true);
  assert.equal(filters.environment, 'live');
  assert.equal(plans[0].codigo, 'pro');
});