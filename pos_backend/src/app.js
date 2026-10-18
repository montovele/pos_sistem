import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import productsRoutes from './routes/products.routes.js';
import employeesRoutes from './routes/employees.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import cajaRoutes from './routes/caja.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import facturasRoutes from './routes/facturas.routes.js';
import backupsRoutes from './routes/backups.routes.js';
import { inventoryRoutes } from '../inventario/module/inventory.routes.js';
import { initializeDatabase, testMySqlConnection } from './config/database.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const demoModeEnabled = (process.env.USE_DEMO_MODE ?? 'false').toLowerCase() === 'true';

global.mysqlAvailable = false;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    process.env.CORS_ORIGIN || 'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.options('*', (_req, res) => res.sendStatus(204));

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    ok: true,
    message: 'API Express funcionando',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/empleados', employeesRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/invoices', facturasRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/inventario', inventoryRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Ruta no encontrada: ${req.originalUrl}` });
});

const startServer = async () => {
  try {
    const connectionOk = await testMySqlConnection();
    global.mysqlAvailable = connectionOk;

    if (global.mysqlAvailable) {
      const dbReady = await initializeDatabase();
      if (!dbReady) {
        console.warn('La base de datos no quedó inicializada correctamente.');
      }
    } else if (demoModeEnabled) {
      console.warn('Modo demo activo: la app usa datos en memoria.');
    }

    app.listen(port, () => {
      console.log(`Servidor Express escuchando en http://localhost:${port}`);
      console.log(`Frontend permitido: http://localhost:5173`);
      console.log(global.mysqlAvailable ? 'MySQL conectado correctamente' : 'Ejecutando en modo demo (sin MySQL)');
    });
  } catch (error) {
    console.error('No se pudo iniciar el backend porque la conexión a MySQL falló.');
    console.error(error.message);
    process.exit(1);
  }
};

export { app, startServer };
