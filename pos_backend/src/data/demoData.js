export const organizations = [
  {
    id: 1,
    name: 'Empresa Demo',
    taxId: 'XAXX010101000',
    email: 'contacto@empresa-demo.local',
    phone: '5550000000',
    address: 'Centro, CDMX',
    logoUrl: '',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
    status: 'active',
    ownerUserId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const employees = [
  {
    id: 1,
    username: 'admin',
    password: '1234',
    nombreEmpleado: 'Administrador',
    numeroEmpleado: 1,
    role: 'admin',
    email: 'admin@pos.local',
    activo: true,
    active: true,
    organizationId: 1,
    organizationName: 'Empresa Demo',
    photo: ''
  },
  {
    id: 2,
    username: 'cajero',
    password: '1234',
    nombreEmpleado: 'Cajero Demo',
    numeroEmpleado: 2,
    role: 'cashier',
    email: 'cajero@pos.local',
    activo: true,
    active: true,
    organizationId: 1,
    organizationName: 'Empresa Demo',
    photo: ''
  }
];

export const demoUsers = [...employees];

export const products = [
  {
    id: 1,
    codigoProd: 'P001',
    codigoAltern: 'A001',
    nombreProd: 'Laptop Pro 14',
    price: 12999,
    stock: 18,
    org_id: 1,
    id_category: 1,
    category: 'Tecnología',
    description: 'Laptop ultraligera para oficina y ventas.',
    image: '',
    sku: 'LT-14',
    cost: 9800,
    unit: 'pieza',
    lowStockThreshold: 5,
    active: true,
    discountRate: 8,
    taxRate: 0.16
  },
  {
    id: 2,
    codigoProd: 'P002',
    codigoAltern: 'A002',
    nombreProd: 'Monitor 27" Ultra',
    price: 6999,
    stock: 9,
    org_id: 1,
    id_category: 1,
    category: 'Tecnología',
    description: 'Pantalla profesional para punto de venta.',
    image: '',
    sku: 'MN-27',
    cost: 5200,
    unit: 'pieza',
    lowStockThreshold: 4,
    active: true,
    discountRate: 10,
    taxRate: 0.16
  },
  {
    id: 3,
    codigoProd: 'P003',
    codigoAltern: 'A003',
    nombreProd: 'Impresora térmica',
    price: 3999,
    stock: 14,
    org_id: 1,
    id_category: 2,
    category: 'Accesorios',
    description: 'Impresora para tickets y facturas.',
    image: '',
    sku: 'PR-TP',
    cost: 2800,
    unit: 'pieza',
    lowStockThreshold: 6,
    active: true,
    discountRate: 12,
    taxRate: 0.16
  },
  {
    id: 4,
    codigoProd: 'P004',
    codigoAltern: 'A004',
    nombreProd: 'Kit de cajas de regalo',
    price: 349,
    stock: 32,
    org_id: 1,
    id_category: 3,
    category: 'Papelería',
    description: 'Cajas para regalos premium y promociones.',
    image: '',
    sku: 'CX-REG',
    cost: 220,
    unit: 'pieza',
    lowStockThreshold: 10,
    active: true,
    discountRate: 15,
    taxRate: 0.16
  },
  {
    id: 5,
    codigoProd: 'P005',
    codigoAltern: 'A005',
    nombreProd: 'Mouse ergonómico',
    price: 499,
    stock: 22,
    org_id: 1,
    id_category: 2,
    category: 'Accesorios',
    description: 'Mouse para cómputo con ergonomía avanzada.',
    image: '',
    sku: 'MS-ERG',
    cost: 320,
    unit: 'pieza',
    lowStockThreshold: 8,
    active: true,
    discountRate: 5,
    taxRate: 0.16
  }
];

export let transactions = [];

export let cajaStatus = {
  abierta: false,
  montoApertura: 0,
  cajero: null,
  fechaApertura: null,
  ultimoMovimiento: null
};

export const setCajaStatus = (nextStatus) => {
  cajaStatus = nextStatus;
};

export const addTransaction = (transaction) => {
  transactions = [...transactions, transaction];
};
