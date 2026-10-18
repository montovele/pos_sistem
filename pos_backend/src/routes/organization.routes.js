import express from 'express';
import requireAuth from '../middleware/auth.js';
import { jsonSuccess } from '../utils/response.js';
import { organizations } from '../data/demoData.js';

const router = express.Router();

const getOrganizationPayload = (user) => ({
  id: Number(user?.organizationId || 1),
  name: user?.organizationName || 'Empresa Demo',
  taxId: 'XAXX010101000',
  email: 'contacto@empresa-demo.local',
  phone: '5550000000',
  address: 'Centro, CDMX',
  logoUrl: '',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  status: 'active',
  ownerUserId: user?.id || 1
});

router.get('/', requireAuth, (req, res) => {
  const organization = getOrganizationPayload(req.user);
  return res.json(jsonSuccess(organization));
});

router.patch('/', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'No autorizado para editar la organización' });
  }

  const nextOrganization = { ...getOrganizationPayload(req.user), ...req.body };
  return res.json(jsonSuccess(nextOrganization));
});

router.get('/settings', requireAuth, (_req, res) => {
  const settings = {
    general: {
      name: 'Empresa Demo',
      phone: '5550000000',
      email: 'contacto@empresa-demo.local',
      address: 'Centro, CDMX',
      logoUrl: ''
    },
    fiscal: {
      taxId: 'XAXX010101000',
      regime: '601',
      invoiceSeries: 'A'
    },
    sales: {
      currency: 'MXN',
      taxes: 0.16,
      discounts: true,
      cashOnly: false,
      saleByWeight: true
    },
    receipt: {
      header: 'Empresa Demo',
      footer: 'Gracias por su compra',
      folio: 1,
      format: 'thermal'
    },
    hardware: {
      printers: [],
      localAgent: 'disabled',
      devices: []
    },
    backup: {
      enabled: false,
      retentionDays: 7,
      frequency: 'daily'
    }
  };

  return res.json(jsonSuccess(settings));
});

router.patch('/settings/:section', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'No autorizado para editar configuración' });
  }

  const validSections = ['general', 'fiscal', 'sales', 'receipt', 'hardware', 'backup'];
  const section = String(req.params.section || '').toLowerCase();

  if (!validSections.includes(section)) {
    return res.status(400).json({ success: false, message: 'Sección no válida' });
  }

  const currentSetting = {
    general: { name: 'Empresa Demo', phone: '5550000000', email: 'contacto@empresa-demo.local', address: 'Centro, CDMX', logoUrl: '' },
    fiscal: { taxId: 'XAXX010101000', regime: '601', invoiceSeries: 'A' },
    sales: { currency: 'MXN', taxes: 0.16, discounts: true, cashOnly: false, saleByWeight: true },
    receipt: { header: 'Empresa Demo', footer: 'Gracias por su compra', folio: 1, format: 'thermal' },
    hardware: { printers: [], localAgent: 'disabled', devices: [] },
    backup: { enabled: false, retentionDays: 7, frequency: 'daily' }
  };

  const previous = currentSetting[section];
  const next = { ...previous, ...(req.body || {}) };

  return res.json(jsonSuccess({
    section,
    previous,
    current: next,
    updatedBy: req.user.id,
    updatedAt: new Date().toISOString()
  }));
});

router.get('/summary', requireAuth, (req, res) => {
  const organization = getOrganizationPayload(req.user);
  return res.json(jsonSuccess({
    organization,
    employeesCount: 2,
    status: 'active',
    lastUpdatedAt: new Date().toISOString()
  }));
});

export default router;
