import { getPool } from '../config/database.js';
import { organizations, demoUsers, products, transactions } from '../data/demoData.js';

const normalizeOrganization = (row) => ({
  id: Number(row.id),
  name: row.nombre_org || row.name || '',
  taxId: row.ruc || row.taxId || '',
  email: row.correo || row.email || '',
  phone: row.telefono || row.phone || '',
  address: row.direccion || row.address || '',
  status: row.activo === undefined ? row.status || 'active' : Number(row.activo) === 1 ? 'active' : 'inactive',
  ownerUserId: row.ownerUserId || null,
  createdAt: row.created_at || row.createdAt || null,
  updatedAt: row.updated_at || row.updatedAt || null
});

export function createOrganizationService({
  getDatabasePool = getPool,
  demoOrganizations = organizations,
  users = demoUsers,
  demoProducts = products,
  demoTransactions = transactions
} = {}) {
  const findDemoOrganization = (id) => demoOrganizations.find((item) => Number(item.id) === Number(id));

  return {
    async get(organizationId) {
      const id = Number(organizationId);
      if (!Number.isInteger(id) || id < 1) return null;

      if (!global.mysqlAvailable) {
        const organization = findDemoOrganization(id);
        return organization ? normalizeOrganization(organization) : null;
      }

      const [rows] = await getDatabasePool().execute(
        `SELECT id, nombre_org, ruc, direccion, telefono, correo, activo, created_at, updated_at
         FROM organizaciones
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      return rows[0] ? normalizeOrganization(rows[0]) : null;
    },

    async update(organizationId, updates = {}) {
      const id = Number(organizationId);
      const fieldMap = {
        name: 'nombre_org',
        businessName: 'nombre_org',
        taxId: 'ruc',
        businessRuc: 'ruc',
        ruc: 'ruc',
        email: 'correo',
        phone: 'telefono',
        address: 'direccion'
      };
      const columns = new Map();
      for (const [field, column] of Object.entries(fieldMap)) {
        if (updates[field] !== undefined) columns.set(column, String(updates[field] ?? '').trim());
      }

      if (!columns.size) return this.get(id);

      if (!global.mysqlAvailable) {
        const organization = findDemoOrganization(id);
        if (!organization) return null;
        const normalizedFields = {
          nombre_org: 'name',
          ruc: 'taxId',
          correo: 'email',
          telefono: 'phone',
          direccion: 'address'
        };
        for (const [column, value] of columns) {
          organization[normalizedFields[column]] = value;
        }
        organization.updatedAt = new Date().toISOString();
        return normalizeOrganization(organization);
      }

      const assignments = [...columns.keys()].map((column) => `${column} = ?`);
      await getDatabasePool().execute(
        `UPDATE organizaciones SET ${assignments.join(', ')} WHERE id = ?`,
        [...columns.values(), id]
      );
      return this.get(id);
    },

    async getSummary(organizationId) {
      const id = Number(organizationId);
      const organization = await this.get(id);
      if (!organization) return null;

      if (!global.mysqlAvailable) {
        const organizationUsers = users.filter((user) => Number(user.organizationId || 1) === id);
        return {
          organization,
          employeesCount: organizationUsers.length,
          activeCashiersCount: organizationUsers.filter((user) => (
            user.role === 'cashier' && user.active !== false && user.activo !== false
          )).length,
          productsCount: demoProducts.filter((product) => Number(product.org_id ?? product.organizationId ?? 1) === id).length,
          transactionsCount: demoTransactions.filter((transaction) => Number(transaction.organizationId ?? 1) === id).length
        };
      }

      const pool = getDatabasePool();
      const [[employeeRows], [productRows], [transactionRows]] = await Promise.all([
        pool.execute(
          `SELECT COUNT(*) AS employeesCount,
                  COALESCE(SUM(role = 'cashier' AND activo = 1), 0) AS activeCashiersCount
           FROM usuarios
           WHERE organization_id = ?`,
          [id]
        ),
        pool.execute('SELECT COUNT(*) AS productsCount FROM productos WHERE org_id = ?', [id]),
        pool.execute('SELECT COUNT(*) AS transactionsCount FROM transacciones WHERE organization_id = ?', [id])
      ]);

      return {
        organization,
        employeesCount: Number(employeeRows[0]?.employeesCount || 0),
        activeCashiersCount: Number(employeeRows[0]?.activeCashiersCount || 0),
        productsCount: Number(productRows[0]?.productsCount || 0),
        transactionsCount: Number(transactionRows[0]?.transactionsCount || 0)
      };
    }
  };
}

export const organizationService = createOrganizationService();
