const ACTIVE_STATUSES = ['active', 'trialing'];

function currentStripeEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test');
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').slice(0, 19);
  }
  return null;
}

function normalizeCancelAtPeriodEnd(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function hasOwn(values, property) {
  return Object.prototype.hasOwnProperty.call(values, property);
}

export function createSubscriptionRepository(pool) {
  if (!pool?.execute) throw new TypeError('A MySQL pool is required');
  return {
    async listPlans({ estado = null, codigo = null, activo = null, publicOnly = false, environment = currentStripeEnvironment() } = {}) {
      const where = [];
      const params = [];
      if (estado !== null && estado !== undefined && estado !== '') { where.push('p.estado = ?'); params.push(estado); }
      if (codigo !== null && codigo !== undefined && codigo !== '') { where.push('p.codigo = ?'); params.push(codigo); }
      if (activo !== null && activo !== undefined) { where.push('p.estado = ?'); params.push(activo === true || activo === 'true' ? 'active' : 'archived'); }
      if (publicOnly) where.push("p.estado = 'active'");
      try {
        const [rows] = await pool.execute(`SELECT p.id, p.codigo, p.nombre, p.descripcion, p.estado, pp.id AS price_version_id, pp.stripe_price_id, pp.amount AS precio, pp.currency AS moneda, pp.interval_unit AS intervalo, pp.interval_count AS intervalo_cantidad, pp.status AS price_status FROM saas_plans p LEFT JOIN saas_plan_prices pp ON pp.plan_id = p.id AND pp.environment = ? AND pp.status = 'active'${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC, p.id DESC`, [environment, ...params]);
        return rows;
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        const [rows] = await pool.execute(`SELECT p.id, p.codigo, p.nombre, p.descripcion, p.estado, p.created_at, p.updated_at FROM saas_plans p${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC, p.id DESC`, params);
        return rows;
      }
    },
    async getPlan(planId) {
      const [rows] = await pool.execute('SELECT p.id, p.codigo, p.nombre, p.descripcion, p.estado, p.created_at, p.updated_at FROM saas_plans p WHERE p.id = ? LIMIT 1', [planId]);
      return rows[0] || null;
    },
    async getCheckoutPlan(planCode, environment = currentStripeEnvironment()) {
      try {
        const [rows] = await pool.execute("SELECT p.id, p.codigo, p.nombre, p.estado, pp.id AS price_version_id, pp.amount AS precio, pp.currency AS moneda, pp.interval_unit AS intervalo, pp.interval_count AS intervalo_cantidad, pp.stripe_price_id FROM saas_plans p LEFT JOIN saas_plan_prices pp ON pp.plan_id = p.id AND pp.environment = ? AND pp.status = 'active' WHERE p.codigo = ? AND p.estado = 'active' ORDER BY pp.id DESC LIMIT 1", [environment, planCode]);
        return rows[0] || null;
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        const [rows] = await pool.execute("SELECT id, codigo, nombre, estado FROM saas_plans WHERE codigo = ? AND estado = 'active' LIMIT 1", [planCode]);
        return rows[0] || null;
      }
    },
    async listPlanPrices(planId, environment = currentStripeEnvironment()) {
      const [rows] = await pool.execute('SELECT id, plan_id, environment, amount, currency, interval_unit AS intervalo, interval_count AS intervalo_cantidad, status, created_at, updated_at FROM saas_plan_prices WHERE plan_id = ? AND environment = ? ORDER BY id DESC', [planId, environment]);
      return rows;
    },
    async createPlanPrice(planId, values, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [plans] = await connection.execute("SELECT id FROM saas_plans WHERE id = ? AND estado IN ('draft', 'active') LIMIT 1", [planId]);
        if (!plans[0]) throw Object.assign(new Error('Plan no encontrado o archivado'), { status: 422, code: 'INVALID_SUBSCRIPTION_PLAN' });
        await connection.execute("UPDATE saas_plan_prices SET status = 'archived' WHERE plan_id = ? AND environment = ? AND status = 'active'", [planId, values.environment]);
        const [result] = await connection.execute('INSERT INTO saas_plan_prices (plan_id, environment, amount, currency, interval_unit, interval_count, stripe_price_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [planId, values.environment, values.amount, values.currency, values.interval_unit, values.interval_count, values.stripe_price_id || null, values.status || 'active']);
        await connection.execute('INSERT INTO saas_plan_price_audit (plan_id, price_version_id, actor_user_id, action, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [planId, result.insertId, actorUserId, 'plan.price.created', JSON.stringify(values), ipAddress || null]);
        await connection.commit();
        const [rows] = await pool.execute('SELECT id, plan_id, environment, amount, currency, interval_unit AS intervalo, interval_count AS intervalo_cantidad, status, created_at, updated_at FROM saas_plan_prices WHERE id = ?', [result.insertId]);
        return rows[0] || null;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async setPlanPriceStatus(priceVersionId, status, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [existing] = await connection.execute('SELECT id, plan_id, environment FROM saas_plan_prices WHERE id = ? FOR UPDATE', [priceVersionId]);
        if (!existing[0]) throw Object.assign(new Error('Version de precio no encontrada'), { status: 404, code: 'PRICE_VERSION_NOT_FOUND' });
        if (status === 'active') await connection.execute("UPDATE saas_plan_prices SET status = 'archived' WHERE plan_id = ? AND environment = ? AND id != ? AND status = 'active'", [existing[0].plan_id, existing[0].environment, priceVersionId]);
        await connection.execute('UPDATE saas_plan_prices SET status = ? WHERE id = ?', [status, priceVersionId]);
        await connection.execute('INSERT INTO saas_plan_price_audit (plan_id, price_version_id, actor_user_id, action, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [existing[0].plan_id, priceVersionId, actorUserId, `plan.price.${status}`, JSON.stringify({ status }), ipAddress || null]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      const [rows] = await pool.execute('SELECT id, plan_id, environment, amount, currency, interval_unit AS intervalo, interval_count AS intervalo_cantidad, status, created_at, updated_at FROM saas_plan_prices WHERE id = ?', [priceVersionId]);
      return rows[0] || null;
    },
    async createPlan(values = {}) {
      const codigo = String(values.codigo || '').trim();
      const nombre = String(values.nombre || '').trim();
      const descripcion = values.descripcion ?? null;
      const estado = ['draft', 'active', 'archived'].includes(values.estado) ? values.estado : 'draft';
      if (!codigo || !nombre) throw Object.assign(new Error('Código y nombre del plan son obligatorios'), { status: 422, code: 'INVALID_PLAN_PAYLOAD' });
      const [result] = await pool.execute('INSERT INTO saas_plans (codigo, nombre, descripcion, estado) VALUES (?, ?, ?, ?)', [codigo, nombre, descripcion, estado]);
      return this.getPlan(result.insertId);
    },
    async replacePlanEntitlements(planId, entitlements = {}) {
      const entries = Array.isArray(entitlements)
        ? entitlements.map(featureKey => [featureKey, true, null])
        : Object.entries(entitlements || {}).map(([featureKey, value]) => [featureKey, value?.enabled ?? Boolean(value), value?.limits ?? null]);
      const connection = await pool.getConnection();
      console.info('[subscriptions][entitlements][repository-write]', { plan_id: planId, entry_count: entries.length, entitlement_keys: entries.map(entry => entry[0]) });
      try {
        await connection.beginTransaction();
        for (const [featureKey, enabled, limits] of entries) {
          const normalizedFeatureKey = String(featureKey || '').trim();
          if (!normalizedFeatureKey) continue;
          await connection.execute('INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled, limits_json) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), limits_json = VALUES(limits_json)', [planId, normalizedFeatureKey, enabled ? 1 : 0, limits ? JSON.stringify(limits) : null]);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_plan_entitlements WHERE plan_id = ? ORDER BY feature_key', [planId]);
      console.info('[subscriptions][entitlements][repository-write-result]', { plan_id: planId, stored_count: rows.length, stored_keys: rows.map(row => row.feature_key) });
      return rows;
    },
    async listPlanEntitlements(planId) {
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_plan_entitlements WHERE plan_id = ? ORDER BY feature_key', [planId]);
      return rows;
    },
    async updatePlanEntitlement(planId, featureKey, values = {}) {
      const enabled = values.enabled === true || values.enabled === 1 || values.enabled === '1' ? 1 : 0;
      const limitsJson = values.limits === undefined ? null : values.limits === null ? null : JSON.stringify(values.limits);
      await pool.execute('INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled, limits_json) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), limits_json = VALUES(limits_json)', [planId, featureKey, enabled, limitsJson]);
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_plan_entitlements WHERE plan_id = ? AND feature_key = ?', [planId, featureKey]);
      return rows[0] || null;
    },
    async deletePlanEntitlement(planId, featureKey) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [planRows] = await connection.execute('SELECT id, codigo FROM saas_plans WHERE id = ? OR codigo = ? LIMIT 1', [planId, planId]);
        if (!planRows[0]) {
          await connection.rollback();
          return { deleted: false, accountIds: [] };
        }
        const resolvedPlanId = planRows[0].id;
        const [subscriptions] = await connection.execute('SELECT s.id AS subscription_id, s.account_id FROM saas_subscriptions s WHERE s.plan_id = ?', [resolvedPlanId]);
        const [planResult] = await connection.execute('DELETE FROM saas_plan_entitlements WHERE plan_id = ? AND feature_key = ?', [resolvedPlanId, featureKey]);
        const [snapshotResult] = await connection.execute('DELETE se FROM saas_subscription_entitlements se INNER JOIN saas_subscriptions s ON s.id = se.subscription_id WHERE s.plan_id = ? AND se.feature_key = ?', [resolvedPlanId, featureKey]);
        await connection.commit();
        console.info('[subscriptions][entitlements][delete-propagated]', {
          plan_id: resolvedPlanId,
          plan_code: planRows[0].codigo,
          feature_key: featureKey,
          plan_deleted: planResult.affectedRows,
          snapshots_deleted: snapshotResult.affectedRows,
          subscription_ids: subscriptions.map(row => row.subscription_id),
          account_ids: [...new Set(subscriptions.map(row => row.account_id))]
        });
        return {
          deleted: planResult.affectedRows > 0 || snapshotResult.affectedRows > 0,
          accountIds: [...new Set(subscriptions.map(row => row.account_id))]
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
    async snapshotSubscriptionEntitlements(subscriptionId, planCode) {
      await pool.execute('INSERT INTO saas_subscription_entitlements (subscription_id, feature_key, enabled, limits_json) SELECT ?, pe.feature_key, pe.enabled, pe.limits_json FROM saas_plan_entitlements pe INNER JOIN saas_plans p ON p.id = pe.plan_id WHERE p.codigo = ? ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), limits_json = VALUES(limits_json)', [subscriptionId, planCode]);
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_subscription_entitlements WHERE subscription_id = ? ORDER BY feature_key', [subscriptionId]);
      console.info('[subscriptions][entitlements][subscription-snapshot]', { subscription_id: subscriptionId, plan_code: planCode, entitlement_count: rows.length, entitlement_keys: rows.map(row => row.feature_key) });
      return rows;
    },
    async listSubscriptionEntitlements(subscriptionId) {
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_subscription_entitlements WHERE subscription_id = ? ORDER BY feature_key', [subscriptionId]);
      return rows;
    },
    async updateSubscriptionEntitlement(subscriptionId, featureKey, values = {}) {
      const enabled = values.enabled === true || values.enabled === 1 || values.enabled === '1' ? 1 : 0;
      const limitsJson = values.limits === undefined ? null : values.limits === null ? null : JSON.stringify(values.limits);
      await pool.execute('INSERT INTO saas_subscription_entitlements (subscription_id, feature_key, enabled, limits_json) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), limits_json = VALUES(limits_json)', [subscriptionId, featureKey, enabled, limitsJson]);
      const [rows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_subscription_entitlements WHERE subscription_id = ? AND feature_key = ?', [subscriptionId, featureKey]);
      return rows[0] || null;
    },
    async deleteSubscriptionEntitlement(subscriptionId, featureKey) {
      const [result] = await pool.execute('DELETE FROM saas_subscription_entitlements WHERE subscription_id = ? AND feature_key = ?', [subscriptionId, featureKey]);
      return result.affectedRows > 0;
    },
    async findSubscriptionAccountId(subscriptionId) {
      const [rows] = await pool.execute('SELECT account_id FROM saas_subscriptions WHERE id = ? LIMIT 1', [subscriptionId]);
      return rows[0]?.account_id || null;
    },
    async updatePlan(planId, values = {}) {
      const updates = [];
      const params = [];
      if (values.codigo !== undefined) {
        const codigo = String(values.codigo || '').trim();
        if (!codigo) throw Object.assign(new Error('Código del plan invalido'), { status: 422, code: 'INVALID_PLAN_CODE' });
        updates.push('codigo = ?'); params.push(codigo);
      }
      if (values.nombre !== undefined) {
        const nombre = String(values.nombre || '').trim();
        if (!nombre) throw Object.assign(new Error('Nombre del plan invalido'), { status: 422, code: 'INVALID_PLAN_NAME' });
        updates.push('nombre = ?'); params.push(nombre);
      }
      if (values.descripcion !== undefined) { updates.push('descripcion = ?'); params.push(values.descripcion ?? null); }
      if (values.estado !== undefined) {
        if (!['draft', 'active', 'archived'].includes(values.estado)) throw Object.assign(new Error('Estado del plan invalido'), { status: 422, code: 'INVALID_PLAN_STATUS' });
        updates.push('estado = ?'); params.push(values.estado);
      }
      if (!updates.length) return this.getPlan(planId);
      params.push(planId);
      const [result] = await pool.execute(`UPDATE saas_plans SET ${updates.join(', ')} WHERE id = ?`, params);
      if (!result.affectedRows) throw Object.assign(new Error('Plan no encontrado'), { status: 404, code: 'PLAN_NOT_FOUND' });
      return this.getPlan(planId);
    },
    async deletePlan(planId) {
      const [result] = await pool.execute("UPDATE saas_plans SET estado = 'archived' WHERE id = ? AND estado != 'archived'", [planId]);
      if (!result.affectedRows) {
        const existing = await this.getPlan(planId);
        if (!existing) throw Object.assign(new Error('Plan no encontrado'), { status: 404, code: 'PLAN_NOT_FOUND' });
        return existing;
      }
      return this.getPlan(planId);
    },
    async findAccountForUser(userId, proveedorId = null) {
      const providerClause = proveedorId === null ? '' : ' INNER JOIN saas_account_providers ap ON ap.account_id = a.id AND ap.proveedor_id = ?';
      const params = proveedorId === null ? [userId] : [proveedorId, userId];
      const [rows] = await pool.execute(`SELECT a.id, a.nombre, a.estado FROM saas_accounts a INNER JOIN saas_account_users au ON au.account_id = a.id${providerClause} WHERE au.user_id = ? AND a.estado = 'active' ORDER BY a.id ASC LIMIT 1`, params);
      return rows[0] || null;
    },
    async isProviderInAccount(accountId, proveedorId) {
      const [rows] = await pool.execute('SELECT 1 FROM saas_account_providers WHERE account_id = ? AND proveedor_id = ? LIMIT 1', [accountId, proveedorId]);
      return rows.length > 0;
    },
    async findEffectiveSubscription(accountId) {
      const [rows] = await pool.execute(`SELECT s.id AS subscription_id, s.status, s.current_period_end, s.cancel_at_period_end, p.codigo AS plan_id, p.nombre AS plan_name, COALESCE(se.feature_key, pe.feature_key) AS feature_key, COALESCE(se.enabled, pe.enabled) AS enabled, COALESCE(se.limits_json, pe.limits_json) AS limits_json, o.enabled AS override_enabled FROM saas_subscriptions s INNER JOIN saas_plans p ON p.id = s.plan_id AND p.estado = 'active' LEFT JOIN saas_subscription_entitlements se ON se.subscription_id = s.id LEFT JOIN saas_plan_entitlements pe ON se.subscription_id IS NULL AND pe.plan_id = p.id LEFT JOIN saas_account_entitlement_overrides o ON o.account_id = s.account_id AND o.feature_key = COALESCE(se.feature_key, pe.feature_key) AND (o.expires_at IS NULL OR o.expires_at > CURRENT_TIMESTAMP) WHERE s.id = (SELECT latest.id FROM saas_subscriptions latest WHERE latest.account_id = ? AND latest.status IN (?, ?) ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)`, [accountId, ...ACTIVE_STATUSES]);
      return rows;
    },
    async listSubscriptions({ accountId = null, proveedorId = null, userId = null, status = null } = {}) {
      const where = [];
      const params = [];
      if (accountId !== null) { where.push('s.account_id = ?'); params.push(accountId); }
      if (proveedorId !== null) { where.push('ap.proveedor_id = ?'); params.push(proveedorId); }
      if (userId !== null) { where.push('au.user_id = ?'); params.push(userId); }
      if (status !== null) { where.push('s.status = ?'); params.push(status); }
      const joins = `${proveedorId !== null ? ' INNER JOIN saas_account_providers ap ON ap.account_id = s.account_id' : ''}${userId !== null ? ' INNER JOIN saas_account_users au ON au.account_id = s.account_id' : ''}`;
      const [rows] = await pool.execute(`SELECT DISTINCT s.id, s.account_id, s.status, s.started_at, s.current_period_end, s.cancel_at_period_end, s.canceled_at, p.codigo AS plan_id, p.nombre AS plan_name, s.created_at FROM saas_subscriptions s INNER JOIN saas_plans p ON p.id = s.plan_id${joins}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY s.created_at DESC, s.id DESC`, params);
      return rows;
    },
    async findSubscription(subscriptionId) {
      const [rows] = await pool.execute('SELECT s.id, s.account_id, s.status, s.started_at, s.current_period_end, s.cancel_at_period_end, s.canceled_at, s.price_version_id, p.codigo AS plan_id, p.nombre AS plan_name FROM saas_subscriptions s INNER JOIN saas_plans p ON p.id = s.plan_id WHERE s.id = ? LIMIT 1', [subscriptionId]);
      if (!rows[0]) return null;
      const [entitlementRows] = await pool.execute('SELECT feature_key, enabled, limits_json FROM saas_plan_entitlements WHERE plan_id = ? ORDER BY feature_key', [rows[0].plan_id]);
      console.info('[subscriptions][entitlements][read]', {
        subscription_id: subscriptionId,
        plan_id: rows[0].plan_id,
        entitlement_count: entitlementRows.length,
        entitlement_keys: entitlementRows.map(row => row.feature_key)
      });
      const entitlements = {};
      const limits = {};
      for (const row of entitlementRows) {
        entitlements[row.feature_key] = Boolean(row.enabled);
        if (row.enabled && row.limits_json) {
          const parsedLimits = typeof row.limits_json === 'string' ? JSON.parse(row.limits_json) : row.limits_json;
          if (parsedLimits && typeof parsedLimits === 'object') Object.assign(limits, parsedLimits);
        }
      }
      return { ...rows[0], entitlements, limits };
    },
    async createSubscription(accountId, values, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [accounts] = await connection.execute("SELECT id FROM saas_accounts WHERE id = ? AND estado = 'active' FOR UPDATE", [accountId]);
        if (!accounts[0]) throw Object.assign(new Error('Cuenta no encontrada'), { status: 404, code: 'ACCOUNT_NOT_FOUND' });
        const [plans] = await connection.execute("SELECT id FROM saas_plans WHERE codigo = ? AND estado = 'active' LIMIT 1", [values.plan_id]);
        if (!plans[0]) throw Object.assign(new Error('Plan invalido'), { status: 422, code: 'INVALID_PLAN' });
        const [result] = await connection.execute('INSERT INTO saas_subscriptions (account_id, plan_id, status, external_customer_id, external_subscription_id, started_at, current_period_end, cancel_at_period_end) VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)', [accountId, plans[0].id, values.status, values.external_customer_id || null, values.external_subscription_id || null, normalizeDateTime(values.started_at), normalizeDateTime(values.current_period_end), values.cancel_at_period_end ? 1 : 0]);
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [accountId, actorUserId, 'subscription.created', values.reason || null, JSON.stringify(values), ipAddress || null]);
        await connection.commit();
        return this.findEffectiveSubscription(accountId);
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async createSubscriptionForUser(userId, values, actorUserId, ipAddress, proveedorId = null) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [existingAccounts] = await connection.execute("SELECT a.id FROM saas_accounts a INNER JOIN saas_account_users au ON au.account_id = a.id WHERE au.user_id = ? AND a.estado = 'active' ORDER BY a.id ASC LIMIT 1 FOR UPDATE", [userId]);
        let accountId = existingAccounts[0]?.id;

        if (!accountId) {
          const accountName = String(values.account_name || `Cuenta ${userId}`).trim().slice(0, 255);
          if (!accountName) throw Object.assign(new Error('Nombre de cuenta invalido'), { status: 422, code: 'INVALID_ACCOUNT_NAME' });
          const [accountResult] = await connection.execute("INSERT INTO saas_accounts (nombre, estado) VALUES (?, 'active')", [accountName]);
          accountId = accountResult.insertId;
          await connection.execute('INSERT INTO saas_account_users (account_id, user_id, rol) VALUES (?, ?, ?)', [accountId, userId, 'owner']);
        }

        if (proveedorId !== null && proveedorId !== undefined) {
          await connection.execute('INSERT INTO saas_account_providers (account_id, proveedor_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)', [accountId, proveedorId]);
        }

        const [plans] = await connection.execute("SELECT id FROM saas_plans WHERE codigo = ? AND estado = 'active' LIMIT 1", [values.plan_id]);
        if (!plans[0]) throw Object.assign(new Error('Plan invalido'), { status: 422, code: 'INVALID_PLAN' });
        await connection.execute('INSERT INTO saas_subscriptions (account_id, plan_id, status, external_customer_id, external_subscription_id, started_at, current_period_end, cancel_at_period_end) VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?)', [accountId, plans[0].id, values.status, values.external_customer_id || null, values.external_subscription_id || null, normalizeDateTime(values.started_at), normalizeDateTime(values.current_period_end), values.cancel_at_period_end ? 1 : 0]);
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [accountId, actorUserId, 'subscription.created', values.reason || null, JSON.stringify({ ...values, account_id: accountId, user_id: userId }), ipAddress || null]);
        await connection.commit();
        return { accountId, rows: await this.findEffectiveSubscription(accountId) };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async updateSubscription(accountId, values, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [planRows] = await connection.execute("SELECT id FROM saas_plans WHERE codigo = ? AND estado = 'active' LIMIT 1", [values.plan_id]);
        if (!planRows[0]) throw Object.assign(new Error('Plan invalido'), { status: 422, code: 'INVALID_PLAN' });
        const updates = ['plan_id = ?', 'status = ?'];
        const params = [planRows[0].id, values.status];
        if (hasOwn(values, 'current_period_end')) { updates.push('current_period_end = ?'); params.push(normalizeDateTime(values.current_period_end)); }
        if (hasOwn(values, 'cancel_at_period_end')) { updates.push('cancel_at_period_end = ?'); params.push(normalizeCancelAtPeriodEnd(values.cancel_at_period_end)); }
        params.push(accountId);
        const [result] = await connection.execute(`UPDATE saas_subscriptions SET ${updates.join(', ')} WHERE id = (SELECT subscription_id FROM (SELECT id AS subscription_id FROM saas_subscriptions WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT 1) latest)`, params);
        if (!result.affectedRows) throw Object.assign(new Error('Suscripcion no encontrada'), { status: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [accountId, actorUserId, 'subscription.updated', values.reason || null, JSON.stringify(values), ipAddress || null]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      return this.findEffectiveSubscription(accountId);
    },
    async updateSubscriptionById(subscriptionId, values, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [planRows] = await connection.execute("SELECT id FROM saas_plans WHERE codigo = ? AND estado = 'active' LIMIT 1", [values.plan_id]);
        if (!planRows[0]) throw Object.assign(new Error('Plan invalido'), { status: 422, code: 'INVALID_PLAN' });
        console.info('[subscriptions][entitlements][repository-update]', {
          subscription_id: subscriptionId,
          resolved_plan_id: planRows[0].id,
          plan_code: values.plan_id,
          has_entitlements: Object.prototype.hasOwnProperty.call(values, 'entitlements'),
          entitlement_keys: Array.isArray(values.entitlements) ? values.entitlements : Object.keys(values.entitlements || {})
        });
        const updates = ['plan_id = ?', 'status = ?'];
        const params = [planRows[0].id, values.status];
        if (hasOwn(values, 'current_period_end')) { updates.push('current_period_end = ?'); params.push(normalizeDateTime(values.current_period_end)); }
        if (hasOwn(values, 'cancel_at_period_end')) { updates.push('cancel_at_period_end = ?'); params.push(normalizeCancelAtPeriodEnd(values.cancel_at_period_end)); }
        params.push(subscriptionId);
        const [result] = await connection.execute(`UPDATE saas_subscriptions SET ${updates.join(', ')} WHERE id = ?`, params);
        if (!result.affectedRows) throw Object.assign(new Error('Suscripcion no encontrada'), { status: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
        const [rows] = await connection.execute('SELECT account_id FROM saas_subscriptions WHERE id = ?', [subscriptionId]);
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [rows[0].account_id, actorUserId, 'subscription.updated', values.reason || null, JSON.stringify({ subscription_id: subscriptionId, ...values }), ipAddress || null]);
        await connection.commit();
        return { accountId: rows[0].account_id, rows: await this.findEffectiveSubscription(rows[0].account_id) };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async cancelSubscription(subscriptionId, actorUserId, ipAddress, reason = null) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [existing] = await connection.execute('SELECT account_id, status FROM saas_subscriptions WHERE id = ? FOR UPDATE', [subscriptionId]);
        if (!existing[0]) throw Object.assign(new Error('Suscripcion no encontrada'), { status: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
        if (existing[0].status === 'canceled') {
          await connection.commit();
          return { account_id: existing[0].account_id };
        }
        const [result] = await connection.execute("UPDATE saas_subscriptions SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, cancel_at_period_end = 1 WHERE id = ? AND status NOT IN ('canceled', 'expired')", [subscriptionId]);
        if (!result.affectedRows) throw Object.assign(new Error('Suscripcion no encontrada'), { status: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [existing[0].account_id, actorUserId, 'subscription.canceled', reason, JSON.stringify({ subscription_id: subscriptionId, status: 'canceled' }), ipAddress || null]);
        await connection.commit();
        return { account_id: existing[0].account_id };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async updateOverride(accountId, featureKey, values, actorUserId, ipAddress) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('INSERT INTO saas_account_entitlement_overrides (account_id, feature_key, enabled, expires_at, reason, created_by) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), expires_at = VALUES(expires_at), reason = VALUES(reason), created_by = VALUES(created_by)', [accountId, featureKey, values.enabled ? 1 : 0, values.expires_at || null, values.reason || null, actorUserId]);
        await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [accountId, actorUserId, 'entitlement_override.updated', values.reason || null, JSON.stringify({ feature_key: featureKey, ...values }), ipAddress || null]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      return this.findEffectiveSubscription(accountId);
    },
    async getOrCreateAccountForUser(userId, accountName = null, proveedorId = null, actorUserId = null, ipAddress = null) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [existingAccounts] = await connection.execute("SELECT a.id, a.nombre FROM saas_accounts a INNER JOIN saas_account_users au ON au.account_id = a.id WHERE au.user_id = ? AND a.estado = 'active' ORDER BY a.id ASC LIMIT 1 FOR UPDATE", [userId]);
        let accountId = existingAccounts[0]?.id;
        let isNew = false;

        if (!accountId) {
          const finalAccountName = String(accountName || `Cuenta ${userId}`).trim().slice(0, 255);
          if (!finalAccountName) throw Object.assign(new Error('Nombre de cuenta invalido'), { status: 422, code: 'INVALID_ACCOUNT_NAME' });
          const [accountResult] = await connection.execute("INSERT INTO saas_accounts (nombre, estado) VALUES (?, 'active')", [finalAccountName]);
          accountId = accountResult.insertId;
          await connection.execute('INSERT INTO saas_account_users (account_id, user_id, rol) VALUES (?, ?, ?)', [accountId, userId, 'owner']);
          isNew = true;
        }

        if (proveedorId !== null && proveedorId !== undefined) {
          await connection.execute('INSERT INTO saas_account_providers (account_id, proveedor_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)', [accountId, proveedorId]);
        }

        if (isNew) {
          await connection.execute('INSERT INTO saas_subscription_audit (account_id, actor_user_id, action, reason, after_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [accountId, actorUserId || userId, 'account.created', null, JSON.stringify({ user_id: userId, account_name: accountName, proveedor_id: proveedorId }), ipAddress || null]);
        }

        await connection.commit();
        const [result] = await connection.execute("SELECT id, nombre, estado FROM saas_accounts WHERE id = ?", [accountId]);
        return result[0];
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
  };
}