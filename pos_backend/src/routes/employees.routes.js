import express from 'express';
import requireAuth from '../middleware/auth.js';
import { employeeService } from '../services/employeeService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'No autorizado para gestionar empleados' });
  }
  return next();
};

const getOrgScope = (req) => ({ organizationId: Number(req.user?.organizationId || 1) });

router.get('/', requireAuth, async (req, res) => {
  console.log('[EMPLOYEES /] listando empleados');
  const employees = await employeeService.list({ ...req.query, ...getOrgScope(req) });
  return res.json(jsonSuccess(employees));
});

router.get('/:id', requireAuth, async (req, res) => {
  const employee = await employeeService.findById(req.params.id, Number(req.user?.organizationId || 1));
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  return res.json(jsonSuccess(employee));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  console.log('[EMPLOYEES / POST] creando empleado con payload:', req.body);
  const employee = await employeeService.create(req.body || {}, req.user);
  if (!employee || employee.error) {
    return res.status(employee?.status || 503).json({ success: false, message: employee?.error || 'No se pudo crear el empleado en la base de datos' });
  }

  console.log('[EMPLOYEES / POST] empleado creado:', employee.id, employee.username);
  return res.status(201).json(jsonSuccess({
    ...employee,
    temporaryPassword: employee.temporaryPassword || '1234',
    message: 'La contraseña es temporal y debe cambiarse en el primer inicio de sesión.'
  }));
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  console.log('[EMPLOYEES /:id PATCH] actualizando empleado:', id, 'payload:', req.body);
  const employee = await employeeService.update(id, req.body || {}, req.user);
  if (!employee) {
    console.warn('[EMPLOYEES /:id PATCH] empleado no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  if (employee.error) {
    return res.status(employee.status || 400).json({ success: false, message: employee.error });
  }

  console.log('[EMPLOYEES /:id PATCH] empleado actualizado:', employee.id);
  return res.json(jsonSuccess(employee));
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  console.log('[EMPLOYEES /:id PUT] actualizando empleado:', id, 'payload:', req.body);
  const employee = await employeeService.update(id, req.body || {}, req.user);
  if (!employee) {
    console.warn('[EMPLOYEES /:id PUT] empleado no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  if (employee.error) {
    return res.status(employee.status || 400).json({ success: false, message: employee.error });
  }

  return res.json(jsonSuccess(employee));
});

router.post('/:id/activate', requireAuth, requireAdmin, async (req, res) => {
  const employee = await employeeService.activate(req.params.id, req.user);
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  if (employee.error) {
    return res.status(employee.status || 500).json({ success: false, message: employee.error });
  }
  return res.json(jsonSuccess(employee));
});

router.post('/:id/deactivate', requireAuth, requireAdmin, async (req, res) => {
  const employee = await employeeService.deactivate(req.params.id, req.user);
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  if (employee.error) {
    return res.status(employee.status || 500).json({ success: false, message: employee.error });
  }
  return res.json(jsonSuccess(employee));
});

router.post('/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const employee = await employeeService.resetPassword(req.params.id, req.body || {}, req.user);
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }
  if (employee.error) {
    return res.status(employee.status || 500).json({ success: false, message: employee.error });
  }
  return res.json(jsonSuccess(employee));
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  console.log('[EMPLOYEES /:id DELETE] eliminando empleado:', id);
  const employee = await employeeService.remove(id);
  if (!employee) {
    console.warn('[EMPLOYEES /:id DELETE] empleado no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
  }

  console.log('[EMPLOYEES /:id DELETE] empleado eliminado:', employee.id);
  return res.json(jsonSuccess({ deleted: true, id: employee.id }));
});

export default router;
