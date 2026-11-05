import { toSubscriptionListResponse, toSubscriptionResponse } from './subscription.dto.js';
import express from 'express';
import Stripe from 'stripe';
import requireAuth from '../middleware/requireAuth.js';
import poolCT from '../ct/config/db_ct.js';
import { createSubscriptionService } from './subscription.service.js';
import { getRedis } from '../config/redisClient.js';
import requirePermission from '../middleware/requirePermission.js';
import { createHash } from 'node:crypto';

const router = express.Router();
const redis = {
  async get(key) { return (await getRedis()).get(key); },
  async set(key, value, options) { return (await getRedis()).set(key, value, options); },
  async del(key) { return (await getRedis()).del(key); }
};
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const service = createSubscriptionService({ pool: poolCT, redis });
function normalizeCheckoutPlan(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function stripeEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test');
}

function logCheckout(req, event, details = {}) {
  console.info('[subscriptions][checkout]', {
    event,
    request_id: req.get('x-request-id') || null,
    user_id: req.session?.user?.id || null,
    ...details
  });
}

async function resolveUserEmail(user) {
  const sessionEmail = String(user.email || '').trim().toLowerCase();
  if (sessionEmail) return sessionEmail;

  const [rows] = await poolCT.execute('SELECT email FROM users WHERE id = ? LIMIT 1', [user.id]);
  return String(rows[0]?.email || '').trim().toLowerCase();
}

async function getOrCreateStripeCustomer({ account, user, idempotencyKey }) {
  const email = await resolveUserEmail(user);
  if (!email) {
    throw Object.assign(new Error('El usuario necesita un correo para contratar una suscripcion.'), { status: 422, code: 'CUSTOMER_EMAIL_REQUIRED' });
  }

  const customers = await stripe.customers.search({
    query: `metadata['account_id']:'${String(account.id)}'`,
    limit: 1
  });
  if (customers.data[0]) return customers.data[0];

  return stripe.customers.create({
    email,
    name: user.nombre || user.name || undefined,
    metadata: { account_id: String(account.id) }
  }, { idempotencyKey: `${idempotencyKey}-customer` });
}

async function resolveSubscriptionPaymentIntent(subscription) {
  let invoice = subscription.latest_invoice || null;
  let paymentIntent = invoice && typeof invoice.payment_intent === 'object'
    ? invoice.payment_intent
    : null;
  const invoiceId = typeof invoice === 'string' ? invoice : invoice?.id;

  if (invoiceId && !paymentIntent) {
    invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['payment_intent', 'payments.data.payment.payment_intent']
    });
    paymentIntent = invoice.payment_intent && typeof invoice.payment_intent === 'object'
      ? invoice.payment_intent
      : null;
  }

  if (invoice?.payment_intent && typeof invoice.payment_intent === 'string') {
    paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
  }

  const invoicePayment = invoice?.payments?.data?.find(item => item?.payment?.payment_intent);
  const invoicePaymentIntent = invoicePayment?.payment?.payment_intent;
  if (!paymentIntent && invoicePaymentIntent) {
    paymentIntent = typeof invoicePaymentIntent === 'object'
      ? invoicePaymentIntent
      : await stripe.paymentIntents.retrieve(invoicePaymentIntent);
  }

  if (!paymentIntent && invoice?.id && stripe.invoicePayments?.list) {
    const payments = await stripe.invoicePayments.list({ invoice: invoice.id }, { expand: ['data.payment.payment_intent'] });
    const listedPaymentIntent = payments.data?.find(item => item?.payment?.payment_intent)?.payment?.payment_intent;
    if (listedPaymentIntent) {
      paymentIntent = typeof listedPaymentIntent === 'object'
        ? listedPaymentIntent
        : await stripe.paymentIntents.retrieve(listedPaymentIntent);
    }
  }

  return {
    invoice,
    paymentIntent,
    clientSecret: paymentIntent?.client_secret || invoice?.confirmation_secret?.client_secret || null,
    clientSecretSource: paymentIntent?.client_secret ? 'payment_intent' : invoice?.confirmation_secret?.client_secret ? 'confirmation_secret' : null
  };
}

