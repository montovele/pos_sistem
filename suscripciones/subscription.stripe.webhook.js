import Stripe from 'stripe';
import poolCT from '../ct/config/db_ct.js';
import { getRedis } from '../config/redisClient.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

function toDateTime(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19) : null;
}

function resolveCurrentPeriodEnd(subscription, invoice = null) {
  return subscription.current_period_end
    || subscription.items?.data?.[0]?.current_period_end
    || invoice?.period_end
    || null;
}

function toStatus(status) {
  return {
    trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled',
    unpaid: 'suspended', incomplete: 'suspended', incomplete_expired: 'expired'
  }[status] || 'suspended';
}

async function syncSubscription(subscription, eventId = null, eventType = 'stripe.subscription', invoice = null) {
  const metadataAccountId = Number(subscription.metadata?.account_id);
  const status = toStatus(subscription.status);
  const currentPeriodEnd = toDateTime(resolveCurrentPeriodEnd(subscription, invoice));
  const canceledAt = toDateTime(subscription.canceled_at);
  const stripePriceId = subscription.items?.data?.[0]?.price?.id || null;
  const connection = await poolCT.getConnection();
  let accountId = null;
  try {
    await connection.beginTransaction();
    if (eventId) {
      const [eventResult] = await connection.execute('INSERT IGNORE INTO saas_stripe_webhook_events (event_id, event_type) VALUES (?, ?)', [eventId, eventType]);
      if (!eventResult.affectedRows) { await connection.commit(); return; }
    }
    accountId = Number.isInteger(metadataAccountId) && metadataAccountId > 0 ? metadataAccountId : null;
    if (!accountId) {
      const [accounts] = await connection.execute('SELECT account_id FROM saas_subscriptions WHERE external_subscription_id = ? OR (external_customer_id IS NOT NULL AND external_customer_id = ?) ORDER BY id DESC LIMIT 1', [subscription.id, subscription.customer || '']);
      accountId = accounts[0]?.account_id || null;
    }
    if (!accountId) { await connection.commit(); return; }
    let priceVersionId = Number(subscription.metadata?.price_version_id) || null;
    let plans = [];
    if (priceVersionId) {
      const [versionRows] = await connection.execute('SELECT id, plan_id FROM saas_plan_prices WHERE id = ? LIMIT 1', [priceVersionId]);
      if (versionRows[0]) plans = [{ id: versionRows[0].plan_id }];
    }
    if (!plans.length && stripePriceId) {
      const [versionRows] = await connection.execute('SELECT id, plan_id FROM saas_plan_prices WHERE stripe_price_id = ? LIMIT 1', [stripePriceId]);
      if (versionRows[0]) { priceVersionId = versionRows[0].id; plans = [{ id: versionRows[0].plan_id }]; }
    }
    const planCode = subscription.metadata?.plan_id || 'legacy';
    if (!plans.length) [plans] = await connection.execute('SELECT id FROM saas_plans WHERE codigo = ? LIMIT 1', [planCode]);
    if (!plans.length) [plans] = await connection.execute("SELECT id FROM saas_plans WHERE codigo = 'legacy' LIMIT 1");
    if (!plans[0]) throw Object.assign(new Error('Plan SaaS no configurado'), { code: 'SAAS_PLAN_NOT_FOUND' });
    const [existing] = await connection.execute('SELECT id FROM saas_subscriptions WHERE external_subscription_id = ? LIMIT 1 FOR UPDATE', [subscription.id]);
    let subscriptionRowId = existing[0]?.id || null;
    if (existing[0]) {
      await connection.execute('UPDATE saas_subscriptions SET plan_id = ?, price_version_id = ?, status = ?, external_customer_id = ?, current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = ?, canceled_at = ? WHERE id = ?', [plans[0].id, priceVersionId, status, subscription.customer || null, currentPeriodEnd, subscription.cancel_at_period_end ? 1 : 0, canceledAt, existing[0].id]);
    } else {
      const [insertResult] = await connection.execute('INSERT INTO saas_subscriptions (account_id, plan_id, price_version_id, status, external_customer_id, external_subscription_id, started_at, current_period_end, cancel_at_period_end, canceled_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)', [accountId, plans[0].id, priceVersionId, status, subscription.customer || null, subscription.id, toDateTime(subscription.start_date), currentPeriodEnd, subscription.cancel_at_period_end ? 1 : 0, canceledAt]);
      subscriptionRowId = insertResult.insertId;
    }
    await connection.execute('INSERT INTO saas_subscription_entitlements (subscription_id, feature_key, enabled, limits_json) SELECT ?, pe.feature_key, pe.enabled, pe.limits_json FROM saas_plan_entitlements pe WHERE pe.plan_id = ? ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), limits_json = VALUES(limits_json)', [subscriptionRowId, plans[0].id]);
    await connection.execute('INSERT INTO saas_subscription_audit (account_id, action, after_json) VALUES (?, ?, ?)', [accountId, `stripe.subscription.${status}`, JSON.stringify({ stripe_subscription_id: subscription.id, status, current_period_end: currentPeriodEnd, cancel_at_period_end: Boolean(subscription.cancel_at_period_end) })]);
    await connection.commit();
    console.info('[subscriptions][webhook-sync]', {
      event_type: eventType,
      account_id: accountId,
      subscription_id: subscription.id,
      subscription_status: subscription.status,
      stored_status: status,
      current_period_end: currentPeriodEnd,
      source: subscription.current_period_end ? 'subscription' : subscription.items?.data?.[0]?.current_period_end ? 'subscription_item' : invoice?.period_end ? 'invoice' : null
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }

  try { await (await getRedis()).del(`saas:entitlements:account:${accountId}:v1`); } catch (error) { console.warn('[subscriptions] Stripe cache invalidation failed:', error.message); }
}

export async function processSubscriptionStripeEvent(event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode === 'subscription' && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await syncSubscription(subscription, event.id, event.type);
    }
  } else if (['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'].includes(event.type)) {
    const invoice = event.data.object;
    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      await syncSubscription(subscription, event.id, event.type, invoice);
    }
  } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    await syncSubscription(event.data.object, event.id, event.type);
  }
}

export async function handleSubscriptionStripeWebhook(req, res) {
  if (!stripe || !webhookSecret) return res.status(503).json({ error: 'Stripe subscriptions webhook is not configured' });
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret); }
  catch (error) { return res.status(400).send(`Webhook Error: ${error.message}`); }

  try {
    await processSubscriptionStripeEvent(event);
    return res.json({ received: true });
  } catch (error) {
    console.error('[subscriptions] Stripe webhook failed:', error.message);
    return res.status(500).json({ error: 'Subscription webhook failed' });
  }
}