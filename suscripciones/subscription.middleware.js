import { createSubscriptionService } from './subscription.service.js';

export function resolveAccount({ pool, service = null } = {}) {
  const subscriptionService = service || createSubscriptionService({ pool });
  return async (req, res, next) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } });
      const proveedorId = req.saasProviderId ?? req.session?.user?.proveedor_id ?? null;
      const account = await subscriptionService.findAccountForUser(userId, proveedorId);
      if (account) req.account = account;
      if (proveedorId !== null && (!account || !(await subscriptionService.isProviderInAccount(account.id, proveedorId)))) {
        return res.status(403).json({ error: { code: 'PROVIDER_OUTSIDE_ACCOUNT', message: 'El proveedor no pertenece a la cuenta SaaS.' } });
      }
      next();
    } catch (error) {
      console.error('[subscriptions] Entitlement resolution failed:', error.message);
      return res.status(503).json({ error: { code: 'SUBSCRIPTION_UNAVAILABLE', message: 'No se pudo verificar la suscripcion.' } });
    }
  };
}

export function requireEntitlement(feature, { service = null, pool } = {}) {
  const subscriptionService = service || createSubscriptionService({ pool });
  return async (req, res, next) => {
    try {
      if (!req.account?.id || !(await subscriptionService.hasEntitlement(req.account.id, feature))) return res.status(403).json({ error: { code: 'SUBSCRIPTION_REQUIRED', feature, message: 'El modulo no esta incluido en tu plan.' } });
      next();
    } catch (error) { next(error); }
  };
}