async function findPendingStripeSubscription(customerId, metadata) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'incomplete',
    limit: 20
  });
  return subscriptions.data.find(subscription => (
    subscription.metadata?.account_id === metadata.account_id
    && subscription.metadata?.plan_id === metadata.plan_id
    && subscription.metadata?.price_version_id === metadata.price_version_id
    && subscription.metadata?.environment === metadata.environment
  )) || null;
}

function stripeSubscriptionIdempotencyKey(frontendKey) {
  return `subscription-v2-${createHash('sha256').update(frontendKey).digest('hex')}`;
}

function requireSaasAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } });
  if (user.rol !== 'admin' && user.isAdminUser !== true) {
    return res.status(403).json({ error: { code: 'PERMISSION_DENIED', message: 'Se requiere acceso administrativo.' } });
  }
  next();
}

router.get('/account/subscription', requireAuth, async (req, res, next) => {
  try {
    const subscription = toSubscriptionResponse(await service.getForUser(req.session.user.id));
    logCheckout(req, 'subscription_state_returned', {
      checkout_stage: 'frontend_subscription_refresh',
      subscription_status: subscription.data?.status || null,
      access_allowed: subscription.data?.access_allowed ?? null,
      is_expired: subscription.data?.is_expired ?? null,
      current_period_end: subscription.data?.current_period_end || null
    });
    res.json(subscription);
  } catch (error) {
    logCheckout(req, 'subscription_state_failed', { checkout_stage: 'frontend_subscription_refresh', error_code: error.code || 'SUBSCRIPTION_STATE_ERROR', error_message: error.message });
    next(error);
  }
});

router.get('/account/providers/:proveedorId/subscriptions', requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await service.listForUser(req.session.user.id, req.params.proveedorId);
    res.json(toSubscriptionListResponse(subscriptions));
  } catch (error) { next(error); }
});

router.post('/account/subscription/refresh', requireAuth, async (req, res, next) => {
  try { res.json(toSubscriptionResponse(await service.refreshForUser(req.session.user.id))); }
  catch (error) { next(error); }
});

router.get(['/plans', '/account/plans'], async (req, res, next) => {
  try {
    const plans = await service.listPublicPlans(stripeEnvironment());
    const availablePlans = plans.filter(plan => plan.price_version_id && plan.stripe_price_id);
    res.json({ data: availablePlans.map(plan => ({ id: plan.id, codigo: plan.codigo, nombre: plan.nombre, descripcion: plan.descripcion, precio: plan.precio === null || plan.precio === undefined ? null : Number(plan.precio), moneda: plan.moneda || null, intervalo: plan.intervalo || null, intervalo_cantidad: plan.intervalo_cantidad || null, estado: plan.estado })) });
  } catch (error) { next(error); }
});

