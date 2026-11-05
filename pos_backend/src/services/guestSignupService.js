import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from './authService.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const serviceError = (message, status, code) => Object.assign(new Error(message), { status, code });
const asSqlDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const checkoutKeyHash = (key) => createHash('sha256').update(key).digest('hex');

function normalizeSignup(payload = {}) {
  const signup = {
    businessName: String(payload.businessName || '').trim(),
    firstName: String(payload.firstName || '').trim(),
    lastName: String(payload.lastName || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim()
  };

  if (
    !signup.businessName
    || signup.businessName.length > 100
    || !signup.firstName
    || signup.firstName.length > 100
    || !signup.lastName
    || signup.lastName.length > 100
    || !emailPattern.test(signup.email)
    || signup.email.length > 150
    || signup.phone.length > 20
  ) {
    throw serviceError('Completa un nombre de negocio, nombre, apellido y correo válidos.', 422, 'INVALID_SIGNUP_DATA');
  }

  return signup;
}

export function createGuestSignupService({
  pool,
  stripe = null,
  emailService = null,
  passwordHasher = hashPassword,
  frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
} = {}) {
  if (!pool?.execute || !pool?.getConnection) throw new TypeError('A MySQL pool is required');

  async function createCheckout(payload, requestKey, baseUrl = frontendUrl) {
    const signup = normalizeSignup(payload);
    const idempotencyKey = String(requestKey || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,255}$/.test(idempotencyKey)) {
      throw serviceError('Se requiere una clave de idempotencia válida.', 400, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!stripe) {
      throw serviceError('Stripe no está configurado para iniciar el pago.', 503, 'STRIPE_UNAVAILABLE');
    }

    const [existingUsers] = await pool.execute(
      'SELECT id FROM usuarios WHERE LOWER(email) = ? LIMIT 1',
      [signup.email]
    );
    if (existingUsers.length) {
      throw serviceError('Ya existe una cuenta con ese correo. Inicia sesión para consultar sus planes.', 409, 'ACCOUNT_EMAIL_EXISTS');
    }

    const [planRows] = await pool.execute(
      `SELECT code, name, amount, currency, interval_unit, interval_count,
              is_active, stripe_price_id
       FROM pos_subscription_plans
       WHERE code = ?
       LIMIT 1`,
      ['monthly']
    );
    const plan = planRows[0];
    if (!plan?.stripe_price_id) {
      throw serviceError('El plan aún no está configurado para pagos en línea.', 409, 'PLAN_NOT_CONFIGURED');
    }
    if (!plan.is_active) {
      throw serviceError('El plan no está disponible temporalmente.', 409, 'PLAN_INACTIVE');
    }

    const hashedIdempotencyKey = checkoutKeyHash(idempotencyKey);
    const [pendingRows] = await pool.execute(
      `SELECT id, idempotency_key, stripe_customer_id, stripe_checkout_session_id, status
       FROM pos_pending_signups
       WHERE email = ?
       LIMIT 1`,
      [signup.email]
    );
    let pending = pendingRows[0] || null;

    if (pending?.stripe_checkout_session_id) {
      const currentSession = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
      if (currentSession.status === 'open' && currentSession.url) {
        return { checkout_url: currentSession.url };
      }
      if (currentSession.status === 'complete' || pending.status === 'provisioned') {
        throw serviceError('El pago se está verificando. Revisa tu correo antes de volver a intentarlo.', 409, 'CHECKOUT_PROCESSING');
      }
    }

    if (pending && pending.status === 'provisioned') {
      throw serviceError('El acceso de esta organización ya fue creado. Revisa tu correo o inicia sesión.', 409, 'ACCOUNT_ALREADY_CREATED');
    }

    if (!pending) {
      pending = {
        id: randomUUID(),
        stripe_customer_id: null,
        stripe_checkout_session_id: null
      };
      try {
        await pool.execute(
          `INSERT INTO pos_pending_signups
             (id, idempotency_key, nombre_org, nombre, apellido, email, telefono, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'checkout_pending')`,
          [
            pending.id,
            hashedIdempotencyKey,
            signup.businessName,
            signup.firstName,
            signup.lastName,
            signup.email,
            signup.phone || null
          ]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw serviceError('Ya existe una contratación pendiente con ese correo. Revisa el enlace de pago enviado anteriormente.', 409, 'SIGNUP_ALREADY_PENDING');
        }
        throw error;
      }
    } else {
      await pool.execute(
        `UPDATE pos_pending_signups
         SET idempotency_key = ?, nombre_org = ?, nombre = ?, apellido = ?, telefono = ?,
             stripe_checkout_session_id = NULL, status = 'checkout_pending'
         WHERE id = ?`,
        [
          hashedIdempotencyKey,
          signup.businessName,
          signup.firstName,
          signup.lastName,
          signup.phone || null,
          pending.id
        ]
      );
    }

    let customerId = pending.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: signup.email,
        name: `${signup.firstName} ${signup.lastName}`,
        metadata: { pending_signup_id: pending.id }
      }, { idempotencyKey: `pos-guest-customer-${pending.id}` });
      customerId = customer.id;
      await pool.execute(
        'UPDATE pos_pending_signups SET stripe_customer_id = ? WHERE id = ?',
        [customerId, pending.id]
      );
    }

    const frontendBaseUrl = String(baseUrl || frontendUrl).replace(/\/+$/, '');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: pending.id,
      metadata: {
        pending_signup_id: pending.id,
        plan_code: plan.code
      },
      subscription_data: {
        metadata: {
          pending_signup_id: pending.id,
          plan_code: plan.code
        }
      },
      success_url: `${frontendBaseUrl}/planes?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBaseUrl}/planes?checkout=cancel`
    }, { idempotencyKey: `pos-guest-checkout-${hashedIdempotencyKey}` });

    if (!checkout.url || !checkout.id) {
      throw new Error('Stripe no devolvió una sesión de pago válida.');
    }

    await pool.execute(
      `UPDATE pos_pending_signups
       SET stripe_customer_id = ?, stripe_checkout_session_id = ?, status = 'checkout_created'
       WHERE id = ?`,
      [customerId, checkout.id, pending.id]
    );

    return { checkout_url: checkout.url };
  }

  async function createSetupToken(connection, userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await connection.execute(
      'UPDATE pos_account_setup_tokens SET consumed_at = UTC_TIMESTAMP() WHERE user_id = ? AND consumed_at IS NULL',
      [userId]
    );
    await connection.execute(
      `INSERT INTO pos_account_setup_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, hashToken(token), asSqlDate(expiresAt)]
    );
    return token;
  }

  async function provisionPaidCheckout(session, { resendEmail = false, email = '' } = {}) {
    const signupId = String(session?.metadata?.pending_signup_id || '');
    if (!signupId) return null;
    if (
      session.mode !== 'subscription'
      || !['paid', 'no_payment_required'].includes(session.payment_status)
      || !session.subscription
    ) {
      throw serviceError('El pago de la contratación todavía no está confirmado.', 409, 'PAYMENT_NOT_CONFIRMED');
    }

    const connection = await pool.getConnection();
    let delivery = null;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, nombre_org, nombre, apellido, email, telefono, stripe_customer_id,
                stripe_checkout_session_id, status, organization_id, user_id,
                account_email_sent_at, account_email_last_attempt_at,
                (account_email_last_attempt_at IS NULL
                  OR account_email_last_attempt_at <= UTC_TIMESTAMP() - INTERVAL 60 SECOND) AS email_resend_allowed
         FROM pos_pending_signups
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [signupId]
      );
      const signup = rows[0];
      if (!signup) throw serviceError('No se encontró el registro de contratación.', 404, 'SIGNUP_NOT_FOUND');
      if (resendEmail && String(email).trim().toLowerCase() !== signup.email.toLowerCase()) {
        throw serviceError('La referencia de pago o el correo no coinciden con la contratación.', 404, 'SIGNUP_NOT_FOUND');
      }
      if (
        signup.stripe_checkout_session_id !== session.id
        || signup.stripe_customer_id !== (typeof session.customer === 'string' ? session.customer : session.customer?.id)
      ) {
        throw serviceError('La sesión de pago no coincide con la contratación registrada.', 409, 'CHECKOUT_MISMATCH');
      }

      if (signup.status !== 'provisioned') {
        const [existingUsers] = await connection.execute(
          'SELECT id FROM usuarios WHERE LOWER(email) = ? LIMIT 1 FOR UPDATE',
          [signup.email]
        );
        if (existingUsers.length) {
          throw serviceError('El correo ya está asociado a una cuenta. Se requiere revisión para completar la contratación.', 409, 'ACCOUNT_EMAIL_EXISTS');
        }

        const [organizationResult] = await connection.execute(
          'INSERT INTO organizaciones (nombre_org, correo, telefono, activo) VALUES (?, ?, ?, 1)',
          [signup.nombre_org, signup.email, signup.telefono]
        );
        const organizationId = Number(organizationResult.insertId);
        const username = `admin-${randomBytes(8).toString('hex')}`;
        const password = randomBytes(32).toString('base64url');
        const [userResult] = await connection.execute(
          `INSERT INTO usuarios
             (username, password, nombre, apellido, email, numero_empleado, organization_id, role, activo)
           VALUES (?, ?, ?, ?, ?, 1, ?, 'admin', 1)`,
          [username, passwordHasher(password), signup.nombre, signup.apellido, signup.email, organizationId]
        );
        const userId = Number(userResult.insertId);

        await connection.execute(
          `UPDATE pos_pending_signups
           SET status = 'provisioned', organization_id = ?, user_id = ?
           WHERE id = ?`,
          [organizationId, userId, signup.id]
        );
        signup.organization_id = organizationId;
        signup.user_id = userId;
        signup.status = 'provisioned';
      }

      if (resendEmail && !signup.email_resend_allowed) {
        throw serviceError('Espera un minuto antes de solicitar otro envío del correo.', 429, 'EMAIL_RESEND_TOO_SOON');
      }

      if (resendEmail || !signup.account_email_sent_at) {
        const token = await createSetupToken(connection, Number(signup.user_id));
        delivery = {
          signupId: signup.id,
          userId: Number(signup.user_id),
          email: signup.email,
          name: `${signup.nombre} ${signup.apellido}`.trim(),
          username: null,
          organizationName: signup.nombre_org,
          token
        };
        const [userRows] = await connection.execute(
          'SELECT username FROM usuarios WHERE id = ? LIMIT 1',
          [Number(signup.user_id)]
        );
        delivery.username = userRows[0]?.username || '';
        await connection.execute(
          'UPDATE pos_pending_signups SET account_email_last_attempt_at = UTC_TIMESTAMP() WHERE id = ?',
          [signup.id]
        );
      }

      await connection.execute(
        `INSERT INTO pos_subscription_customers (organization_id, stripe_customer_id, email)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id), email = VALUES(email)`,
        [Number(signup.organization_id), signup.stripe_customer_id, signup.email]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return delivery;
  }

  async function sendActivationEmail(delivery) {
    if (!delivery) return;
    if (!emailService?.sendAdminActivation) {
      throw serviceError('El servicio de correo no está disponible.', 503, 'ACCOUNT_EMAIL_UNAVAILABLE');
    }

    const activationUrl = `${String(frontendUrl).replace(/\/+$/, '')}/activar-cuenta?token=${encodeURIComponent(delivery.token)}`;
    try {
      await emailService.sendAdminActivation({
        to: delivery.email,
        name: delivery.name,
        username: delivery.username,
        organizationName: delivery.organizationName,
        activationUrl
      });
    } catch (error) {
      if (error.code === 'ACCOUNT_EMAIL_NOT_CONFIGURED') throw error;
      console.error('[account-email] No se pudo enviar el correo de activación:', error.message);
      throw serviceError(
        'No se pudo enviar el correo. Verifica la configuración SMTP del backend e inténtalo nuevamente en un minuto.',
        503,
        'ACCOUNT_EMAIL_SEND_FAILED'
      );
    }
    await pool.execute(
      `UPDATE pos_pending_signups
       SET account_email_sent_at = UTC_TIMESTAMP()
       WHERE id = ? AND user_id = ?`,
      [delivery.signupId, delivery.userId]
    );
  }

  async function getCheckoutStatus(sessionId) {
    const id = String(sessionId || '').trim();
    if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(id)) {
      throw serviceError('La referencia de pago no es válida.', 400, 'INVALID_CHECKOUT_SESSION');
    }
    const [rows] = await pool.execute(
      `SELECT status, account_email_sent_at
       FROM pos_pending_signups
       WHERE stripe_checkout_session_id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return { status: 'processing' };
    if (rows[0].status === 'provisioned' && rows[0].account_email_sent_at) {
      return { status: 'account_ready' };
    }
    if (rows[0].status === 'provisioned') return { status: 'email_pending' };
    return { status: 'processing' };
  }

  async function activateAccount(tokenValue, passwordValue) {
    const token = String(tokenValue || '').trim();
    const password = String(passwordValue || '');
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      throw serviceError('El enlace de activación no es válido o ya fue utilizado.', 400, 'INVALID_SETUP_TOKEN');
    }
    if (password.length < 10 || password.length > 200) {
      throw serviceError('La contraseña debe tener entre 10 y 200 caracteres.', 422, 'INVALID_PASSWORD');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT token.id, token.user_id, token.expires_at, token.consumed_at,
                (token.expires_at > UTC_TIMESTAMP()) AS is_valid
         FROM pos_account_setup_tokens token
         WHERE token.token_hash = ?
         LIMIT 1
         FOR UPDATE`,
        [hashToken(token)]
      );
      const setupToken = rows[0];
      if (
        !setupToken
        || setupToken.consumed_at
        || !setupToken.is_valid
      ) {
        throw serviceError('El enlace de activación venció o ya fue utilizado. Solicita uno nuevo.', 400, 'INVALID_SETUP_TOKEN');
      }

      await connection.execute(
        'UPDATE usuarios SET password = ?, activo = 1 WHERE id = ?',
        [passwordHasher(password), Number(setupToken.user_id)]
      );
      await connection.execute(
        'UPDATE pos_account_setup_tokens SET consumed_at = UTC_TIMESTAMP() WHERE id = ?',
        [Number(setupToken.id)]
      );
      await connection.commit();
      return { activated: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  return {
    createCheckout,
    provisionPaidCheckout,
    sendActivationEmail,
    getCheckoutStatus,
    activateAccount
  };
}
