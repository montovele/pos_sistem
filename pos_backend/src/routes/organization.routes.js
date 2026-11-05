import express from 'express';
import requireAuth from '../middleware/auth.js';
import { jsonSuccess } from '../utils/response.js';
import { requireAdmin } from '../middleware/roles.js';
import { organizationService } from '../services/organizationService.js';

const router = express.Router();
const getOrganizationId = (req) => Number(req.user?.organizationId);

const sendError = (res, error) => res.status(error.status || 500).json({
  success: false,
  message: error.status ? error.message : 'No se pudo consultar la información de la organización.'
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const organization = await organizationService.get(getOrganizationId(req));
    if (!organization) return res.status(404).json({ success: false, message: 'No se encontró la organización.' });
    return res.json(jsonSuccess(organization));
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const organization = await organizationService.update(getOrganizationId(req), req.body || {});
    if (!organization) return res.status(404).json({ success: false, message: 'No se encontró la organización.' });
    return res.json(jsonSuccess(organization));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const organization = await organizationService.get(getOrganizationId(req));
    if (!organization) return res.status(404).json({ success: false, message: 'No se encontró la organización.' });
    return res.json(jsonSuccess({
      general: {
        name: organization.name,
        taxId: organization.taxId,
        email: organization.email,
        phone: organization.phone,
        address: organization.address
      }
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const summary = await organizationService.getSummary(getOrganizationId(req));
    if (!summary) return res.status(404).json({ success: false, message: 'No se encontró la organización.' });
    return res.json(jsonSuccess(summary));
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
