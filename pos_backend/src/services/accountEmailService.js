import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultMailEngineEnvPath = path.resolve(serviceDirectory, '../../../MailEngine/.env');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

export function loadMailEnvironment({
  envPath = process.env.MAILENGINE_ENV_PATH || defaultMailEngineEnvPath,
  processEnvironment = process.env
} = {}) {
  let mailEngineEnv = {};
  try {
    mailEngineEnv = dotenv.parse(readFileSync(envPath));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`No se pudo leer la configuración SMTP de MailEngine (${envPath}): ${error.message}`, {
        cause: error
      });
    }
  }

  const nonEmptyProcessEnvironment = Object.fromEntries(
    Object.entries(processEnvironment).filter(([, value]) => String(value || '').trim() !== '')
  );
  return { ...mailEngineEnv, ...nonEmptyProcessEnvironment };
}

export function createAccountEmailService(env, createTransport = nodemailer.createTransport, environmentOptions) {
  const settings = env || loadMailEnvironment(environmentOptions);
  return {
    async sendAdminActivation({ to, name, username, organizationName, activationUrl }) {
      const provider = String(settings.MAIL_PROVIDER || '').trim().toLowerCase();
      const ionos = provider === 'ionos';
      const host = ionos
        ? settings.SMTP_HOST_IONOS || 'smtp.ionos.com'
        : settings.SMTP_HOST_HostGator || settings.SMTP_HOST;
      const user = ionos
        ? settings.SMTP_USER_IONOS || 'noreply@lemarquet.com'
        : settings.SMTP_USER_HostGator || settings.SMTP_USER;
      const password = ionos
        ? settings.SMTP_PASS_IONOS
        : settings.SMTP_PASS_HostGator || settings.SMTP_PASSWORD_HostGator
          || settings.SMTP_PASS || settings.SMTP_PASSWORD;
      const from = ionos
        ? settings.SMTP_FROM_IONOS || 'noreply@lemarquet.com'
        : settings.SMTP_FROM_HostGator || settings.SMTP_FROM || settings.EMAIL_FROM;
      const port = Number(ionos
        ? settings.SMTP_PORT_IONOS || 587
        : settings.SMTP_PORT_HostGator || settings.SMTP_PORT || 587);
      const secureSetting = ionos
        ? settings.SMTP_SECURE_IONOS
        : settings.SMTP_SECURE_HostGator || settings.SMTP_SECURE;
      const secure = String(secureSetting ?? (ionos ? 'false' : '')).toLowerCase() === 'true';

      if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw Object.assign(new Error('El servicio de correo no está configurado para enviar el acceso.'), {
          status: 503,
          code: 'ACCOUNT_EMAIL_NOT_CONFIGURED'
        });
      }

      const fromName = (ionos ? settings.SMTP_FROM_NAME_IONOS : '')
        || settings.SMTP_FROM_NAME_HostGator || settings.SMTP_FROM_NAME || 'LEMARQUET POS';
      const safeName = escapeHtml(name);
      const safeOrganizationName = escapeHtml(organizationName);
      const safeUsername = escapeHtml(username);
      const safeActivationUrl = escapeHtml(activationUrl);
      const transporter = createTransport({
        host,
        port,
        secure,
        requireTLS: String(ionos
          ? settings.SMTP_REQUIRE_TLS_IONOS || settings.SMTP_REQUIRE_TLS || ''
          : settings.SMTP_REQUIRE_TLS_HostGator || settings.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true',
        ignoreTLS: String(ionos
          ? settings.SMTP_IGNORE_TLS_IONOS || settings.SMTP_IGNORE_TLS || ''
          : settings.SMTP_IGNORE_TLS_HostGator || settings.SMTP_IGNORE_TLS || '').toLowerCase() === 'true',
        tls: { rejectUnauthorized: false },
        auth: { user, pass: password }
      });

      try {
        const result = await transporter.sendMail({
          from: {
            name: fromName,
            address: from
          },
          to,
          subject: 'Activa la cuenta de administrador de tu POS',
          text: [
            `Hola ${name},`,
            '',
            `Tu pago para ${organizationName} fue confirmado y la cuenta de administrador ya está lista.`,
            `Usuario: ${username}`,
            '',
            'Por seguridad, elige tu contraseña desde este enlace de un solo uso, válido durante 24 horas:',
            activationUrl,
            '',
            'Si no solicitaste esta cuenta, puedes ignorar este mensaje.'
          ].join('\n'),
          html: `
            <div style="margin:0;background:#f4f6fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
              <div style="max-width:560px;margin:0 auto;border:1px solid #e5e9f1;border-radius:14px;background:#fff;padding:32px">
                <p style="margin:0 0 12px;color:#5269b0;font-size:12px;font-weight:bold;letter-spacing:1px">LEMARQUET POS</p>
                <h1 style="margin:0 0 16px;font-size:24px">Tu cuenta está lista</h1>
                <p>Hola ${safeName}, confirmamos el pago y preparamos el acceso de administrador para <strong>${safeOrganizationName}</strong>.</p>
                <p>Tu nombre de usuario es <strong>${safeUsername}</strong>.</p>
                <p>Para proteger tu cuenta, establece una contraseña personal con el siguiente enlace de un solo uso. Vence en 24 horas.</p>
                <p style="margin:28px 0">
                  <a href="${safeActivationUrl}" style="display:inline-block;border-radius:8px;background:#3158d8;padding:14px 20px;color:#fff;text-decoration:none;font-weight:bold">Crear mi contraseña</a>
                </p>
                <p style="color:#647084;font-size:12px;line-height:1.6">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${safeActivationUrl}">${safeActivationUrl}</a></p>
                <p style="color:#647084;font-size:12px">Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
              </div>
            </div>`
        });
        console.info('[account-email] Correo de activación enviado:', {
          messageId: result.messageId,
          response: result.response
        });
        return result;
      } catch (error) {
        console.error('[account-email] Falló el envío SMTP:', {
          code: error.code || 'SMTP_SEND_FAILED',
          command: error.command || null,
          responseCode: error.responseCode || null,
          message: error.message
        });
        throw Object.assign(new Error('El servidor SMTP rechazó o no pudo entregar el correo de activación.'), {
          status: 503,
          code: error.code || 'SMTP_SEND_FAILED',
          cause: error
        });
      } finally {
        await transporter.close();
      }
    }
  };
}
