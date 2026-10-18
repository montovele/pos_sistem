import express from 'express';
import requireAuth from '../middleware/auth.js';
import { cajaService } from '../services/cajaService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();
const handleError = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message });

router.get('/status', requireAuth, async (req, res) => {
  try { return res.json(jsonSuccess(await cajaService.getStatus(req.user))); } catch (error) { return handleError(res, error); }
});

router.post('/open', requireAuth, async (req, res) => {
  try { return res.status(201).json(jsonSuccess(await cajaService.abrir(req.body || {}, req.user))); } catch (error) { return handleError(res, error); }
});

router.post('/close', requireAuth, async (req, res) => {
  try { return res.json(jsonSuccess(await cajaService.cerrar(req.body || {}, req.user))); } catch (error) { return handleError(res, error); }
});

router.get('/arqueo', requireAuth, async (req, res) => {
  try { return res.json(jsonSuccess(await cajaService.obtenerArqueo(req.user))); } catch (error) { return handleError(res, error); }
});

router.post('/arqueo', requireAuth, async (req, res) => {
  try { return res.json(jsonSuccess(await cajaService.guardarArqueo(req.body || {}, req.user))); } catch (error) { return handleError(res, error); }
});

router.get('/ventas', requireAuth, async (req, res) => {
  try {
    const ventas = await cajaService.obtenerVentas(req.user);
    console.log('[CAJA /ventas] sesión:', req.user.numeroEmpleado, 'ventas persistidas:', ventas.length);
    return res.json(jsonSuccess(ventas));
  } catch (error) { return handleError(res, error); }
});

router.get('/history', requireAuth, async (req, res) => {
  try { return res.json(jsonSuccess(await cajaService.obtenerHistorial(req.user))); } catch (error) { return handleError(res, error); }
});

export default router;
