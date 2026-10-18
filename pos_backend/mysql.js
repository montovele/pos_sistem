import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ssaxxon_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;

export const getPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const ensureLegacyCompatibilitySchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      nombre VARCHAR(100) DEFAULT 'Administrador',
      apellido VARCHAR(100) DEFAULT 'Sistema',
      email VARCHAR(150) DEFAULT NULL,
      numero_empleado INT DEFAULT 1,
      role VARCHAR(30) DEFAULT 'admin',
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    INSERT INTO usuarios (username, password, nombre, apellido, email, numero_empleado, role, activo)
    VALUES
      ('admin', '1234', 'Administrador', 'Sistema', 'admin@pos.local', 1, 'admin', 1),
      ('cajero', '1234', 'Cajero', 'Demo', 'cajero@pos.local', 2, 'cashier', 1)
    ON DUPLICATE KEY UPDATE
      password = VALUES(password),
      nombre = VALUES(nombre),
      apellido = VALUES(apellido),
      email = VALUES(email),
      numero_empleado = VALUES(numero_empleado),
      role = VALUES(role),
      activo = VALUES(activo)
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS productos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      codigo_prod VARCHAR(50) NOT NULL UNIQUE,
      codigo_altern VARCHAR(50) DEFAULT NULL,
      nombre_prod VARCHAR(150) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      org_id INT NOT NULL DEFAULT 1,
      id_category INT NOT NULL DEFAULT 1,
      description TEXT DEFAULT NULL,
      image VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    INSERT INTO productos (codigo_prod, codigo_altern, nombre_prod, price, stock, org_id, id_category, description, image)
    VALUES
      ('P001', 'A001', 'Producto Demo 1', 19.99, 10, 1, 1, 'Producto de prueba 1', ''),
      ('P002', 'A002', 'Producto Demo 2', 29.99, 8, 1, 1, 'Producto de prueba 2', ''),
      ('P003', 'A003', 'Producto Demo 3', 49.50, 14, 1, 2, 'Producto de prueba 3', '')
    ON DUPLICATE KEY UPDATE
      codigo_altern = VALUES(codigo_altern),
      nombre_prod = VALUES(nombre_prod),
      price = VALUES(price),
      stock = VALUES(stock),
      org_id = VALUES(org_id),
      id_category = VALUES(id_category),
      description = VALUES(description),
      image = VALUES(image)
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      codigo_transaccion VARCHAR(80) NOT NULL UNIQUE,
      codigo_ticket VARCHAR(80) NOT NULL UNIQUE,
      fecha_trans TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      items JSON NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      nombre_cajero VARCHAR(120) DEFAULT 'Sistema',
      numero_empleado INT NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const initializeDatabase = async () => {
  try {
    const connection = await getPool().getConnection();
    await ensureLegacyCompatibilitySchema(connection);
    connection.release();
    return true;
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
    return false;
  }
};

export const testMySqlConnection = async () => {
  try {
    const connection = await getPool().getConnection();
    console.log('Conexión MySQL OK');
    connection.release();
    return true;
  } catch (error) {
    const demoModeEnabled = (process.env.USE_DEMO_MODE ?? 'true').toLowerCase() === 'true';
    if (demoModeEnabled) {
      console.warn('MySQL no disponible, usando modo demo:', error.message);
      return false;
    }

    console.error('MySQL no disponible. Configura la BD real o habilita USE_DEMO_MODE=true.');
    console.error(error.message);
    throw error;
  }
};
