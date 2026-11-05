import { createSubscriptionRepository } from './repository/subscription.repository.js';

const CACHE_TTL_SECONDS = 120;
const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'expired', 'suspended'];
const PRICE_CURRENCIES = /^[A-Z]{3}$/;
const PRICE_INTERVALS = ['month', 'year'];

function parseLimits(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function serializeDate(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getExpirationState(value, now = Date.now()) {
  if (!value) return { is_expired: false, days_remaining: null };
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return { is_expired: true, days_remaining: 0 };
  const millisecondsRemaining = timestamp - now;
  return {
    is_expired: millisecondsRemaining <= 0,
    days_remaining: Math.max(0, Math.ceil(millisecondsRemaining / 86400000))
  };
}

function normalizePayload(result, fallbackAccountId = null) {
  const rows = Array.isArray(result)
    ? result
    : Array.isArray(result?.rows)
      ? result.rows
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.items)
          ? result.items
          : [];
  const accountId = result?.accountId ?? result?.account_id ?? fallbackAccountId;
  return { rows, accountId };
}

function project(rows, accountId) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const first = safeRows.find(row => row && ['active', 'trialing'].includes(row.status)) ?? safeRows[0] ?? null;
  const currentPeriodEnd = serializeDate(first?.current_period_end);
  const expiration = getExpirationState(currentPeriodEnd);
  const status = first?.status || 'expired';
  const accessAllowed = ['active', 'trialing'].includes(status) && !expiration.is_expired;
  if (!safeRows.length || !first || !accessAllowed) return { account_id: accountId, status: expiration.is_expired ? 'expired' : status, plan: null, current_period_end: currentPeriodEnd, cancel_at_period_end: Boolean(first?.cancel_at_period_end), access_allowed: false, is_expired: expiration.is_expired, days_remaining: expiration.days_remaining, entitlements: {}, limits: {} };
  const entitlements = {};
  const limits = {};
  for (const row of rows) {
    if (!row.feature_key) continue;
    entitlements[row.feature_key] = row.override_enabled === null || row.override_enabled === undefined ? Boolean(row.enabled) : Boolean(row.override_enabled);
    if (entitlements[row.feature_key]) Object.assign(limits, parseLimits(row.limits_json));
  }
  return { account_id: accountId, status, plan: { id: first.plan_id, name: first.plan_name }, current_period_end: currentPeriodEnd, cancel_at_period_end: Boolean(first.cancel_at_period_end), access_allowed: true, is_expired: false, days_remaining: expiration.days_remaining, entitlements, limits };
}

