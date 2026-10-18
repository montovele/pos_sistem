import express from 'express';
import requireAuth from '../middleware/auth.js';
import { authService } from '../services/authService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  console.log('[AUTH /login] petición recibida:', {
    username,
    hasPassword: Boolean(password),
    mysqlAvailable: Boolean(global.mysqlAvailable)
  });

  if (!username || !password) {
    console.warn('[AUTH /login] faltan credenciales');
    return res.status(400).json({ success: false, message: 'Usuario y contraseña obligatorios' });
  }

  const result = await authService.login({ username, password }, global.mysqlAvailable || false);

  if (result.error) {
    console.error('[AUTH /login] error de login:', result.error);
    return res.status(result.status || 400).json({ success: false, message: result.error });
  }

  console.log('[AUTH /login] login exitoso:', {
    username: result.user?.username,
    userId: result.user?.id,
    mode: global.mysqlAvailable ? 'mysql' : 'demo'
  });
  return res.json(jsonSuccess({
    token: result.token,
    user: result.user
  }));
});

router.post('/logout', (_req, res) => {
  console.log('[AUTH /logout] cierre de sesión solicitado');
  res.json(jsonSuccess({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  console.log('[AUTH /me] obteniendo usuario autenticado');
  res.json(jsonSuccess(req.user));
});

router.get('/current-user', requireAuth, (req, res) => {
  console.log('[AUTH /current-user] consultando usuario actual');
  res.json(jsonSuccess(req.user));
});

router.get('/verify-token', requireAuth, (_req, res) => {
  console.log('[AUTH /verify-token] validación de token');
  res.json(jsonSuccess({ valid: true }));
});

export default router;
