import { getPool } from '../config/database.js';
import { demoUsers } from '../data/demoData.js';

const normalizeEmployee = (row) => ({
  id: Number(row.id),
  username: row.username || '',
  nombreEmpleado: `${row.nombre || row.firstName || ''} ${row.apellido || row.lastName || ''}`.trim() || row.nombreEmpleado || row.username || '',
  firstName: row.first_name || row.nombre || row.firstName || '',
  lastName: row.last_name || row.apellido || row.lastName || '',
  numeroEmpleado: Number(row.numero_empleado ?? row.numeroEmpleado ?? 0),
  employeeNumber: String(row.numero_empleado ?? row.numeroEmpleado ?? '0'),
  role: row.role || 'admin',
  email: row.email || '',
  active: row.active !== undefined ? Boolean(row.active) : Number(row.activo ?? 1) === 1,
  activo: row.activo !== undefined ? Number(row.activo) === 1 : Number(row.activo ?? 1) === 1,
  organizationId: Number(row.organization_id ?? row.organizationId ?? 1),
  organizationName: row.organization_name || row.organizationName || 'Empresa Demo',
  photo: row.photo || '',
  passwordHash: undefined
});

const getDemoEmployees = (filters = {}) => {
  let rows = [...demoUsers];
  const organizationId = Number(filters.organizationId ?? 1);
  rows = rows.filter((user) => Number(user.organizationId ?? 1) === organizationId);

  if (filters.role) {
    const role = String(filters.role).toLowerCase();
    rows = rows.filter((user) => String(user.role || '').toLowerCase() === role);
  }

  if (filters.active !== undefined) {
    const active = String(filters.active).toLowerCase() === 'true' || Number(filters.active) === 1;
    rows = rows.filter((user) => Boolean(user.active ?? user.activo) === active);
  }

  if (filters.search) {
    const term = String(filters.search).toLowerCase();
    rows = rows.filter((user) => [user.username, user.nombreEmpleado, user.email].some((value) => String(value || '').toLowerCase().includes(term)));
  }

  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.max(1, Number(filters.limit || rows.length || 10));
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);

  return {
    data: paged.map((user) => normalizeEmployee(user)),
    total: rows.length,
    page,
    perPage: limit,
    totalPages: Math.max(1, Math.ceil(rows.length / limit))
  };
};

