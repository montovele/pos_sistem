import { getPool } from '../config/database.js';
import { demoUsers } from '../data/demoData.js';

export const authService = {
  async login({ username, password }, mysqlAvailable) {
    console.log('[AUTH SERVICE] iniciando autenticación:', {
      username,
      mode: mysqlAvailable ? 'mysql' : 'demo'
    });

    if (!mysqlAvailable) {
      const user = demoUsers.find((item) => String(item.username).toLowerCase() === String(username || '').toLowerCase());
      console.log('[AUTH SERVICE] búsqueda en usuarios demo:', user ? 'usuario encontrado' : 'usuario no encontrado');

      if (!user || String(user.password || '') !== String(password || '')) {
        console.warn('[AUTH SERVICE] credenciales demo rechazadas');
        return { error: 'Credenciales inválidas', status: 401 };
      }

      console.log('[AUTH SERVICE] autenticación demo exitosa:', user.username);
      return {
        token: `demo-token-${user.id}`,
        user: {
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
        }
      };
    }

    try {
      console.log('[AUTH SERVICE] consultando usuario en MySQL:', username);
      const [rows] = await getPool().execute(
        `SELECT u.id, u.username, u.password, u.nombre, u.apellido, u.email, u.numero_empleado,
                u.organization_id, o.nombre_org AS organization_name, u.role, u.activo
         FROM usuarios u
         LEFT JOIN organizaciones o ON o.id = u.organization_id
         WHERE u.username = ? LIMIT 1`,
        [username]
      );

      const user = rows[0];
      console.log('[AUTH SERVICE] resultado de consulta MySQL:', user ? 'usuario encontrado' : 'usuario no encontrado');

      if (!user || String(user.password) !== String(password)) {
        console.warn('[AUTH SERVICE] credenciales MySQL rechazadas');
        return { error: 'Credenciales inválidas', status: 401 };
      }

      console.log('[AUTH SERVICE] autenticación MySQL exitosa:', user.username);
      const organizationName = user.organization_name || user.organizationName || 'Empresa Demo';
      return {
        token: `db-token-${user.id}`,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nombreEmpleado: `${user.nombre || ''} ${user.apellido || ''}`.trim() || user.username,
          numeroEmpleado: Number(user.numero_empleado || 0),
          organizationId: Number(user.organization_id || 1),
          organizationName,
          role: user.role || 'admin',
          active: user.activo !== false,
          photo: ''
        }
      };
    } catch (error) {
      console.error('Error al consultar usuarios en MySQL:', error.message);
      return { error: 'Error de autenticación en la base de datos', status: 500 };
    }
  }
};
