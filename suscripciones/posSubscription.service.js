import { createHash } from 'node:crypto';

const PLAN_CODE = 'monthly';
const PLAN_NAME = 'Suscripción mensual';
const DEFAULT_AMOUNT = 599;
const CURRENCY = 'MXN';
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
  'suspended',
  'expired'
]);

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function periodEnd(subscription) {
  return subscription.current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end
    ?? null;
}

function invoiceSubscriptionId(invoice) {
  const subscription = invoice.subscription
    || invoice.parent?.subscription_details?.subscription
    || null;
  return typeof subscription === 'string' ? subscription : subscription?.id || null;
}

function stripeObjectId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

function subscriptionEndDate(value) {
  const isCalendarDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isCalendarDate ? new Date(`${value}T23:59:59.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('La fecha de vencimiento no es válida.'), {
      status: 422,
      code: 'INVALID_CURRENT_PERIOD_END'
    });
  }
  if (isCalendarDate && date.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error('La fecha de vencimiento no es válida.'), {
      status: 422,
      code: 'INVALID_CURRENT_PERIOD_END'
    });
  }
  if (date.getTime() <= Date.now()) {
    throw Object.assign(new Error('La fecha de vencimiento debe ser posterior a hoy.'), {
      status: 422,
      code: 'INVALID_CURRENT_PERIOD_END'
    });
  }
  return date;
}

function subscriptionStartDate(value) {
  const isCalendarDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isCalendarDate ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (
    Number.isNaN(date.getTime())
    || (isCalendarDate && date.toISOString().slice(0, 10) !== value)
  ) {
    throw Object.assign(new Error('La fecha de contratación no es válida.'), {
      status: 422,
      code: 'INVALID_CURRENT_PERIOD_START'
    });
  }
  return date;
}

function isAccessAllowed(subscription) {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;
  const start = toIsoDate(subscription.current_period_start);
  if (start && new Date(start).getTime() > Date.now()) return false;
  const end = toIsoDate(subscription.current_period_end);
  return !end || new Date(end).getTime() > Date.now();
}

function stripeStatus(status) {
  const supported = new Set([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused'
  ]);
  return supported.has(status) ? status : 'suspended';
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 || Math.round(amount * 100) !== amount * 100) {
    throw Object.assign(new Error('El precio debe ser un monto válido entre 1 y 1,000,000 MXN.'), {
      status: 422,
      code: 'INVALID_SUBSCRIPTION_PRICE'
    });
  }
  return amount;
}

export function createPosSubscriptionService({ pool, stripe = null, guestSignupService = null } = {}) {
  if (!pool?.execute || !pool?.getConnection) throw new TypeError('A MySQL pool is required');

  async function getPlan() {
    const [rows] = await pool.execute(
      `SELECT code, name, description, amount, currency, interval_unit,
              interval_count, stripe_price_id, stripe_product_id, updated_at,
              is_active
       FROM pos_subscription_plans
       WHERE code = ?
       LIMIT 1`,
      [PLAN_CODE]
    );
    return rows[0] || null;
  }

  async function getSubscription(organizationId) {
    const [rows] = await pool.execute(
      `SELECT s.id, s.organization_id, s.plan_code, s.status,
              price_history.amount AS contracted_amount,
              price_history.currency AS contracted_currency,
              price_history.interval_unit AS contracted_interval_unit,
              price_history.interval_count AS contracted_interval_count,
              DATE_FORMAT(current_period_start, '%Y-%m-%dT%H:%i:%sZ') AS current_period_start,
              DATE_FORMAT(current_period_end, '%Y-%m-%dT%H:%i:%sZ') AS current_period_end,
              s.cancel_at_period_end,
              DATE_FORMAT(s.canceled_at, '%Y-%m-%dT%H:%i:%sZ') AS canceled_at
       FROM pos_subscriptions s
       LEFT JOIN pos_subscription_price_history price_history
         ON price_history.stripe_price_id = s.stripe_price_id
       WHERE s.organization_id = ?
       ORDER BY s.id DESC
       LIMIT 1`,
      [organizationId]
    );
    return rows[0] || null;
  }

  async function getStatus(organizationId) {
    const [plan, subscription] = await Promise.all([
      getPlan(),
      getSubscription(organizationId)
    ]);
    const currentPeriodEnd = toIsoDate(subscription?.current_period_end);
    const currentPeriodStart = toIsoDate(subscription?.current_period_start);
    const normalizedSubscription = subscription
      ? {
          status: subscription.status,
          amount: subscription.contracted_amount === null || subscription.contracted_amount === undefined
            ? null
            : Number(subscription.contracted_amount),
          currency: subscription.contracted_currency || null,
          interval_unit: subscription.contracted_interval_unit || null,
          interval_count: subscription.contracted_interval_count
            ? Number(subscription.contracted_interval_count)
            : null,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          canceled_at: toIsoDate(subscription.canceled_at)
        }
      : null;
    return {
      plan: plan ? {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        amount: Number(plan.amount),
        currency: plan.currency,
        interval_unit: plan.interval_unit,
        interval_count: Number(plan.interval_count),
        is_active: Boolean(plan.is_active),
        has_stripe_price: Boolean(plan.stripe_price_id),
        checkout_available: Boolean(plan.stripe_price_id && plan.is_active)
      } : null,
      subscription: normalizedSubscription,
      status: normalizedSubscription?.status || 'inactive',
      access_allowed: isAccessAllowed(normalizedSubscription)
    };
  }

  async function savePaidInvoice(invoice) {
    if (invoice?.status !== 'paid' || !invoice.id) return false;
    const stripeCustomerId = stripeObjectId(invoice.customer);
    if (!stripeCustomerId) return false;
    const [customerRows] = await pool.execute(
      'SELECT organization_id FROM pos_subscription_customers WHERE stripe_customer_id = ? LIMIT 1',
      [stripeCustomerId]
    );
    const organizationId = Number(customerRows[0]?.organization_id);
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) return false;

    const paidAt = invoice.status_transitions?.paid_at
      ? new Date(Number(invoice.status_transitions.paid_at) * 1000)
      : invoice.created
        ? new Date(Number(invoice.created) * 1000)
        : new Date();
    const paidAtSql = Number.isNaN(paidAt.getTime())
      ? null
      : paidAt.toISOString().replace('T', ' ').slice(0, 19);
    await pool.execute(
      `INSERT INTO pos_subscription_payments
         (organization_id, stripe_invoice_id, stripe_subscription_id, stripe_payment_intent_id,
          invoice_number, amount_paid_minor, currency, status, paid_at, hosted_invoice_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)
       ON DUPLICATE KEY UPDATE
         stripe_subscription_id = VALUES(stripe_subscription_id),
         stripe_payment_intent_id = VALUES(stripe_payment_intent_id),
         invoice_number = VALUES(invoice_number),
         amount_paid_minor = VALUES(amount_paid_minor),
         currency = VALUES(currency),
         status = VALUES(status),
         paid_at = VALUES(paid_at),
         hosted_invoice_url = VALUES(hosted_invoice_url)`,
      [
        organizationId,
        invoice.id,
        invoiceSubscriptionId(invoice),
        stripeObjectId(invoice.payment_intent),
        invoice.number || null,
        Math.max(0, Number(invoice.amount_paid) || 0),
        String(invoice.currency || CURRENCY).toUpperCase(),
        paidAtSql,
        invoice.hosted_invoice_url || null
      ]
    );
    return true;
  }

  async function saveLatestPaidInvoice(subscription) {
    const latestInvoice = subscription?.latest_invoice;
    if (!latestInvoice) return false;
    const invoice = typeof latestInvoice === 'string'
      ? await stripe.invoices.retrieve(latestInvoice)
      : latestInvoice;
    return savePaidInvoice(invoice);
  }

  async function listOrganizationPayments(organizationId) {
    const [rows] = await pool.execute(
      `SELECT stripe_invoice_id, stripe_subscription_id, invoice_number,
              amount_paid_minor, currency, status,
              DATE_FORMAT(paid_at, '%Y-%m-%dT%H:%i:%sZ') AS paid_at,
              hosted_invoice_url
       FROM pos_subscription_payments
       WHERE organization_id = ?
       ORDER BY paid_at DESC, id DESC
       LIMIT 100`,
      [organizationId]
    );
    return rows.map(row => ({
      invoice_id: row.stripe_invoice_id,
      subscription_id: row.stripe_subscription_id,
      invoice_number: row.invoice_number,
      amount: Number(row.amount_paid_minor) / 100,
      currency: row.currency,
      status: row.status,
      paid_at: toIsoDate(row.paid_at),
      invoice_url: row.hosted_invoice_url
    }));
  }

  async function updateMonthlyPlan(values, actorUserId, ipAddress) {
    const currentPlan = await getPlan();
    if (!currentPlan) throw new Error('El plan mensual no está inicializado.');
    const nextAmount = values.amount === undefined ? Number(currentPlan.amount) : normalizeAmount(values.amount);
    const nextName = values.name === undefined ? currentPlan.name : String(values.name).trim();
    const nextDescription = values.description === undefined ? currentPlan.description : String(values.description || '').trim();
    const nextIsActive = values.is_active === undefined ? Boolean(currentPlan.is_active) : values.is_active === true;
    if (!nextName || nextName.length > 120 || nextDescription.length > 255) {
      throw Object.assign(new Error('El nombre (1-120 caracteres) y descripción (máximo 255) del plan son inválidos.'), {
        status: 422,
        code: 'INVALID_PLAN'
      });
    }

    const priceChanged = Number(currentPlan.amount) !== nextAmount
      || (!currentPlan.stripe_price_id && values.provision_price === true);
    const productChanged = nextName !== currentPlan.name || nextDescription !== (currentPlan.description || '');
    if (values.is_active === true && !currentPlan.is_active && !currentPlan.stripe_price_id && !priceChanged) {
      throw Object.assign(new Error('Configura el precio recurrente de Stripe antes de activar el plan.'), {
        status: 409,
        code: 'PLAN_NOT_CONFIGURED'
      });
    }
    if (priceChanged && !stripe) {
      throw Object.assign(new Error('Stripe no está configurado para actualizar el precio.'), {
        status: 503,
        code: 'STRIPE_UNAVAILABLE'
      });
    }

    let productId = currentPlan.stripe_product_id;
    if (stripe && !productId && (priceChanged || productChanged)) {
      const product = await stripe.products.create({
        name: nextName || PLAN_NAME,
        description: nextDescription || 'Acceso mensual al sistema POS',
        metadata: { plan_code: PLAN_CODE }
      });
      productId = product.id;
    }

    if (stripe && productId && productChanged) {
      await stripe.products.update(productId, {
        name: nextName,
        description: nextDescription || ''
      });
    }

    const price = priceChanged
      ? await stripe.prices.create({
        product: productId,
        unit_amount: Math.round(nextAmount * 100),
        currency: CURRENCY.toLowerCase(),
        recurring: { interval: 'month', interval_count: 1 },
        metadata: { plan_code: PLAN_CODE }
      })
      : null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lockedPlans] = await connection.execute(
        'SELECT stripe_price_id FROM pos_subscription_plans WHERE code = ? FOR UPDATE',
        [PLAN_CODE]
      );
      const previousPriceId = lockedPlans[0]?.stripe_price_id || null;
      if (previousPriceId && price) {
        await connection.execute(
          `UPDATE pos_subscription_price_history
           SET status = 'archived'
           WHERE stripe_price_id = ?`,
          [previousPriceId]
        );
      }
      if (price) {
        await connection.execute(
          `INSERT INTO pos_subscription_price_history
             (plan_code, amount, currency, interval_unit, interval_count, stripe_price_id, status, created_by)
           VALUES (?, ?, ?, 'month', 1, ?, 'active', ?)`,
          [PLAN_CODE, nextAmount, CURRENCY, price.id, actorUserId || null]
        );
      }
      await connection.execute(
        `UPDATE pos_subscription_plans
         SET name = ?, description = ?, amount = ?, currency = ?, interval_unit = 'month', interval_count = 1,
             stripe_product_id = ?, stripe_price_id = COALESCE(?, stripe_price_id),
             is_active = ?, updated_by = ?
         WHERE code = ?`,
        [
          nextName,
          nextDescription || null,
          nextAmount,
          CURRENCY,
          productId,
          price?.id || null,
          nextIsActive ? 1 : 0,
          actorUserId || null,
          PLAN_CODE
        ]
      );
      await connection.execute(
        `INSERT INTO pos_subscription_audit
           (organization_id, actor_user_id, action, details_json, ip_address)
         VALUES (NULL, ?, 'plan.updated', ?, ?)`,
        [actorUserId || null, JSON.stringify({
          name: nextName,
          description: nextDescription,
          amount: nextAmount,
          currency: CURRENCY,
          stripe_price_id: price?.id || currentPlan.stripe_price_id,
          is_active: nextIsActive
        }), ipAddress || null]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return getPlan();
  }

  async function createCheckout(organizationId, user, idempotencyKey, frontendUrl) {
    if (!stripe) {
      throw Object.assign(new Error('Stripe no está configurado para iniciar el pago.'), {
        status: 503,
        code: 'STRIPE_UNAVAILABLE'
      });
    }
    const plan = await getPlan();
    if (!plan?.stripe_price_id) {
      throw Object.assign(new Error('El precio mensual aún no está configurado por un administrador.'), {
        status: 409,
        code: 'PLAN_NOT_CONFIGURED'
      });
    }
    if (!plan.is_active) {
      throw Object.assign(new Error('El plan está desactivado; contacta al superadministrador.'), {
        status: 409,
        code: 'PLAN_INACTIVE'
      });
    }
    const status = await getStatus(organizationId);
    if (status.access_allowed) {
      throw Object.assign(new Error('La organización ya tiene una suscripción activa.'), {
        status: 409,
        code: 'SUBSCRIPTION_ALREADY_ACTIVE'
      });
    }
    let email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      const [organizationRows] = await pool.execute(
        'SELECT correo FROM organizaciones WHERE id = ? LIMIT 1',
        [organizationId]
      );
      email = String(organizationRows[0]?.correo || '').trim().toLowerCase();
    }
    if (!email) {
      throw Object.assign(new Error('Agrega un correo de contacto a la organización para iniciar el pago.'), {
        status: 422,
        code: 'CUSTOMER_EMAIL_REQUIRED'
      });
    }

    const [customerRows] = await pool.execute(
      'SELECT stripe_customer_id FROM pos_subscription_customers WHERE organization_id = ? LIMIT 1',
      [organizationId]
    );
    let customerId = customerRows[0]?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: user.organizationName || user.nombreEmpleado || user.username || undefined,
        metadata: { organization_id: String(organizationId) }
      }, { idempotencyKey: `pos-subscription-customer-${organizationId}` });
      customerId = customer.id;
      await pool.execute(
        `INSERT INTO pos_subscription_customers (organization_id, stripe_customer_id, email)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id), email = VALUES(email)`,
        [organizationId, customerId, email]
      );
    }

    const [openSessions] = await Promise.all([
      stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 10 })
    ]);
    const reusableSession = openSessions.data.find(session => (
      session.mode === 'subscription'
      && session.metadata?.organization_id === String(organizationId)
      && session.metadata?.plan_code === PLAN_CODE
      && session.metadata?.price_id === plan.stripe_price_id
    ));
    if (reusableSession?.url) return { checkout_url: reusableSession.url };

    const existingSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    const pendingSubscription = existingSubscriptions.data.find(item => (
      ['active', 'trialing', 'past_due', 'incomplete', 'paused'].includes(item.status)
    ));
    if (pendingSubscription) {
      throw Object.assign(new Error('Ya existe un pago o una suscripción en curso para esta organización.'), {
        status: 409,
        code: 'SUBSCRIPTION_CHECKOUT_PENDING'
      });
    }

    const baseUrl = frontendUrl.replace(/\/+$/, '');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: String(organizationId),
      metadata: { organization_id: String(organizationId), plan_code: PLAN_CODE, price_id: plan.stripe_price_id },
      subscription_data: { metadata: { organization_id: String(organizationId), plan_code: PLAN_CODE, price_id: plan.stripe_price_id } },
      success_url: `${baseUrl}/suscripcion?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/suscripcion?checkout=cancel`
    }, { idempotencyKey });

    if (!checkout.url) throw new Error('Stripe no devolvió una URL de pago.');
    return { checkout_url: checkout.url };
  }

  async function reconcileCheckout(organizationId) {
    if (!stripe) {
      throw Object.assign(new Error('Stripe no está configurado para verificar el pago.'), {
        status: 503,
        code: 'STRIPE_UNAVAILABLE'
      });
    }

    const targetOrganizationId = Number(organizationId);
    if (!Number.isSafeInteger(targetOrganizationId) || targetOrganizationId < 1) {
      throw Object.assign(new Error('Organización no válida.'), {
        status: 422,
        code: 'INVALID_ORGANIZATION'
      });
    }

    const [customerRows] = await pool.execute(
      'SELECT stripe_customer_id FROM pos_subscription_customers WHERE organization_id = ? LIMIT 1',
      [targetOrganizationId]
    );
    const customerId = customerRows[0]?.stripe_customer_id;
    if (!customerId) {
      return { payment_confirmed: false, ...(await getStatus(targetOrganizationId)) };
    }

    const [sessions, invoices] = await Promise.all([
      stripe.checkout.sessions.list({ customer: customerId, status: 'complete', limit: 100 }),
      stripe.invoices.list({ customer: customerId, limit: 100 })
    ]);
    let paymentConfirmed = false;

    const completedSession = sessions.data.find(session => (
      session.mode === 'subscription'
      && ['paid', 'no_payment_required'].includes(session.payment_status)
      && session.customer === customerId
      && String(session.client_reference_id || session.metadata?.organization_id) === String(targetOrganizationId)
      && session.metadata?.organization_id === String(targetOrganizationId)
      && session.metadata?.plan_code === PLAN_CODE
      && session.subscription
    ));

    if (completedSession) {
      const subscriptionId = typeof completedSession.subscription === 'string'
        ? completedSession.subscription
        : completedSession.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionCustomer = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;
      const subscriptionPriceId = subscription.items?.data?.[0]?.price?.id;
      const subscriptionOrganizationId = String(subscription.metadata?.organization_id || '');
      const subscriptionPlanCode = subscription.metadata?.plan_code;

      if (
        subscriptionCustomer === customerId
        && subscriptionOrganizationId === String(targetOrganizationId)
        && subscriptionPlanCode === PLAN_CODE
        && subscriptionPriceId === completedSession.metadata?.price_id
        && ['active', 'trialing'].includes(subscription.status)
      ) {
        await syncStripeSubscription(subscription);
        paymentConfirmed = true;
        for (const invoice of invoices.data) {
          if (invoiceSubscriptionId(invoice) === subscription.id) {
            await savePaidInvoice(invoice);
          }
        }
      }
    }

    const status = await getStatus(targetOrganizationId);
    return {
      payment_confirmed: paymentConfirmed,
      ...status
    };
  }

  async function reconcileGuestCheckout(sessionId, { resendEmail = false, email = '' } = {}) {
    if (!stripe) {
      throw Object.assign(new Error('Stripe no está configurado para verificar el pago.'), {
        status: 503,
        code: 'STRIPE_UNAVAILABLE'
      });
    }

    const checkoutId = String(sessionId || '').trim();
    if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(checkoutId)) {
      throw Object.assign(new Error('La referencia de pago no es válida.'), {
        status: 400,
        code: 'INVALID_CHECKOUT_SESSION'
      });
    }

    const session = await stripe.checkout.sessions.retrieve(checkoutId);
    if (
      session.mode !== 'subscription'
      || session.status !== 'complete'
      || !session.metadata?.pending_signup_id
      || session.metadata?.plan_code !== PLAN_CODE
      || !['paid', 'no_payment_required'].includes(session.payment_status)
      || !session.subscription
    ) {
      return { payment_confirmed: false, status: 'processing' };
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const sessionCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionCustomerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    const subscriptionPriceIds = (subscription.items?.data || [])
      .map((item) => typeof item.price === 'string' ? item.price : item.price?.id)
      .filter(Boolean);
    const expectedPriceId = session.metadata.price_id || subscription.metadata?.price_id;
    if (
      subscriptionCustomerId !== sessionCustomerId
      || subscription.metadata?.pending_signup_id !== session.metadata.pending_signup_id
      || subscription.metadata?.plan_code !== PLAN_CODE
      || (expectedPriceId && !subscriptionPriceIds.includes(expectedPriceId))
      || (session.metadata.price_id
        && subscription.metadata?.price_id !== session.metadata.price_id)
      || subscriptionPriceIds.length === 0
      || !ACTIVE_STATUSES.has(subscription.status)
    ) {
      return { payment_confirmed: false, status: 'processing' };
    }

    const activation = await guestSignupService?.provisionPaidCheckout(session, { resendEmail, email });
    await syncStripeSubscription(subscription);
    await guestSignupService?.sendActivationEmail(activation);
    return {
      payment_confirmed: true,
      status: 'account_ready',
      email_sent: Boolean(activation)
    };
  }

  async function cancelAtPeriodEnd(organizationId) {
    if (!stripe) {
      throw Object.assign(new Error('Stripe no está configurado para administrar suscripciones.'), {
        status: 503,
        code: 'STRIPE_UNAVAILABLE'
      });
    }
    const subscription = await getSubscription(organizationId);
    if (!subscription?.stripe_subscription_id || !isAccessAllowed(subscription)) {
      throw Object.assign(new Error('No existe una suscripción activa para cancelar.'), {
        status: 404,
        code: 'SUBSCRIPTION_NOT_FOUND'
      });
    }
    const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true
    });
    await pool.execute(
      'UPDATE pos_subscriptions SET cancel_at_period_end = 1 WHERE stripe_subscription_id = ?',
      [subscription.stripe_subscription_id]
    );
    await pool.execute(
      `INSERT INTO pos_subscription_audit
         (organization_id, action, details_json)
       VALUES (?, 'subscription.cancel_at_period_end', ?)`,
      [organizationId, JSON.stringify({ stripe_subscription_id: subscription.stripe_subscription_id })]
    );
    return { cancel_at_period_end: Boolean(updated.cancel_at_period_end) };
  }

  async function listOrganizationSubscriptions() {
    const [rows] = await pool.execute(
      `SELECT o.id AS organization_id, o.nombre_org AS organization_name,
              latest.id AS subscription_id, latest.status,
              DATE_FORMAT(COALESCE(latest.current_period_start, latest.created_at), '%Y-%m-%dT%H:%i:%sZ') AS current_period_start,
              DATE_FORMAT(latest.current_period_end, '%Y-%m-%dT%H:%i:%sZ') AS current_period_end,
              latest.cancel_at_period_end, latest.canceled_at,
              CASE WHEN latest.stripe_subscription_id IS NULL THEN 0 ELSE 1 END AS stripe_managed
       FROM organizaciones o
       LEFT JOIN (
         SELECT s.*
         FROM pos_subscriptions s
         INNER JOIN (
           SELECT organization_id, MAX(id) AS latest_id
           FROM pos_subscriptions
           GROUP BY organization_id
         ) selected ON selected.latest_id = s.id
       ) latest ON latest.organization_id = o.id
       ORDER BY o.id ASC`
    );
    return rows.map(row => ({
      organization_id: Number(row.organization_id),
      organization_name: row.organization_name,
      subscription_id: row.subscription_id ? Number(row.subscription_id) : null,
      status: row.status || 'inactive',
      current_period_start: toIsoDate(row.current_period_start),
      current_period_end: toIsoDate(row.current_period_end),
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      stripe_managed: Number(row.stripe_managed) === 1,
      access_allowed: isAccessAllowed(row.status ? {
        status: row.status,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end
      } : null)
    }));
  }

  async function setOrganizationSubscription(organizationId, values, actorUserId, ipAddress) {
    const targetOrganizationId = Number(organizationId);
    if (!Number.isSafeInteger(targetOrganizationId) || targetOrganizationId < 1) {
      throw Object.assign(new Error('Organización no válida.'), { status: 422, code: 'INVALID_ORGANIZATION' });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [organizations] = await connection.execute(
        'SELECT id, nombre_org FROM organizaciones WHERE id = ? LIMIT 1 FOR UPDATE',
        [targetOrganizationId]
      );
      if (!organizations[0]) {
        throw Object.assign(new Error('Organización no encontrada.'), { status: 404, code: 'ORGANIZATION_NOT_FOUND' });
      }
      const [rows] = await connection.execute(
        `SELECT id, stripe_subscription_id, status, current_period_start, current_period_end FROM pos_subscriptions
         WHERE organization_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [targetOrganizationId]
      );
      const current = rows[0] || null;
      const action = values.action;
      if (action === 'activate' || action === 'set_expiration' || action === 'set_period') {
        const changesPeriod = action === 'set_period';
        if (changesPeriod && (!values.current_period_start || !values.current_period_end)) {
          throw Object.assign(new Error('Indica las fechas de contratación y vencimiento de la membresía manual.'), {
            status: 422,
            code: 'INVALID_SUBSCRIPTION_PERIOD'
          });
        }
        if (action === 'set_expiration' && !values.current_period_end) {
          throw Object.assign(new Error('Indica la fecha de vencimiento de la membresía manual.'), {
            status: 422,
            code: 'INVALID_CURRENT_PERIOD_END'
          });
        }
        if (action !== 'activate' && current?.stripe_subscription_id) {
          throw Object.assign(new Error('La vigencia de una suscripción Stripe se administra con su ciclo de cobro; solo se puede asignar fecha a una membresía manual.'), {
            status: 409,
            code: 'STRIPE_EXPIRATION_MANAGED'
          });
        }
        if (current?.stripe_subscription_id && !['canceled', 'expired', 'incomplete_expired'].includes(current.status)) {
          throw Object.assign(new Error('Cancela primero la suscripción de Stripe antes de activar un periodo manual.'), {
            status: 409,
            code: 'STRIPE_SUBSCRIPTION_MUST_BE_CANCELED'
          });
        }
        const startDate = values.current_period_start
          ? subscriptionStartDate(values.current_period_start)
          : current?.current_period_start
            ? subscriptionStartDate(current.current_period_start)
            : new Date();
        const endDate = values.current_period_end
          ? subscriptionEndDate(values.current_period_end)
          : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (endDate.getTime() <= startDate.getTime()) {
          throw Object.assign(new Error('El vencimiento debe ser posterior a la fecha de contratación.'), {
            status: 422,
            code: 'INVALID_SUBSCRIPTION_PERIOD'
          });
        }
        const startSql = startDate.toISOString().replace('T', ' ').slice(0, 19);
        const endSql = endDate.toISOString().replace('T', ' ').slice(0, 19);
        if (action !== 'activate' && current) {
          await connection.execute(
            `UPDATE pos_subscriptions
             SET status = 'active', current_period_end = ?, current_period_start = ?,
                 cancel_at_period_end = 0, canceled_at = NULL
             WHERE id = ?`,
            [endSql, startSql, current.id]
          );
        } else {
          await connection.execute(
            `INSERT INTO pos_subscriptions
               (organization_id, plan_code, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
             VALUES (?, ?, NULL, 'active', ?, ?, 0)`,
            [targetOrganizationId, PLAN_CODE, startSql, endSql]
          );
        }
        await connection.execute(
          `INSERT INTO pos_subscription_audit
             (organization_id, actor_user_id, action, details_json, ip_address)
           VALUES (?, ?, ?, ?, ?)`,
          [
            targetOrganizationId,
            actorUserId || null,
            action === 'activate'
              ? 'subscription.manually_activated'
              : action === 'set_expiration'
                ? 'subscription.expiration_assigned'
                : 'subscription.dates_assigned',
            JSON.stringify({
              current_period_start: startDate.toISOString(),
              current_period_end: endDate.toISOString(),
              previous_status: current?.status || null,
              previous_period_start: current?.current_period_start || null,
              previous_period_end: current?.current_period_end || null
            }),
            ipAddress || null
          ]
        );
      } else if (action === 'deactivate') {
        if (!current) {
          throw Object.assign(new Error('La organización no tiene una suscripción para desactivar.'), {
            status: 404,
            code: 'SUBSCRIPTION_NOT_FOUND'
          });
        }
        if (current.stripe_subscription_id) {
          if (!stripe) {
            throw Object.assign(new Error('Stripe debe estar configurado para cancelar esta suscripción.'), {
              status: 503,
              code: 'STRIPE_UNAVAILABLE'
            });
          }
          await stripe.subscriptions.cancel(current.stripe_subscription_id);
        }
        await connection.execute(
          `UPDATE pos_subscriptions
           SET status = 'canceled', cancel_at_period_end = 0, canceled_at = UTC_TIMESTAMP()
           WHERE id = ?`,
          [current.id]
        );
        await connection.execute(
          `INSERT INTO pos_subscription_audit
             (organization_id, actor_user_id, action, details_json, ip_address)
           VALUES (?, ?, 'subscription.manually_deactivated', ?, ?)`,
          [targetOrganizationId, actorUserId || null, JSON.stringify({
            subscription_id: current.id,
            stripe_subscription_id: current.stripe_subscription_id,
            previous_status: current.status
          }), ipAddress || null]
        );
      } else {
        throw Object.assign(new Error('La acción debe ser activate, set_period, set_expiration o deactivate.'), {
          status: 422,
          code: 'INVALID_SUBSCRIPTION_ACTION'
        });
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return (await listOrganizationSubscriptions()).find(row => row.organization_id === targetOrganizationId);
  }

  async function syncStripeSubscription(subscription, event) {
    const stripeCustomerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    let organizationId = Number(subscription.metadata?.organization_id);
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
      const [rows] = await pool.execute(
        'SELECT organization_id FROM pos_subscription_customers WHERE stripe_customer_id = ? LIMIT 1',
        [stripeCustomerId || '']
      );
      organizationId = Number(rows[0]?.organization_id);
    }
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
      if (subscription.metadata?.pending_signup_id) {
        console.info('[subscriptions] Deferring guest subscription sync until checkout provisioning:', {
          stripe_subscription_id: subscription.id,
          pending_signup_id: subscription.metadata.pending_signup_id
        });
        return false;
      }
      throw Object.assign(new Error('No se pudo asociar la suscripción Stripe a una organización.'), {
        code: 'SUBSCRIPTION_ORGANIZATION_NOT_FOUND'
      });
    }

    const item = subscription.items?.data?.[0];
    const currentPeriodStart = toIsoDate(
      subscription.current_period_start ? Number(subscription.current_period_start) * 1000 : null
    );
    const currentPeriodEnd = toIsoDate(periodEnd(subscription) ? Number(periodEnd(subscription)) * 1000 : null);
    const status = stripeStatus(subscription.status);
    const priceId = item?.price?.id || null;
    const canceledAt = toIsoDate(subscription.canceled_at ? Number(subscription.canceled_at) * 1000 : null);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (event?.id) {
        const [eventResult] = await connection.execute(
          'INSERT IGNORE INTO pos_subscription_events (event_id, event_type) VALUES (?, ?)',
          [event.id, event.type]
        );
        if (!eventResult.affectedRows) {
          await connection.commit();
          return;
        }
      }

      await connection.execute(
        `INSERT INTO pos_subscriptions
           (organization_id, plan_code, stripe_customer_id, stripe_subscription_id,
            stripe_price_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           organization_id = VALUES(organization_id),
           stripe_customer_id = VALUES(stripe_customer_id),
           stripe_price_id = VALUES(stripe_price_id),
           status = VALUES(status),
           current_period_start = VALUES(current_period_start),
           current_period_end = VALUES(current_period_end),
           cancel_at_period_end = VALUES(cancel_at_period_end),
           canceled_at = VALUES(canceled_at)`,
        [
          organizationId,
          PLAN_CODE,
          stripeCustomerId || null,
          subscription.id,
          priceId,
          status,
          currentPeriodStart ? currentPeriodStart.replace('T', ' ').slice(0, 19) : null,
          currentPeriodEnd ? currentPeriodEnd.replace('T', ' ').slice(0, 19) : null,
          subscription.cancel_at_period_end ? 1 : 0,
          canceledAt ? canceledAt.replace('T', ' ').slice(0, 19) : null
        ]
      );
      await connection.execute(
        `INSERT INTO pos_subscription_audit
           (organization_id, action, details_json)
         VALUES (?, ?, ?)`,
        [organizationId, `stripe.subscription.${status}`, JSON.stringify({
          stripe_event_type: event?.type || null,
          stripe_subscription_id: subscription.id,
          status,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end)
        })]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function processStripeEvent(event) {
    if (!stripe) throw new Error('Stripe no está configurado para procesar eventos.');
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (
        session.mode === 'subscription'
        && ['paid', 'no_payment_required'].includes(session.payment_status)
        && session.subscription
      ) {
        const activation = await guestSignupService?.provisionPaidCheckout(session);
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(subscription, event);
        await saveLatestPaidInvoice(subscription);
        await sendActivationEmailWithoutFailing(activation, event);
      }
      return;
    }
    if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const activation = await guestSignupService?.provisionPaidCheckout(session);
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(subscription, event);
        await saveLatestPaidInvoice(subscription);
        await sendActivationEmailWithoutFailing(activation, event);
      }
      return;
    }
    if (event.type.startsWith('customer.subscription.')) {
      await syncStripeSubscription(event.data.object, event);
      return;
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (event.type === 'invoice.paid') await savePaidInvoice(invoice);
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id
        );
        await syncStripeSubscription(subscription, event);
      }
    }
  }

  async function sendActivationEmailWithoutFailing(delivery, event) {
    if (!delivery) return;
    try {
      await guestSignupService?.sendActivationEmail(delivery);
    } catch (error) {
      console.error('[subscriptions] Paid checkout was processed, but activation email delivery failed:', {
        event_id: event.id,
        event_type: event.type,
        signup_id: delivery.signupId,
        code: error.code || 'ACCOUNT_EMAIL_SEND_FAILED',
        message: error.message
      });
    }
  }

  async function handleWebhook(rawBody, signature, webhookSecret) {
    if (!stripe || !webhookSecret) {
      throw Object.assign(new Error('El webhook de Stripe no está configurado.'), {
        status: 503,
        code: 'STRIPE_WEBHOOK_UNAVAILABLE'
      });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      throw Object.assign(new Error('La firma del webhook de Stripe es inválida.'), {
        status: 400,
        code: 'INVALID_STRIPE_SIGNATURE'
      });
    }
    try {
      await processStripeEvent(event);
    } catch (error) {
      console.error('[subscriptions] Stripe webhook event processing failed:', {
        event_id: event.id,
        event_type: event.type,
        code: error.code || 'WEBHOOK_PROCESSING_FAILED',
        message: error.message
      });
      throw error;
    }
    return { received: true };
  }

  return {
    getPlan,
    getStatus,
    listOrganizationPayments,
    updateMonthlyPlan,
    listOrganizationSubscriptions,
    setOrganizationSubscription,
    createCheckout,
    reconcileCheckout,
    reconcileGuestCheckout,
    cancelAtPeriodEnd,
    processStripeEvent,
    handleWebhook
  };
}

export function checkoutIdempotencyKey(value) {
  return createHash('sha256').update(value).digest('hex');
}

export { DEFAULT_AMOUNT, isAccessAllowed, normalizeAmount, stripeStatus };
