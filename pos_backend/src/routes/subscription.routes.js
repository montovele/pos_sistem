import express from 'express';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { getPool } from '../config/database.js';
import requireAuth from '../middleware/auth.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/roles.js';
import { createPosSubscriptionService, checkoutIdempotencyKey } from '../../../suscripciones/posSubscription.service.js';
import { createAccountEmailService } from '../services/accountEmailService.js';
import { createGuestSignupService } from '../services/guestSignupService.js';

const router = express.Router();
const installersDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../suscripciones');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const stripeWebhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const stripeConfigured = Boolean(stripe);
const webhookConfigured = Boolean(stripe && stripeWebhookSecret);
const guestSignupService = createGuestSignupService({
  pool: getPool(),
  stripe,
  emailService: createAccountEmailService()
});
const service = createPosSubscriptionService({ pool: getPool(), stripe, guestSignupService });

function sendError(res, error) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[subscriptions] Request failed:', error.message);
  return res.status(status).json({
    success: false,
    code: error.code || 'SUBSCRIPTION_ERROR',
    message: status === 500 ? 'No se pudo completar la operación de suscripción.' : error.message
  });
}

function publicPlan(plan) {
  if (!plan) return null;
  const hasStripePrice = Boolean(plan.has_stripe_price ?? plan.stripe_price_id);
  const isActive = Boolean(plan.is_active);
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    amount: Number(plan.amount),
    currency: plan.currency,
    interval_unit: plan.interval_unit,
    interval_count: Number(plan.interval_count),
    is_active: isActive,
    has_stripe_price: hasStripePrice,
    stripe_configured: stripeConfigured,
    webhook_configured: webhookConfigured,
    checkout_available: Boolean(stripeConfigured && hasStripePrice && isActive)
  };
}