export function createSubscriptionService({ pool, redis = null, repository = null } = {}) {
  const repo = repository || createSubscriptionRepository(pool);
  const cacheKey = accountId => `saas:entitlements:account:${accountId}:v1`;
  return {
    async getForAccount(accountId) {
      const key = cacheKey(accountId);
      if (redis?.get) {
        try { const cached = await redis.get(key); if (cached) return JSON.parse(cached); }
        catch (error) { console.warn('[subscriptions] Redis read failed:', error.message); }
      }
      const result = project(await repo.findEffectiveSubscription(accountId), accountId);
      if (redis?.set) {
        try { await redis.set(key, JSON.stringify(result), { EX: CACHE_TTL_SECONDS }); }
        catch (error) { console.warn('[subscriptions] Redis write failed:', error.message); }
      }
      return result;
    },
    async getForUser(userId, proveedorId = null) {
      const account = await repo.findAccountForUser(userId, proveedorId);
      return account ? this.getForAccount(account.id) : project([], null);
    },
    async listForUser(userId, proveedorId = null) {
      const account = await repo.findAccountForUser(userId, proveedorId);
      return account ? repo.listSubscriptions({ accountId: account.id, proveedorId }) : [];
    },
    async listSubscriptions(filters = {}) { return repo.listSubscriptions(filters); },
    async listPlans(filters = {}) { return repo.listPlans ? repo.listPlans(filters) : []; },
    async listPublicPlans(environment) { return repo.listPlans ? repo.listPlans({ publicOnly: true, environment }) : []; },
    async getCheckoutPlan(planCode, environment) { return repo.getCheckoutPlan ? repo.getCheckoutPlan(planCode, environment) : null; },
    async listPlanPrices(planId, environment) { return repo.listPlanPrices ? repo.listPlanPrices(planId, environment) : []; },
    async createPlanPrice(planId, values, actorUserId, ipAddress, stripe = null) {
      const plan = await repo.getPlan(planId);
      if (!plan) throw Object.assign(new Error('Plan no encontrado'), { status: 404, code: 'PLAN_NOT_FOUND' });
      const price = validatePrice(values);
      const environment = values.environment || currentStripeEnvironment();
      if (!stripe && !values.stripe_price_id) {
        throw Object.assign(new Error('Stripe no esta configurado para crear el Price'), { status: 503, code: 'STRIPE_UNAVAILABLE' });
      }
      let stripePriceId = null;
      if (stripe) {
        const product = await stripe.products.create({ name: plan.nombre, metadata: { plan_id: String(plan.id), plan_code: plan.codigo } });
        const stripePrice = await stripe.prices.create({ product: product.id, unit_amount: Math.round(price.amount * 100), currency: price.currency.toLowerCase(), recurring: { interval: price.interval_unit, interval_count: price.interval_count }, metadata: { plan_id: plan.codigo, environment } });
        stripePriceId = stripePrice.id;
      }
      return repo.createPlanPrice(planId, { ...price, environment, stripe_price_id: stripePriceId || values.stripe_price_id }, actorUserId, ipAddress);
    },
    async activatePlanPrice(priceVersionId, actorUserId, ipAddress) { return repo.setPlanPriceStatus ? repo.setPlanPriceStatus(priceVersionId, 'active', actorUserId, ipAddress) : null; },
    async archivePlanPrice(priceVersionId, actorUserId, ipAddress) { return repo.setPlanPriceStatus ? repo.setPlanPriceStatus(priceVersionId, 'archived', actorUserId, ipAddress) : null; },
    async getPlan(planId) { return repo.getPlan ? repo.getPlan(planId) : null; },
    async createPlan(values, actorUserId, ipAddress) {
      const plan = repo.createPlan ? await repo.createPlan(values, actorUserId, ipAddress) : null;
      console.info('[subscriptions][entitlements][service-plan-create]', { plan_id: plan?.id || null, has_entitlements: Object.prototype.hasOwnProperty.call(values, 'entitlements'), entitlement_keys: Array.isArray(values.entitlements) ? values.entitlements : Object.keys(values.entitlements || {}) });
      if (plan && values.entitlements && repo.replacePlanEntitlements) await repo.replacePlanEntitlements(plan.id, values.entitlements);
      return plan;
    },
    async updatePlan(planId, values, actorUserId, ipAddress) {
      const plan = repo.updatePlan ? await repo.updatePlan(planId, values, actorUserId, ipAddress) : null;
      console.info('[subscriptions][entitlements][service-plan-update]', { plan_id: planId, has_entitlements: Object.prototype.hasOwnProperty.call(values, 'entitlements'), entitlement_keys: Array.isArray(values.entitlements) ? values.entitlements : Object.keys(values.entitlements || {}) });
      if (plan && values.entitlements && repo.replacePlanEntitlements) await repo.replacePlanEntitlements(planId, values.entitlements);
      return plan;
    },
    async listPlanEntitlements(planId) { return repo.listPlanEntitlements ? repo.listPlanEntitlements(planId) : []; },
    async replacePlanEntitlements(planId, entitlements) { return repo.replacePlanEntitlements ? repo.replacePlanEntitlements(planId, entitlements) : []; },
    async updatePlanEntitlement(planId, featureKey, values) { return repo.updatePlanEntitlement(planId, featureKey, values); },
    async deletePlanEntitlement(planId, featureKey) {
      const result = await repo.deletePlanEntitlement(planId, featureKey);
      for (const accountId of result.accountIds || []) await this.invalidateAccount(accountId);
      return result;
    },
    async listSubscriptionEntitlements(subscriptionId) { return repo.listSubscriptionEntitlements(subscriptionId); },
    async updateSubscriptionEntitlement(subscriptionId, featureKey, values) {
      const result = await repo.updateSubscriptionEntitlement(subscriptionId, featureKey, values);
      const accountId = await repo.findSubscriptionAccountId(subscriptionId);
      await this.invalidateAccount(accountId);
      return result;
    },
    async deleteSubscriptionEntitlement(subscriptionId, featureKey) {
      const deleted = await repo.deleteSubscriptionEntitlement(subscriptionId, featureKey);
      const accountId = await repo.findSubscriptionAccountId(subscriptionId);
      await this.invalidateAccount(accountId);
      return deleted;
    },
    async deletePlan(planId, actorUserId, ipAddress) { return repo.deletePlan ? repo.deletePlan(planId, actorUserId, ipAddress) : null; },
    async listAccounts(filters = {}) { return repo.listAccounts ? repo.listAccounts(filters) : []; },
    async getAccount(accountId) { return repo.getAccount ? repo.getAccount(accountId) : null; },
    async createAccount(values, actorUserId, ipAddress) { return repo.createAccount ? repo.createAccount(values, actorUserId, ipAddress) : null; },
    async updateAccount(accountId, values, actorUserId, ipAddress) { return repo.updateAccount ? repo.updateAccount(accountId, values, actorUserId, ipAddress) : null; },
    async listAccountProviders(accountId) { return repo.listAccountProviders ? repo.listAccountProviders(accountId) : []; },
    async addAccountProvider(accountId, proveedorId, actorUserId, ipAddress) { return repo.addAccountProvider ? repo.addAccountProvider(accountId, proveedorId, actorUserId, ipAddress) : null; },
    async removeAccountProvider(accountId, proveedorId, actorUserId, ipAddress) { return repo.removeAccountProvider ? repo.removeAccountProvider(accountId, proveedorId, actorUserId, ipAddress) : null; },
    async getSubscription(subscriptionId) { return repo.findSubscription(subscriptionId); },
    async refreshForUser(userId, proveedorId = null) {
      const account = await repo.findAccountForUser(userId, proveedorId);
      if (!account) return project([], null);
      await this.invalidateAccount(account.id);
      return this.getForAccount(account.id);
    },
    async findAccountForUser(userId, proveedorId = null) { return repo.findAccountForUser(userId, proveedorId); },
    async isProviderInAccount(accountId, proveedorId) { return repo.isProviderInAccount(accountId, proveedorId); },
    async hasEntitlement(accountId, feature) {
      const subscription = await this.getForAccount(accountId);
      const expiration = getExpirationState(subscription.current_period_end);
      return ['active', 'trialing'].includes(subscription.status)
        && !expiration.is_expired
        && subscription.entitlements[feature] === true;
    },
    async reconcileSubscriptionLifecycle(accountId, values = {}, actorUserId = null, ipAddress = null) {
      const targetAccountId = accountId ?? values.account_id ?? null;
      if (targetAccountId !== null && typeof repo.ensureAccountForSubscription === 'function') {
        await repo.ensureAccountForSubscription(targetAccountId, values, actorUserId, ipAddress);
      }
      if (values.proveedor_id && typeof repo.ensureProviderForAccount === 'function') {
        await repo.ensureProviderForAccount(targetAccountId, values.proveedor_id, actorUserId, ipAddress);
      }
      if (values.plan_id && typeof repo.ensurePlanEntitlements === 'function') {
        await repo.ensurePlanEntitlements(values.plan_id, values.entitlements || null, actorUserId, ipAddress);
      }
      if (targetAccountId !== null && values.plan_id && typeof repo.reconcileAccountEntitlements === 'function') {
        await repo.reconcileAccountEntitlements(targetAccountId, values.plan_id, actorUserId, ipAddress);
      }
      return targetAccountId;
    },
    async createSubscription(accountId, values, actorUserId, ipAddress) {
      validateSubscription(values);
      const targetAccountId = accountId ?? values.account_id ?? null;
      await this.reconcileSubscriptionLifecycle(targetAccountId, values, actorUserId, ipAddress);
      const subscription = await repo.createSubscription(targetAccountId, values, actorUserId, ipAddress);
      const normalized = normalizePayload(subscription, targetAccountId);
      await this.invalidateAccount(normalized.accountId ?? targetAccountId);
      return project(normalized.rows, normalized.accountId ?? targetAccountId);
    },
    async createSubscriptionForUser(userId, values, actorUserId, ipAddress, proveedorId = null) {
      validateSubscription(values);
      if (!userId) throw Object.assign(new Error('Usuario invalido'), { status: 401, code: 'UNAUTHORIZED' });
      if (typeof repo.createSubscriptionForUser !== 'function') {
        throw Object.assign(new Error('El alta inicial de suscripcion no esta disponible'), { status: 503, code: 'SUBSCRIPTION_SIGNUP_UNAVAILABLE' });
      }
      const subscription = await repo.createSubscriptionForUser(userId, values, actorUserId ?? userId, ipAddress, proveedorId);
      const normalized = normalizePayload(subscription);
      await this.invalidateAccount(normalized.accountId);
      return project(normalized.rows, normalized.accountId);
    },
    async updateSubscription(accountId, values, actorUserId, ipAddress) {
      console.info('[subscriptions][entitlements][service-update]', {
        account_id: accountId,
        plan_id: values.plan_id || null,
        has_entitlements: Object.prototype.hasOwnProperty.call(values, 'entitlements'),
        entitlement_keys: Array.isArray(values.entitlements) ? values.entitlements : Object.keys(values.entitlements || {}),
        repository_reconcile_available: typeof repo.reconcileAccountEntitlements === 'function',
        repository_plan_sync_available: typeof repo.ensurePlanEntitlements === 'function' || typeof repo.replacePlanEntitlements === 'function'
      });
      validateSubscription(values);
      await this.reconcileSubscriptionLifecycle(accountId, values, actorUserId, ipAddress);
      const rows = await repo.updateSubscription(accountId, values, actorUserId, ipAddress);
      if (values.entitlements && values.plan_id && typeof repo.replacePlanEntitlements === 'function') {
        console.info('[subscriptions][entitlements][service-persist-plan]', { account_id: accountId, plan_id: values.plan_id });
        await repo.replacePlanEntitlements(values.plan_id, values.entitlements);
      }
      const normalized = normalizePayload(rows, accountId);
      const subscriptionId = normalized.rows[0]?.subscription_id;
      if (subscriptionId && values.plan_id && typeof repo.snapshotSubscriptionEntitlements === 'function') await repo.snapshotSubscriptionEntitlements(subscriptionId, values.plan_id);
      await this.invalidateAccount(normalized.accountId ?? accountId);
      const effectiveRows = subscriptionId && typeof repo.findEffectiveSubscription === 'function'
        ? await repo.findEffectiveSubscription(normalized.accountId ?? accountId)
        : normalized.rows;
      return project(effectiveRows, normalized.accountId ?? accountId);
    },
    async renewSubscription(accountId, values, actorUserId, ipAddress) {
      validateSubscription(values);
      await this.reconcileSubscriptionLifecycle(accountId, values, actorUserId, ipAddress);
      const updateResult = typeof repo.updateSubscription === 'function'
        ? await repo.updateSubscription(accountId, values, actorUserId, ipAddress)
        : await repo.createSubscription(accountId, values, actorUserId, ipAddress);
      const normalized = normalizePayload(updateResult, accountId);
      const effectiveRows = Array.isArray(normalized.rows) && normalized.rows.length
        ? normalized.rows
        : (typeof repo.findEffectiveSubscription === 'function' ? await repo.findEffectiveSubscription(accountId) : normalized.rows);
      const effectiveAccountId = normalized.accountId ?? accountId;
      await this.invalidateAccount(effectiveAccountId);
      return project(effectiveRows, effectiveAccountId);
    },
    async updateSubscriptionById(subscriptionId, values, actorUserId, ipAddress) {
      console.info('[subscriptions][entitlements][service-update-by-id]', {
        subscription_id: subscriptionId,
        plan_id: values.plan_id || null,
        has_entitlements: Object.prototype.hasOwnProperty.call(values, 'entitlements'),
        entitlement_keys: Array.isArray(values.entitlements) ? values.entitlements : Object.keys(values.entitlements || {}),
        repository_reconcile_available: typeof repo.reconcileAccountEntitlements === 'function',
        repository_plan_sync_available: typeof repo.ensurePlanEntitlements === 'function' || typeof repo.replacePlanEntitlements === 'function'
      });
      validateSubscription(values);
      const result = await repo.updateSubscriptionById(subscriptionId, values, actorUserId, ipAddress);
      const normalized = normalizePayload(result, result?.accountId ?? null);
      if (normalized.accountId) {
        await this.reconcileSubscriptionLifecycle(normalized.accountId, values, actorUserId, ipAddress);
      }
      if (values.entitlements && values.plan_id && typeof repo.replacePlanEntitlements === 'function') {
        console.info('[subscriptions][entitlements][service-persist-plan]', { subscription_id: subscriptionId, plan_id: values.plan_id });
        await repo.replacePlanEntitlements(values.plan_id, values.entitlements);
      }
      const effectiveSubscriptionId = normalized.rows[0]?.subscription_id;
      if (effectiveSubscriptionId && values.plan_id && typeof repo.snapshotSubscriptionEntitlements === 'function') await repo.snapshotSubscriptionEntitlements(effectiveSubscriptionId, values.plan_id);
      await this.invalidateAccount(normalized.accountId ?? result?.accountId ?? subscriptionId);
      const effectiveRows = effectiveSubscriptionId && typeof repo.findEffectiveSubscription === 'function'
        ? await repo.findEffectiveSubscription(normalized.accountId ?? result?.accountId ?? null)
        : normalized.rows;
      return project(effectiveRows, normalized.accountId ?? result?.accountId ?? null);
    },
    async cancelSubscription(subscriptionId, actorUserId, ipAddress, reason = null) {
      const subscription = await repo.cancelSubscription(subscriptionId, actorUserId, ipAddress, reason);
      await this.invalidateAccount(subscription.account_id);
      return project(await repo.findEffectiveSubscription(subscription.account_id), subscription.account_id);
    },
    async updateOverride(accountId, featureKey, values, actorUserId, ipAddress) {
      const rows = await repo.updateOverride(accountId, featureKey, values, actorUserId, ipAddress);
      await this.invalidateAccount(accountId);
      return project(rows, accountId);
    },
    async invalidateAccount(accountId) {
      if (!redis?.del) return;
      try { await redis.del(cacheKey(accountId)); }
      catch (error) { console.warn('[subscriptions] Redis invalidation failed:', error.message); }
    },
    async getOrCreateAccountForUser(userId, accountName = null, proveedorId = null, actorUserId = null, ipAddress = null) {
      if (!userId) throw Object.assign(new Error('Usuario invalido'), { status: 401, code: 'UNAUTHORIZED' });
      if (typeof repo.getOrCreateAccountForUser !== 'function') {
        throw Object.assign(new Error('La operación no está disponible'), { status: 503, code: 'ACCOUNT_OPERATION_UNAVAILABLE' });
      }
      const account = await repo.getOrCreateAccountForUser(userId, accountName, proveedorId, actorUserId ?? userId, ipAddress);
      return account;
    }
  };
}

