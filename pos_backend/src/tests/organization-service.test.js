import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizationService } from '../services/organizationService.js';

test('returns and updates the organization record and counts its existing data in demo mode', async () => {
  const previousMysqlAvailability = global.mysqlAvailable;
  global.mysqlAvailable = false;
  const organizations = [{
    id: 8,
    name: 'Tienda Real',
    taxId: 'RFC-REAL',
    email: 'contacto@tiendareal.mx',
    phone: '5551234567',
    address: 'Av. Principal 10',
    status: 'active'
  }];
  const service = createOrganizationService({
    demoOrganizations: organizations,
    users: [
      { id: 1, organizationId: 8, role: 'admin', active: true },
      { id: 2, organizationId: 8, role: 'cashier', active: true },
      { id: 3, organizationId: 8, role: 'cashier', active: false },
      { id: 4, organizationId: 9, role: 'cashier', active: true }
    ],
    demoProducts: [
      { id: 1, org_id: 8 },
      { id: 2, org_id: 9 }
    ],
    demoTransactions: [
      { id: 1, organizationId: 8 },
      { id: 2, organizationId: 8 },
      { id: 3, organizationId: 9 }
    ]
  });

  try {
    assert.deepEqual(await service.get(8), {
      id: 8,
      name: 'Tienda Real',
      taxId: 'RFC-REAL',
      email: 'contacto@tiendareal.mx',
      phone: '5551234567',
      address: 'Av. Principal 10',
      status: 'active',
      ownerUserId: null,
      createdAt: null,
      updatedAt: null
    });
    assert.deepEqual(await service.getSummary(8), {
      organization: await service.get(8),
      employeesCount: 3,
      activeCashiersCount: 1,
      productsCount: 1,
      transactionsCount: 2
    });

    const updated = await service.update(8, { name: 'Tienda Actualizada', email: 'nuevo@tiendareal.mx' });
    assert.equal(updated.name, 'Tienda Actualizada');
    assert.equal(updated.email, 'nuevo@tiendareal.mx');
    assert.equal(updated.taxId, 'RFC-REAL');
    assert.equal(await service.get(9), null);
  } finally {
    global.mysqlAvailable = previousMysqlAvailability;
  }
});

test('queries the persisted organization and scoped counts when MySQL is active', async () => {
  const previousMysqlAvailability = global.mysqlAvailable;
  global.mysqlAvailable = true;
  const calls = [];
  let organizationRow = {
    id: 12,
    nombre_org: 'Negocio de Base',
    ruc: 'RFC-DB',
    correo: 'db@negocio.mx',
    telefono: '5550000012',
    direccion: 'Calle 12',
    activo: 1
  };
  const pool = {
    async execute(query, params) {
      calls.push({ query, params });
      if (query.includes('FROM organizaciones')) return [[organizationRow], []];
      if (query.startsWith('UPDATE organizaciones')) {
        const fields = [...query.matchAll(/([a-z_]+) = \?/g)].map((match) => match[1]);
        fields.forEach((field, index) => {
          organizationRow[field] = params[index];
        });
        return [{ affectedRows: 1 }, []];
      }
      if (query.includes('FROM usuarios')) return [[{ employeesCount: 5, activeCashiersCount: 2 }], []];
      if (query.includes('FROM productos')) return [[{ productsCount: 17 }], []];
      if (query.includes('FROM transacciones')) return [[{ transactionsCount: 31 }], []];
      throw new Error('Unexpected query');
    }
  };
  const service = createOrganizationService({ getDatabasePool: () => pool });

  try {
    const organization = await service.get(12);
    assert.equal(organization.name, 'Negocio de Base');
    assert.equal(organization.taxId, 'RFC-DB');

    const summary = await service.getSummary(12);
    assert.equal(summary.employeesCount, 5);
    assert.equal(summary.activeCashiersCount, 2);
    assert.equal(summary.productsCount, 17);
    assert.equal(summary.transactionsCount, 31);

    const updated = await service.update(12, { name: 'Nombre Guardado', address: 'Nueva dirección' });
    assert.equal(updated.name, 'Nombre Guardado');
    assert.equal(updated.address, 'Nueva dirección');
    assert.ok(calls.every(({ params }) => params[0] === 12 || params.at(-1) === 12));
    assert.ok(calls.some(({ query }) => query.includes('UPDATE organizaciones')));
  } finally {
    global.mysqlAvailable = previousMysqlAvailability;
  }
});