router.get('/public/plan', async (_req, res) => {
  try {
    const plan = await service.getPlan();
    return res.json({
      success: true,
      data: publicPlan(plan)
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/checkout', async (req, res) => {
  if (!global.mysqlAvailable) {
    return res.status(503).json({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      message: 'El registro y la contratación requieren que el servicio de datos esté disponible.'
    });
  }

  if (!stripeConfigured) {
    return res.status(503).json({
      success: false,
      code: 'STRIPE_UNAVAILABLE',
      message: 'La contratación en línea no está disponible temporalmente.'
    });
  }

  try {
    const result = await guestSignupService.createCheckout(
      req.body || {},
      req.get('Idempotency-Key'),
      process.env.FRONTEND_URL || 'http://localhost:5173'
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/public/checkout-status/:sessionId', async (req, res) => {
  try {
    const result = await guestSignupService.getCheckoutStatus(req.params.sessionId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/payment-recovery', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  if (!global.mysqlAvailable) {
    return res.status(202).json({
      success: true,
      data: { accepted: true }
    });
  }
  try {
    await guestSignupService.requestPaymentRecovery(req.body?.email);
    return res.status(202).json({
      success: true,
      data: { accepted: true }
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/public/payment-recovery/:token', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    let result = await guestSignupService.getPaymentRecovery(req.params.token);
    if (result.paymentConfirmed && !result.signupProvisioned) {
      try {
        await service.reconcileGuestCheckout(result.checkoutSessionId);
      } catch (error) {
        if (!['ACCOUNT_EMAIL_NOT_CONFIGURED', 'ACCOUNT_EMAIL_SEND_FAILED', 'ACCOUNT_EMAIL_UNAVAILABLE'].includes(error.code)) {
          throw error;
        }
      }
      result = await guestSignupService.getPaymentRecovery(req.params.token);
    }

    return res.json({
      success: true,
      data: {
        status: result.status,
        paymentConfirmed: result.paymentConfirmed,
        checkoutUrl: result.checkoutUrl,
        payment: result.payment,
        subscription: result.subscription,
        account: result.account,
        nextAction: result.nextAction,
        plan: result.plan
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/payment-recovery/:token/retry', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const result = await guestSignupService.retryPaymentRecovery(
      req.params.token,
      process.env.FRONTEND_URL || 'http://localhost:5173'
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/payment-recovery/:token/resend-account-email', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const recovery = await guestSignupService.getPaymentRecovery(req.params.token);
    if (
      !recovery.signupProvisioned
      || recovery.status === 'active'
      || !recovery.checkoutSessionId
      || !recovery.signupEmail
    ) {
      return res.status(409).json({
        success: false,
        code: recovery.status === 'active' ? 'ACCOUNT_ALREADY_ACTIVE' : 'ACCOUNT_NOT_READY',
        message: recovery.status === 'active'
          ? 'La cuenta ya está activa. Inicia sesión para continuar.'
          : 'La cuenta todavía no está lista para reenviar el correo.'
      });
    }
    const result = await service.reconcileGuestCheckout(recovery.checkoutSessionId, {
      resendEmail: true,
      email: recovery.signupEmail
    });
    return res.json({
      success: true,
      data: {
        payment_confirmed: result.payment_confirmed,
        email_sent: result.email_sent,
        status: result.email_sent ? 'account_ready' : 'email_pending'
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/reconcile-checkout/:sessionId', async (req, res) => {
  try {
    const result = await service.reconcileGuestCheckout(req.params.sessionId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/public/resend-account-email/:sessionId', async (req, res) => {
  try {
    const result = await service.reconcileGuestCheckout(req.params.sessionId, {
      resendEmail: true,
      email: req.body?.email
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const status = await service.getStatus(req.user.organizationId);
    if (status.plan) status.plan = publicPlan(status.plan);
    res.json({ success: true, data: status });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/plan', requireAuth, async (_req, res) => {
  try {
    res.json({ success: true, data: publicPlan(await service.getPlan()) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/payments', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: await service.listOrganizationPayments(req.user.organizationId)
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/me/payment-status', requireAuth, async (req, res) => {
  try {
    const [subscription, payments] = await Promise.all([
      service.getStatus(req.user.organizationId),
      service.listOrganizationPayments(req.user.organizationId)
    ]);
    return res.json({
      success: true,
      data: {
        subscription: subscription.subscription,
        status: subscription.status,
        access_allowed: subscription.access_allowed,
        latest_payment: payments[0] || null
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/instaladores', requireAuth, async (_req, res) => {
  try {
    const entries = await readdir(installersDirectory, { withFileTypes: true });
    const installers = await Promise.all(entries
      .filter((entry) => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._ -]*\.exe$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(installersDirectory, entry.name);
        const fileInfo = await lstat(filePath);
        return {
          name: entry.name,
          size: fileInfo.size,
          updatedAt: fileInfo.mtime.toISOString()
        };
      }));
    res.json({ success: true, data: installers });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/instaladores/:filename/descargar', requireAuth, async (req, res) => {
  const { filename } = req.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*\.exe$/i.test(filename)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_INSTALLER_NAME',
      message: 'El nombre del instalador no es válido.'
    });
  }

  const filePath = path.join(installersDirectory, filename);
  try {
    const fileInfo = await lstat(filePath);
    if (!fileInfo.isFile()) {
      return res.status(404).json({
        success: false,
        code: 'INSTALLER_NOT_FOUND',
        message: 'No se encontró el instalador solicitado.'
      });
    }

    return res.download(filePath, filename, (error) => {
      if (!error) return;
      if (res.headersSent) {
        console.error('[subscriptions] Installer download failed:', error.message);
        return;
      }
      sendError(res, error);
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        code: 'INSTALLER_NOT_FOUND',
        message: 'No se encontró el instalador solicitado.'
      });
    }
    return sendError(res, error);
  }
});

router.get('/admin/plan', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    res.json({ success: true, data: publicPlan(await service.getPlan()) });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/admin/plan', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const plan = await service.updateMonthlyPlan({
      name: req.body?.name,
      description: req.body?.description,
      amount: req.body?.amount,
      is_active: req.body?.is_active,
      provision_price: req.body?.provision_price
    }, req.user.id, req.ip);
    res.json({ success: true, data: publicPlan(plan) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/admin/organizations', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    res.json({ success: true, data: await service.listOrganizationSubscriptions() });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/admin/organizations/:organizationId/subscription', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await service.setOrganizationSubscription(
      req.params.organizationId,
      req.body || {},
      req.user.id,
      req.ip
    );
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripeConfigured) {
      return res.status(503).json({
        success: false,
        code: 'STRIPE_UNAVAILABLE',
        message: 'Stripe no está configurado correctamente para iniciar el pago.'
      });
    }
    const requestKey = req.get('Idempotency-Key');
    if (!requestKey || !/^[A-Za-z0-9._:-]{8,255}$/.test(requestKey)) {
      return res.status(400).json({
        success: false,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Se requiere una clave de idempotencia válida para iniciar el pago.'
      });
    }
    const result = await service.createCheckout(
      req.user.organizationId,
      req.user,
      checkoutIdempotencyKey(`${req.user.organizationId}:${requestKey}`),
      process.env.FRONTEND_URL || 'http://localhost:5173'
    );
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/reconcile', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: await service.reconcileCheckout(req.user.organizationId)
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/cancel', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await service.cancelAtPeriodEnd(req.user.organizationId) });
  } catch (error) {
    sendError(res, error);
  }
});

export async function handlePosSubscriptionWebhook(req, res) {
  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const result = await service.handleWebhook(req.body, req.get('stripe-signature'), webhookSecret);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
}

export default router;
