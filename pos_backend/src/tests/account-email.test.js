import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountEmailService } from '../services/accountEmailService.js';

test('sends activation email using SMTP_PASSWORD and EMAIL_FROM environment names', async () => {
  let transportConfig;
  let message;
  let closed = false;
  const service = createAccountEmailService({
    SMTP_HOST: 'mail.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'pos@example.com',
    SMTP_PASSWORD: 'smtp-password',
    EMAIL_FROM: 'pos@example.com',
    FRONTEND_URL: 'https://pos.example.com'
  }, (config) => {
    transportConfig = config;
    return {
      sendMail: async (value) => { message = value; return { messageId: 'message-id' }; },
      close: () => { closed = true; }
    };
  });

  await service.sendAdminActivation({
    to: 'customer@example.com',
    name: 'Customer',
    username: 'admin-customer',
    organizationName: 'Customer shop',
    activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
  });

  assert.deepEqual(transportConfig, {
    host: 'mail.example.com',
    port: 465,
    secure: true,
    requireTLS: false,
    ignoreTLS: false,
    tls: { rejectUnauthorized: false },
    auth: { user: 'pos@example.com', pass: 'smtp-password' }
  });
  assert.equal(message.from.address, 'pos@example.com');
  assert.equal(message.to, 'customer@example.com');
  assert.match(message.text, /admin-customer/);
  assert.equal(closed, true);
});

test('reports incomplete SMTP settings as a service-unavailable error', async () => {
  const service = createAccountEmailService({}, () => {
    throw new Error('Transport must not be constructed without settings');
  });

  await assert.rejects(
    service.sendAdminActivation({
      to: 'customer@example.com',
      name: 'Customer',
      username: 'admin-customer',
      organizationName: 'Customer shop',
      activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
    }),
    (error) => error.status === 503 && error.code === 'ACCOUNT_EMAIL_NOT_CONFIGURED'
  );
});

test('loads MailEngine SMTP settings from its env file without exposing values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pos-mail-config-'));
  const envPath = path.join(directory, '.env');
  let transportConfig;
  try {
    await writeFile(envPath, [
      'SMTP_HOST_HostGator=mail.example.com',
      'SMTP_PORT_HostGator=465',
      'SMTP_SECURE_HostGator=true',
      'SMTP_USER_HostGator=pos@example.com',
      'SMTP_PASS_HostGator=mail-secret',
      'SMTP_FROM_HostGator=pos@example.com',
      'SMTP_FROM_NAME_HostGator=LEMARQUET POS'
    ].join('\n'));

    const service = createAccountEmailService(undefined, (config) => {
      transportConfig = config;
      return {
        sendMail: async () => ({ messageId: 'message-id' }),
        close: () => {}
      };
    }, { envPath, processEnvironment: {} });

    await service.sendAdminActivation({
      to: 'customer@example.com',
      name: 'Customer',
      username: 'admin-customer',
      organizationName: 'Customer shop',
      activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
    });

    assert.deepEqual(transportConfig, {
      host: 'mail.example.com',
      port: 465,
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
      tls: { rejectUnauthorized: false },
      auth: { user: 'pos@example.com', pass: 'mail-secret' }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('prefers MailEngine HostGator credentials over backend generic SMTP settings', async () => {
  let transportConfig;
  const service = createAccountEmailService({
    SMTP_HOST: 'backend-host.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'backend-user@example.com',
    SMTP_PASSWORD: 'backend-password',
    EMAIL_FROM: 'backend-from@example.com',
    SMTP_HOST_HostGator: 'engine-host.example.com',
    SMTP_PORT_HostGator: '465',
    SMTP_SECURE_HostGator: 'true',
    SMTP_USER_HostGator: 'engine-user@example.com',
    SMTP_PASS_HostGator: 'engine-password',
    SMTP_FROM_HostGator: 'engine-from@example.com',
    SMTP_FROM_NAME_HostGator: 'MailEngine POS'
  }, (config) => {
    transportConfig = config;
    return {
      sendMail: async () => ({ messageId: 'message-id' }),
      close: () => {}
    };
  });

  await service.sendAdminActivation({
    to: 'customer@example.com',
    name: 'Customer',
    username: 'admin-customer',
    organizationName: 'Customer shop',
    activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
  });

  assert.equal(transportConfig.host, 'engine-host.example.com');
  assert.equal(transportConfig.port, 465);
  assert.equal(transportConfig.secure, true);
  assert.deepEqual(transportConfig.auth, {
    user: 'engine-user@example.com',
    pass: 'engine-password'
  });
});

test('uses IONOS SMTP profile and noreply sender when MailEngine selects IONOS', async () => {
  let transportConfig;
  let message;
  const service = createAccountEmailService({
    MAIL_PROVIDER: 'ionos',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'gmail-user@example.com',
    SMTP_PASS: 'ionos-mailbox-password',
    SMTP_FROM: 'gmail-user@example.com',
    SMTP_HOST_HostGator: 'smtp.titan.email',
    SMTP_USER_HostGator: 'legacy@example.com',
    SMTP_PASS_HostGator: 'old-password',
    SMTP_FROM_HostGator: 'legacy@example.com',
    SMTP_USER_IONOS: 'noreply@lemarquet.com',
    SMTP_PASS_IONOS: 'ionos-mailbox-password',
    SMTP_FROM_IONOS: 'noreply@lemarquet.com'
  }, (config) => {
    transportConfig = config;
    return {
      sendMail: async (value) => { message = value; return { messageId: 'message-id' }; },
      close: () => {}
    };
  });

  await service.sendAdminActivation({
    to: 'customer@example.com',
    name: 'Customer',
    username: 'admin-customer',
    organizationName: 'Customer shop',
    activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
  });

  assert.equal(transportConfig.host, 'smtp.ionos.com');
  assert.equal(transportConfig.port, 587);
  assert.equal(transportConfig.secure, false);
  assert.equal(transportConfig.auth.user, 'noreply@lemarquet.com');
  assert.equal(transportConfig.auth.pass, 'ionos-mailbox-password');
  assert.equal(message.from.address, 'noreply@lemarquet.com');
});

test('requires a dedicated IONOS SMTP password instead of reusing another provider password', async () => {
  const service = createAccountEmailService({
    MAIL_PROVIDER: 'ionos',
    SMTP_PASS: 'password-for-another-provider'
  }, () => {
    throw new Error('Transport must not be constructed with another provider password');
  });

  await assert.rejects(
    service.sendAdminActivation({
      to: 'customer@example.com',
      name: 'Customer',
      username: 'admin-customer',
      organizationName: 'Customer shop',
      activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
    }),
    (error) => error.code === 'ACCOUNT_EMAIL_NOT_CONFIGURED'
  );
});

test('reports SMTP delivery errors and closes the transporter', async () => {
  let closed = false;
  const service = createAccountEmailService({
    SMTP_HOST: 'mail.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'pos@example.com',
    SMTP_PASS: 'smtp-password',
    SMTP_FROM: 'pos@example.com'
  }, () => ({
    sendMail: async () => {
      throw Object.assign(new Error('SMTP connection refused'), { code: 'ECONNECTION' });
    },
    close: () => { closed = true; }
  }));

  await assert.rejects(
    service.sendAdminActivation({
      to: 'customer@example.com',
      name: 'Customer',
      username: 'admin-customer',
      organizationName: 'Customer shop',
      activationUrl: 'https://pos.example.com/activar-cuenta?token=secure-token'
    }),
    (error) => error.status === 503 && error.code === 'ECONNECTION'
  );
  assert.equal(closed, true);
});
