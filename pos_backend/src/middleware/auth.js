import { getPool } from '../config/database.js';
import { demoUsers } from '../data/demoData.js';

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  console.log('[AUTH] validando token para ruta:', req.originalUrl);

  if (!token) {
    console.warn('[AUTH] token ausente en:', req.originalUrl);
    return res.status(401).json({ success: false, message: 'Token requerido' });
  }

  try {
    if (!global.mysqlAvailable) {
      const demoMatch = String(token).match(/^demo-token-(\d+)$/i);
      if (!demoMatch) {
        return res.status(401).json({ success: false, message: 'Token inválido' });
      }

      const user = demoUsers.find((item) => item.id === Number(demoMatch[1]));
      if (!user) {
        return res.status(401).json({ success: false, message: 'Usuario demo no encontrado' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        nombreEmpleado: user.nombreEmpleado || user.username,
        numeroEmpleado: Number(user.numeroEmpleado || 0),
        organizationId: Number(user.organizationId || 1),
        organizationName: user.organizationName || 'Empresa Demo',
        role: user.role || 'admin',
        active: user.active !== false && user.activo !== false,
        photo: user.photo || ''
      };
      req.organization = { id: req.user.organizationId, name: req.user.organizationName || 'Empresa Demo', status: 'active' };

      console.log('[AUTH] usuario demo autenticado:', req.user.username, 'ruta:', req.originalUrl);
      return next();
    }

    const match = String(token).match(/^db-token-(\d+)$/i);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }

    const [rows] = await getPool().execute(
      `SELECT u.id, u.username, u.nombre, u.apellido, u.email, u.numero_empleado,
              u.organization_id, o.nombre_org AS organization_name, u.role, u.activo
       FROM usuarios u
       LEFT JOIN organizaciones o ON o.id = u.organization_id
       WHERE u.id = ? LIMIT 1`,
      [Number(match[1])]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      nombreEmpleado: `${user.nombre || ''} ${user.apellido || ''}`.trim() || user.username,
      numeroEmpleado: Number(user.numero_empleado || 0),
      organizationId: Number(user.organization_id || 1),
      organizationName: user.organization_name || user.organizationName || 'Empresa Demo',
      role: user.role || 'admin',
      active: user.activo !== false,
      photo: ''
    };
    req.organization = { id: req.user.organizationId, name: req.user.organizationName || 'Empresa Demo', status: 'active' };

    console.log('[AUTH] usuario autenticado:', req.user.username, 'ruta:', req.originalUrl);
    return next();
  } catch (error) {
    console.error('[AUTH] Error validando token:', error.message);
    return res.status(500).json({ success: false, message: 'Error al validar autenticación' });
  }
};

export default requireAuth;