function hasOwn(values, property) {
  return Object.prototype.hasOwnProperty.call(values, property);
}

function validateSubscription(values = {}) {
  if (!SUBSCRIPTION_STATUSES.includes(values.status)) throw Object.assign(new Error('Estado invalido'), { status: 422, code: 'INVALID_SUBSCRIPTION_STATUS' });
  if (!values.plan_id || typeof values.plan_id !== 'string') throw Object.assign(new Error('Plan invalido'), { status: 422, code: 'INVALID_PLAN' });
  if (hasOwn(values, 'current_period_end')) {
    if (values.current_period_end === '' || (values.current_period_end !== null && (typeof values.current_period_end !== 'string' || Number.isNaN(new Date(values.current_period_end).getTime())))) {
      throw Object.assign(new Error('La fecha de finalizacion debe ser ISO 8601 o null'), { status: 422, code: 'INVALID_CURRENT_PERIOD_END' });
    }
  }
  if (hasOwn(values, 'cancel_at_period_end') && typeof values.cancel_at_period_end !== 'boolean') {
    throw Object.assign(new Error('cancel_at_period_end debe ser booleano'), { status: 422, code: 'INVALID_CANCEL_AT_PERIOD_END' });
  }
}

function currentStripeEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test');
}

function validatePrice(values = {}) {
  const amount = Number(values.amount ?? values.precio);
  const currency = String(values.currency ?? values.moneda ?? '').trim().toUpperCase();
  const intervalUnit = String(values.interval_unit ?? values.intervalo ?? '').trim().toLowerCase();
  const intervalCount = Number(values.interval_count ?? values.intervalo_cantidad ?? 1);
  if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) throw Object.assign(new Error('El importe debe ser un numero no negativo con hasta dos decimales'), { status: 422, code: 'INVALID_PRICE_AMOUNT' });
  if (!PRICE_CURRENCIES.test(currency)) throw Object.assign(new Error('La moneda debe ser un codigo ISO de tres letras'), { status: 422, code: 'INVALID_PRICE_CURRENCY' });
  if (!PRICE_INTERVALS.includes(intervalUnit) || !Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 12) throw Object.assign(new Error('El intervalo no es valido'), { status: 422, code: 'INVALID_PRICE_INTERVAL' });
  return { amount, currency, interval_unit: intervalUnit, interval_count: intervalCount };
}