import { canAssignRole } from '../utils/rolePermissions.js';

export function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperAdminRole(role) {
  return role === 'superadmin';
}

export function requireAdmin(req, res, next) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ success: false, code: 'ADMIN_REQUIRED', message: 'Se requiere acceso administrativo.' });
  }
  return next();
}

export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdminRole(req.user?.role)) {
    return res.status(403).json({ success: false, code: 'SUPERADMIN_REQUIRED', message: 'Solo un superadministrador puede asignar este rol.' });
  }
  return next();
}

export function requireAssignableRole(req, res, next) {
  const targetRole = String(req.body?.role || 'cashier');
  if (!canAssignRole(req.user?.role, targetRole)) {
    return res.status(403).json({
      success: false,
      code: 'ROLE_ASSIGNMENT_FORBIDDEN',
      message: 'No tienes permisos para asignar ese rol.'
    });
  }
  return next();
}