export const employeeService = {
  async list(filters = {}) {
    if (!global.mysqlAvailable) {
      return getDemoEmployees(filters).data;
    }

    try {
      const organizationId = Number(filters.organizationId ?? 1);
      const page = Math.max(1, Number(filters.page || 1));
      const limit = Math.max(1, Number(filters.limit || 10));
      const offset = (page - 1) * limit;
      let query = 'SELECT id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo FROM usuarios WHERE organization_id = ?';
      const params = [organizationId];

      if (filters.role) {
        query += ' AND role = ?';
        params.push(String(filters.role));
      }

      if (filters.active !== undefined) {
        query += ' AND activo = ?';
        params.push(String(filters.active) === 'true' || Number(filters.active) === 1 ? 1 : 0);
      }

      if (filters.search) {
        query += ' AND (username LIKE ? OR email LIKE ? OR nombre LIKE ? OR apellido LIKE ?)';
        const term = `%${String(filters.search)}%`;
        params.push(term, term, term, term);
      }

      query += ' ORDER BY id ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows] = await getPool().execute(query, params);
      return rows.map(normalizeEmployee);
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error consultando empleados:', error.message);
      return [];
    }
  },

  async findById(id, organizationId = 1) {
    if (!global.mysqlAvailable) {
      const record = demoUsers.find((user) => Number(user.id) === Number(id) && Number(user.organizationId ?? 1) === Number(organizationId));
      return record ? normalizeEmployee(record) : null;
    }

    try {
      const [rows] = await getPool().execute(
        'SELECT id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo FROM usuarios WHERE id = ? AND organization_id = ? LIMIT 1',
        [Number(id), Number(organizationId)]
      );
      return rows[0] ? normalizeEmployee(rows[0]) : null;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error buscando empleado:', error.message);
      return null;
    }
  },

  async create(payload = {}, actor = {}) {
    const organizationId = Number(actor.organizationId || payload.organizationId || payload.organizacionId || 1);
    const role = String(payload.role || 'cashier');

    if (role !== 'cashier') {
      return { error: 'Solo se permite crear cajeros en esta versión', status: 400 };
    }

    if (!global.mysqlAvailable) {
      const username = String(payload.username || payload.userName || `emp-${Date.now()}`).trim();
      const firstName = String(payload.firstName || payload.nombre || 'Empleado');
      const lastName = String(payload.lastName || payload.apellido || 'Nuevo');
      const email = String(payload.email || `${username}@pos.local`);
      const employeeNumber = String(payload.employeeNumber ?? payload.numeroEmpleado ?? String(Date.now()).slice(-4));
      const temporaryPassword = String(payload.temporaryPassword || payload.password || '1234');
      const newUser = {
        id: Math.max(...demoUsers.map((item) => Number(item.id || 0))) + 1,
        username,
        password: temporaryPassword,
        nombreEmpleado: `${firstName} ${lastName}`.trim(),
        nombre: firstName,
        apellido: lastName,
        email,
        numeroEmpleado: Number(employeeNumber),
        role: 'cashier',
        active: true,
        activo: true,
        organizationId,
        organizationName: 'Empresa Demo',
        photo: ''
      };
      demoUsers.push(newUser);
      return normalizeEmployee(newUser);
    }

    try {
      const username = String(payload.username || payload.userName || `emp-${Date.now()}`).trim();
      const nombre = String(payload.firstName || payload.nombre || 'Empleado');
      const apellido = String(payload.lastName || payload.apellido || 'Nuevo');
      const email = String(payload.email || `${username}@pos.local`);
      const numeroEmpleado = Number(payload.employeeNumber ?? payload.numeroEmpleado ?? 100 + Math.floor(Math.random() * 900));
      const activo = payload.active !== false && payload.activo !== false ? 1 : 0;
      const password = String(payload.temporaryPassword || payload.password || '1234');

      const [result] = await getPool().execute(
        `INSERT INTO usuarios (username, password, nombre, apellido, email, numero_empleado, organization_id, role, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, password, nombre, apellido, email, numeroEmpleado, organizationId, role, activo]
      );

      const [rows] = await getPool().execute(
        'SELECT id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo FROM usuarios WHERE id = ? LIMIT 1',
        [result.insertId]
      );

      return rows[0] ? normalizeEmployee(rows[0]) : null;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error creando empleado:', error.message);
      return { error: error.message, status: 500 };
    }
  },

  async update(id, payload = {}, actor = {}) {
    const organizationId = Number(actor.organizationId || payload.organizationId || payload.organizacionId || 1);

    if (payload.role && String(payload.role) !== 'cashier') {
      return { error: 'No está permitido cambiar el rol del empleado', status: 400 };
    }

    if (!global.mysqlAvailable) {
      const index = demoUsers.findIndex((user) => Number(user.id) === Number(id) && Number(user.organizationId ?? 1) === organizationId);
      if (index === -1) {
        return null;
      }

      const current = demoUsers[index];
      const computedFirstName = payload.firstName ?? payload.nombre ?? current.nombre ?? current.nombreEmpleado ?? 'Empleado';
      const computedLastName = payload.lastName ?? payload.apellido ?? current.apellido ?? '';
      const computedNombreEmpleado = payload.nombreEmpleado ?? `${computedFirstName} ${computedLastName}`.trim();
      const next = {
        ...current,
        username: payload.username ?? current.username,
        nombre: computedFirstName,
        apellido: computedLastName,
        nombreEmpleado: computedNombreEmpleado || current.nombreEmpleado,
        email: payload.email ?? current.email,
        numeroEmpleado: payload.numeroEmpleado ?? payload.employeeNumber ?? current.numeroEmpleado,
        active: payload.active ?? payload.activo ?? current.active ?? current.activo,
        activo: payload.activo ?? payload.active ?? current.activo ?? current.active,
        organizationId: organizationId,
        role: 'cashier'
      };
      demoUsers[index] = next;
      return normalizeEmployee(next);
    }

    try {
      const updates = [];
      const values = [];

      if (payload.username !== undefined) { updates.push('username = ?'); values.push(String(payload.username)); }
      if (payload.firstName !== undefined || payload.nombre !== undefined) { updates.push('nombre = ?'); values.push(String(payload.firstName ?? payload.nombre)); }
      if (payload.lastName !== undefined || payload.apellido !== undefined) { updates.push('apellido = ?'); values.push(String(payload.lastName ?? payload.apellido)); }
      if (payload.email !== undefined) { updates.push('email = ?'); values.push(String(payload.email)); }
      if (payload.numeroEmpleado !== undefined || payload.employeeNumber !== undefined) { updates.push('numero_empleado = ?'); values.push(Number(payload.numeroEmpleado ?? payload.employeeNumber)); }
      if (payload.active !== undefined || payload.activo !== undefined) { updates.push('activo = ?'); values.push(payload.active ?? payload.activo ? 1 : 0); }
      if (payload.password !== undefined) { updates.push('password = ?'); values.push(String(payload.password)); }

      if (!updates.length) {
        return null;
      }

      values.push(Number(id), Number(organizationId));
      await getPool().execute(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
        values
      );

      const [rows] = await getPool().execute(
        'SELECT id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo FROM usuarios WHERE id = ? AND organization_id = ? LIMIT 1',
        [Number(id), Number(organizationId)]
      );

      return rows[0] ? normalizeEmployee(rows[0]) : null;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error actualizando empleado:', error.message);
      return { error: error.message, status: 500 };
    }
  },

  async activate(id, actor = {}) {
    const organizationId = Number(actor.organizationId || 1);
    if (!global.mysqlAvailable) {
      const index = demoUsers.findIndex((user) => Number(user.id) === Number(id) && Number(user.organizationId ?? 1) === organizationId);
      if (index === -1) return null;
      demoUsers[index].active = true;
      demoUsers[index].activo = true;
      return normalizeEmployee(demoUsers[index]);
    }

    try {
      const [result] = await getPool().execute('UPDATE usuarios SET activo = 1 WHERE id = ? AND organization_id = ?', [Number(id), organizationId]);
      return result.affectedRows ? this.findById(id, organizationId) : null;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error activando empleado:', error.message);
      return { error: error.message, status: 500 };
    }
  },

  async deactivate(id, actor = {}) {
    const organizationId = Number(actor.organizationId || 1);
    if (!global.mysqlAvailable) {
      const index = demoUsers.findIndex((user) => Number(user.id) === Number(id) && Number(user.organizationId ?? 1) === organizationId);
      if (index === -1) return null;
      demoUsers[index].active = false;
      demoUsers[index].activo = false;
      return normalizeEmployee(demoUsers[index]);
    }

    try {
      const [result] = await getPool().execute('UPDATE usuarios SET activo = 0 WHERE id = ? AND organization_id = ?', [Number(id), organizationId]);
      return result.affectedRows ? this.findById(id, organizationId) : null;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error desactivando empleado:', error.message);
      return { error: error.message, status: 500 };
    }
  },

  async resetPassword(id, payload = {}, actor = {}) {
    const organizationId = Number(actor.organizationId || 1);
    const password = String(payload.password || payload.temporaryPassword || '1234');

    if (!global.mysqlAvailable) {
      const index = demoUsers.findIndex((user) => Number(user.id) === Number(id) && Number(user.organizationId ?? 1) === organizationId);
      if (index === -1) return null;
      demoUsers[index].password = password;
      return { id: demoUsers[index].id, username: demoUsers[index].username, temporaryPassword: password };
    }

    try {
      await getPool().execute('UPDATE usuarios SET password = ? WHERE id = ? AND organization_id = ?', [password, Number(id), organizationId]);
      return { id: Number(id), message: 'Contraseña actualizada', temporaryPassword: password };
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error restableciendo contraseña:', error.message);
      return { error: error.message, status: 500 };
    }
  },

  async remove(id) {
    if (!global.mysqlAvailable) {
      return null;
    }

    try {
      const [rows] = await getPool().execute(
        'SELECT id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo FROM usuarios WHERE id = ? LIMIT 1',
        [Number(id)]
      );

      if (!rows[0]) {
        return null;
      }

      const employee = normalizeEmployee(rows[0]);
      await getPool().execute('DELETE FROM usuarios WHERE id = ?', [Number(id)]);
      return employee;
    } catch (error) {
      console.error('[EMPLOYEE SERVICE] Error eliminando empleado:', error.message);
      return null;
    }
  }
};