router.post('/account/checkout', requireAuth, async (req, res, next) => {
  try {
    logCheckout(req, 'checkout_started', {
      checkout_stage: 'request_received',
      has_idempotency_key: Boolean(req.get('Idempotency-Key')),
      requested_plan_id: normalizeCheckoutPlan(req.body?.plan_id),
      stripe_environment: stripeEnvironment()
    });
    if (!stripe) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'stripe_configuration', error_code: 'STRIPE_UNAVAILABLE' });
      return res.status(503).json({ error: { code: 'STRIPE_UNAVAILABLE', message: 'El pago de suscripciones no esta configurado.' } });
    }

    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,255}$/.test(idempotencyKey)) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'idempotency_validation', error_code: 'IDEMPOTENCY_KEY_REQUIRED' });
      return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Se requiere Idempotency-Key para iniciar el pago.' } });
    }

    const planId = normalizeCheckoutPlan(req.body?.plan_id);
    if (!planId) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'plan_validation', error_code: 'INVALID_SUBSCRIPTION_PLAN' });
      return res.status(422).json({ error: { code: 'INVALID_SUBSCRIPTION_PLAN', message: 'Selecciona un plan mensual, trimestral o anual.' } });
    }
    const plan = await service.getCheckoutPlan(planId, stripeEnvironment());
    if (!plan) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'plan_lookup', plan_id: planId, error_code: 'INVALID_SUBSCRIPTION_PLAN' });
      return res.status(422).json({ error: { code: 'INVALID_SUBSCRIPTION_PLAN', message: 'El plan solicitado no esta disponible.' } });
    }
    const priceId = plan.price_version_id && plan.stripe_price_id;
    if (!priceId) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'stripe_price_validation', plan_id: plan.codigo || planId, error_code: 'PLAN_STRIPE_NOT_CONFIGURED' });
      return res.status(422).json({ error: { code: 'PLAN_STRIPE_NOT_CONFIGURED', message: 'El plan no tiene un Price recurrente configurado.' } });
    }
    logCheckout(req, 'plan_resolved', { checkout_stage: 'plan_resolved', plan_id: plan.codigo || planId, price_version_id: plan.price_version_id });

    const account = await service.getOrCreateAccountForUser(
      req.session.user.id,
      req.session.user.nombre || req.session.user.name || null,
      req.session.user.proveedor_id ?? null,
      req.session.user.id,
      req.ip
    );
    if (!account) {
      logCheckout(req, 'checkout_rejected', { checkout_stage: 'account_resolution', plan_id: plan.codigo || planId, error_code: 'ACCOUNT_NOT_FOUND' });
      return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'No se encontro una cuenta para el usuario.' } });
    }
    logCheckout(req, 'account_resolved', { checkout_stage: 'account_resolved', account_id: account.id, plan_id: plan.codigo || planId });

    const customer = await getOrCreateStripeCustomer({ account, user: req.session.user, idempotencyKey });
    logCheckout(req, 'stripe_customer_resolved', { checkout_stage: 'customer_resolved', account_id: account.id, customer_id: customer.id });
    const metadata = {
      account_id: String(account.id),
      plan_id: plan.codigo,
      price_version_id: String(plan.price_version_id),
      environment: stripeEnvironment(),
      billing_interval: plan.intervalo || planId
    };
    let subscription = await findPendingStripeSubscription(customer.id, metadata);
    if (subscription) {
      logCheckout(req, 'stripe_subscription_reused', {
        checkout_stage: 'pending_subscription_reused',
        account_id: account.id,
        customer_id: customer.id,
        subscription_id: subscription.id,
        subscription_status: subscription.status
      });
    } else {
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId, quantity: 1 }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata
      }, { idempotencyKey: stripeSubscriptionIdempotencyKey(idempotencyKey) });
    }

    const { invoice, paymentIntent, clientSecret, clientSecretSource } = await resolveSubscriptionPaymentIntent(subscription);
    logCheckout(req, 'stripe_subscription_created', {
      checkout_stage: 'payment_confirmation_required',
      account_id: account.id,
      customer_id: customer.id,
      subscription_id: subscription.id,
      invoice_id: invoice?.id || null,
      invoice_status: invoice?.status || null,
      invoice_amount_due: invoice?.amount_due ?? null,
      invoice_amount_remaining: invoice?.amount_remaining ?? null,
      invoice_payments_count: invoice?.payments?.data?.length || 0,
      subscription_status: subscription.status || null,
      payment_intent_id: paymentIntent?.id || null,
      payment_intent_status: paymentIntent?.status || null,
      has_client_secret: Boolean(clientSecret),
      client_secret_source: clientSecretSource
    });
    if (!clientSecret) {
      logCheckout(req, 'checkout_failed', { checkout_stage: 'payment_intent_validation', account_id: account.id, subscription_id: subscription.id, error_code: 'STRIPE_PAYMENT_INTENT_UNAVAILABLE' });
      return res.status(502).json({ error: { code: 'STRIPE_PAYMENT_INTENT_UNAVAILABLE', message: 'Stripe no pudo preparar el metodo de pago.' } });
    }

    await Promise.all([
      paymentIntent?.id ? stripe.paymentIntents.update(paymentIntent.id, { metadata }) : Promise.resolve(),
      invoice?.id ? stripe.invoices.update(invoice.id, { metadata }) : Promise.resolve(),
      stripe.subscriptions.update(subscription.id, { metadata: { ...metadata, checkout_id: subscription.id } })
    ]);

    const response = {
      data: {
        checkout_id: subscription.id,
        plan_id: plan.codigo,
        amount: plan.precio === null || plan.precio === undefined ? null : Math.round(Number(plan.precio) * 100),
        currency: String(plan.moneda || '').toLowerCase(),
        payment: {
          provider: 'stripe',
          payment_intent_id: paymentIntent?.id || null,
          client_secret: clientSecret,
          status: paymentIntent?.status || 'requires_payment_method'
        }
      }
    };
    logCheckout(req, 'checkout_ready', {
      checkout_stage: 'frontend_can_confirm_payment',
      account_id: account.id,
      subscription_id: subscription.id,
      payment_intent_id: paymentIntent.id,
      payment_status: paymentIntent.status,
      plan_id: plan.codigo
    });
    res.status(201).json(response);
  } catch (error) {
    logCheckout(req, 'checkout_failed', {
      checkout_stage: 'unexpected_error',
      error_code: error.code || 'CHECKOUT_UNEXPECTED_ERROR',
      error_status: error.status || 500,
      error_message: error.message
    });
    next(error);
  }
});

router.post('/account/subscription', requireAuth, async (req, res, next) => {
  try {
    const subscription = await service.createSubscriptionForUser(
      req.session.user.id,
      req.body,
      req.session.user.id,
      req.ip,
      req.session.user.proveedor_id ?? null
    );
    res.status(201).json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.get('/admin/saas/accounts/:accountId/subscription', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.read'), async (req, res, next) => {
  try { res.json(toSubscriptionResponse(await service.getForAccount(req.params.accountId))); }
  catch (error) { next(error); }
});

router.get('/admin/saas/subscriptions', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.read'), async (req, res, next) => {
  try { res.json(toSubscriptionListResponse(await service.listSubscriptions({ accountId: req.query.account_id || null, proveedorId: req.query.proveedor_id || null, status: req.query.status || null }))); }
  catch (error) { next(error); }
});

router.get('/admin/saas/users/:userId/subscriptions', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.read'), async (req, res, next) => {
  try { res.json(toSubscriptionListResponse(await service.listSubscriptions({ userId: req.params.userId }))); }
  catch (error) { next(error); }
});

router.get('/admin/saas/subscriptions/:subscriptionId', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.read'), async (req, res, next) => {
  try {
    const subscription = await service.getSubscription(req.params.subscriptionId);
    if (!subscription) return res.status(404).json({ error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Suscripcion no encontrada.' } });
    res.json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.put('/admin/saas/subscriptions/:subscriptionId', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.update'), async (req, res, next) => {
  try {
    console.info('[subscriptions][entitlements][update-request]', {
      subscription_id: req.params.subscriptionId,
      plan_id: req.body?.plan_id || null,
      has_entitlements: Object.prototype.hasOwnProperty.call(req.body || {}, 'entitlements'),
      entitlement_keys: Array.isArray(req.body?.entitlements) ? req.body.entitlements : Object.keys(req.body?.entitlements || {})
    });
    const subscription = await service.updateSubscriptionById(req.params.subscriptionId, req.body, req.session.user.id, req.ip);
    console.info('[subscriptions][entitlements][update-response]', {
      subscription_id: req.params.subscriptionId,
      plan_id: subscription.plan_id || subscription.plan?.id || null,
      entitlement_keys: Object.keys(subscription.entitlements || {}),
      entitlement_count: Object.keys(subscription.entitlements || {}).length
    });
    res.json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.post('/admin/saas/accounts/:accountId/subscription', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.create'), async (req, res, next) => {
  try {
    const subscription = await service.createSubscription(req.params.accountId, req.body, req.session.user.id, req.ip);
    res.status(201).json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.put('/admin/saas/accounts/:accountId/subscription', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.update'), async (req, res, next) => {
  try {
    const subscription = await service.updateSubscription(req.params.accountId, req.body, req.session.user.id, req.ip);
    res.json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.delete('/admin/saas/subscriptions/:subscriptionId', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.cancel'), async (req, res, next) => {
  try {
    const subscription = await service.cancelSubscription(req.params.subscriptionId, req.session.user.id, req.ip, req.body?.reason);
    res.json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.patch('/admin/saas/accounts/:accountId/entitlements/:featureKey', requireAuth, requireSaasAdmin, requirePermission('saas.entitlement.update'), async (req, res, next) => {
  try {
    const subscription = await service.updateOverride(req.params.accountId, req.params.featureKey, req.body, req.session.user.id, req.ip);
    res.json(toSubscriptionResponse(subscription));
  } catch (error) { next(error); }
});

router.get('/admin/saas/plans', requireAuth, requireSaasAdmin, requirePermission('saas.plan.read'), async (req, res, next) => {
  try {
    const plans = await service.listPlans({ estado: req.query.estado || null, codigo: req.query.codigo || null, activo: req.query.activo ?? null });
    res.json({ data: plans });
  } catch (error) { next(error); }
});

router.get('/admin/saas/plans/:planId', requireAuth, requireSaasAdmin, requirePermission('saas.plan.read'), async (req, res, next) => {
  try {
    const plan = await service.getPlan(req.params.planId);
    if (!plan) return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan no encontrado.' } });
    res.json({ data: plan });
  } catch (error) { next(error); }
});

router.get('/admin/saas/plans/:planId/prices', requireAuth, requireSaasAdmin, requirePermission('saas.plan.read'), async (req, res, next) => {
  try { res.json({ data: await service.listPlanPrices(req.params.planId, stripeEnvironment()) }); }
  catch (error) { next(error); }
});

router.get('/admin/saas/plans/:planId/entitlements', requireAuth, requireSaasAdmin, requirePermission('saas.plan.read'), async (req, res, next) => {
  try {
    const entitlements = await service.listPlanEntitlements(req.params.planId);
    console.info('[subscriptions][entitlements][plan-read]', { plan_id: req.params.planId, entitlement_count: entitlements.length, entitlement_keys: entitlements.map(item => item.feature_key) });
    res.json({ data: entitlements });
  }
  catch (error) { next(error); }
});

router.put('/admin/saas/plans/:planId/entitlements', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try {
    console.info('[subscriptions][entitlements][plan-update-request]', { plan_id: req.params.planId, payload: req.body?.entitlements || {}, entitlement_keys: Array.isArray(req.body?.entitlements) ? req.body.entitlements : Object.keys(req.body?.entitlements || {}) });
    const entitlements = await service.replacePlanEntitlements(req.params.planId, req.body?.entitlements || {});
    console.info('[subscriptions][entitlements][plan-update-response]', { plan_id: req.params.planId, entitlement_count: entitlements.length, entitlement_keys: entitlements.map(item => item.feature_key) });
    res.json({ data: entitlements });
  }
  catch (error) { next(error); }
});

router.patch('/admin/saas/plans/:planId/entitlements/:featureKey', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try { res.json({ data: await service.updatePlanEntitlement(req.params.planId, req.params.featureKey, req.body) }); }
  catch (error) { next(error); }
});

router.delete('/admin/saas/plans/:planId/entitlements/:featureKey', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try {
    const result = await service.deletePlanEntitlement(req.params.planId, req.params.featureKey);
    if (!result.deleted) return res.status(404).json({ error: { code: 'ENTITLEMENT_NOT_FOUND', message: 'Entitlement no encontrado.' } });
    res.json({ data: { deleted: true, plan_id: req.params.planId, feature_key: req.params.featureKey, affected_account_ids: result.accountIds } });
  } catch (error) { next(error); }
});

router.get('/admin/saas/subscriptions/:subscriptionId/entitlements', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.read'), async (req, res, next) => {
  try { res.json({ data: await service.listSubscriptionEntitlements(req.params.subscriptionId) }); }
  catch (error) { next(error); }
});

router.patch('/admin/saas/subscriptions/:subscriptionId/entitlements/:featureKey', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.update'), async (req, res, next) => {
  try { res.json({ data: await service.updateSubscriptionEntitlement(req.params.subscriptionId, req.params.featureKey, req.body) }); }
  catch (error) { next(error); }
});

router.delete('/admin/saas/subscriptions/:subscriptionId/entitlements/:featureKey', requireAuth, requireSaasAdmin, requirePermission('saas.subscription.update'), async (req, res, next) => {
  try {
    const deleted = await service.deleteSubscriptionEntitlement(req.params.subscriptionId, req.params.featureKey);
    if (!deleted) return res.status(404).json({ error: { code: 'ENTITLEMENT_NOT_FOUND', message: 'Entitlement no encontrado.' } });
    res.json({ data: { deleted: true, subscription_id: req.params.subscriptionId, feature_key: req.params.featureKey } });
  } catch (error) { next(error); }
});

router.post('/admin/saas/plans/:planId/prices', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try {
    const price = await service.createPlanPrice(req.params.planId, { ...req.body, environment: stripeEnvironment() }, req.session.user.id, req.ip, stripe);
    res.status(201).json({ data: price });
  } catch (error) { next(error); }
});

router.post('/admin/saas/price-versions/:priceVersionId/activate', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try { res.json({ data: await service.activatePlanPrice(req.params.priceVersionId, req.session.user.id, req.ip) }); }
  catch (error) { next(error); }
});

router.post('/admin/saas/price-versions/:priceVersionId/archive', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try { res.json({ data: await service.archivePlanPrice(req.params.priceVersionId, req.session.user.id, req.ip) }); }
  catch (error) { next(error); }
});

router.post('/admin/saas/plans', requireAuth, requireSaasAdmin, requirePermission('saas.plan.create'), async (req, res, next) => {
  try {
    console.info('[subscriptions][entitlements][plan-create-request]', { plan_code: req.body?.codigo || null, has_entitlements: Object.prototype.hasOwnProperty.call(req.body || {}, 'entitlements'), entitlement_keys: Array.isArray(req.body?.entitlements) ? req.body.entitlements : Object.keys(req.body?.entitlements || {}) });
    const plan = await service.createPlan(req.body, req.session.user.id, req.ip);
    console.info('[subscriptions][entitlements][plan-create-response]', { plan_id: plan?.id || null, plan_code: plan?.codigo || null });
    res.status(201).json({ data: plan });
  } catch (error) { next(error); }
});

router.put('/admin/saas/plans/:planId', requireAuth, requireSaasAdmin, requirePermission('saas.plan.update'), async (req, res, next) => {
  try {
    console.info('[subscriptions][entitlements][plan-edit-request]', { plan_id: req.params.planId, has_entitlements: Object.prototype.hasOwnProperty.call(req.body || {}, 'entitlements'), entitlement_keys: Array.isArray(req.body?.entitlements) ? req.body.entitlements : Object.keys(req.body?.entitlements || {}) });
    const plan = await service.updatePlan(req.params.planId, req.body, req.session.user.id, req.ip);
    console.info('[subscriptions][entitlements][plan-edit-response]', { plan_id: plan?.id || req.params.planId, plan_code: plan?.codigo || null });
    if (!plan) return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan no encontrado.' } });
    res.json({ data: plan });
  } catch (error) { next(error); }
});

router.delete('/admin/saas/plans/:planId', requireAuth, requireSaasAdmin, requirePermission('saas.plan.delete'), async (req, res, next) => {
  try {
    const plan = await service.deletePlan(req.params.planId, req.session.user.id, req.ip);
    if (!plan) return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan no encontrado.' } });
    res.json({ data: plan });
  } catch (error) { next(error); }
});

router.post('/admin/saas/users/:userId/account', requireAuth, requireSaasAdmin, requirePermission('saas.account.create'), async (req, res, next) => {
  try {
    const account = await service.getOrCreateAccountForUser(
      req.params.userId,
      req.body?.account_name || null,
      req.body?.proveedor_id || null,
      req.session.user.id,
      req.ip
    );
    if (!account) return res.status(404).json({ error: { code: 'ACCOUNT_NOT_CREATED', message: 'No fue posible crear o resolver la cuenta.' } });
    res.status(201).json({ data: account });
  } catch (error) { next(error); }
});

export default router;