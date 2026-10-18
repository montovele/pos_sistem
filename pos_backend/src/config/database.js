import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
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
    CREATE TABLE IF NOT EXISTS organizaciones (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nombre_org VARCHAR(100) NOT NULL,
      ruc VARCHAR(50) UNIQUE,
      direccion VARCHAR(255) DEFAULT NULL,
      telefono VARCHAR(20) DEFAULT NULL,
      correo VARCHAR(100) DEFAULT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    INSERT INTO organizaciones (id, nombre_org, ruc, correo, activo)
    VALUES (1, 'Empresa Demo', 'XAXX010101000', 'contacto@empresa-demo.local', 1)
    ON DUPLICATE KEY UPDATE nombre_org = VALUES(nombre_org), correo = VALUES(correo), activo = VALUES(activo)
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      nombre VARCHAR(100) DEFAULT 'Administrador',
      apellido VARCHAR(100) DEFAULT 'Sistema',
      email VARCHAR(150) DEFAULT NULL,
      numero_empleado INT DEFAULT 1,
      organization_id INT NOT NULL DEFAULT 1,
      role VARCHAR(30) DEFAULT 'admin',
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [userColumns] = await connection.execute('SHOW COLUMNS FROM usuarios');
  if (!userColumns.some((column) => column.Field === 'organization_id')) {
    await connection.execute('ALTER TABLE usuarios ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER numero_empleado');
  }

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
      stock DECIMAL(12,3) NOT NULL DEFAULT 0,
      unit VARCHAR(3) NOT NULL DEFAULT 'PZA',
      sale_by_weight TINYINT(1) NOT NULL DEFAULT 0,
      org_id INT NOT NULL DEFAULT 1,
      id_category INT NOT NULL DEFAULT 1,
      description TEXT DEFAULT NULL,
      image VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [productColumns] = await connection.execute('SHOW COLUMNS FROM productos');
  const productColumnNames = new Set(productColumns.map((column) => column.Field));
  const productColumnMigrations = [
    ['unit', "ALTER TABLE productos ADD COLUMN unit VARCHAR(3) NOT NULL DEFAULT 'PZA' AFTER stock"],
    ['sale_by_weight', 'ALTER TABLE productos ADD COLUMN sale_by_weight TINYINT(1) NOT NULL DEFAULT 0 AFTER unit'],
    ['stock_decimal', 'ALTER TABLE productos MODIFY COLUMN stock DECIMAL(12,3) NOT NULL DEFAULT 0']
  ];

  for (const [name, query] of productColumnMigrations) {
    if (name === 'stock_decimal' || !productColumnNames.has(name)) {
      await connection.execute(query);
    }
  }

  await connection.execute("UPDATE productos SET unit = CASE WHEN sale_by_weight = 1 THEN 'KG' ELSE 'PZA' END WHERE unit IS NULL OR unit NOT IN ('KG', 'PZA')");
  await connection.execute("UPDATE productos SET sale_by_weight = CASE WHEN unit = 'KG' THEN 1 ELSE 0 END");

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
      org_id = VALUES(org_id),
      id_category = VALUES(id_category),
      description = VALUES(description),
      image = VALUES(image)
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      client_transaction_id VARCHAR(120) DEFAULT NULL,
      device_id VARCHAR(120) DEFAULT NULL,
      codigo_transaccion VARCHAR(80) NOT NULL UNIQUE,
      codigo_ticket VARCHAR(80) NOT NULL UNIQUE,
      fecha_trans TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      items JSON NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      nombre_cajero VARCHAR(120) DEFAULT 'Sistema',
      numero_empleado INT NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
      cash_session_id VARCHAR(80) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [columns] = await connection.execute(`SHOW COLUMNS FROM transacciones`);
  const columnNames = new Set(columns.map((column) => column.Field));

  const legacyColumnMigrations = [
    ['organization_id', 'ALTER TABLE transacciones ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER id'],
    ['client_transaction_id', 'ALTER TABLE transacciones ADD COLUMN client_transaction_id VARCHAR(120) DEFAULT NULL AFTER organization_id'],
    ['device_id', 'ALTER TABLE transacciones ADD COLUMN device_id VARCHAR(120) DEFAULT NULL AFTER client_transaction_id'],
    ['subtotal', 'ALTER TABLE transacciones ADD COLUMN subtotal DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER items'],
    ['discount', 'ALTER TABLE transacciones ADD COLUMN discount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER subtotal'],
     ['payment_method', 'ALTER TABLE transacciones ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT "cash" AFTER status'],
     ['cash_session_id', 'ALTER TABLE transacciones ADD COLUMN cash_session_id VARCHAR(80) DEFAULT NULL AFTER payment_method']
  ];

  for (const [name, query] of legacyColumnMigrations) {
    if (!columnNames.has(name)) {
      await connection.execute(query);
      columnNames.add(name);
    }
  }

  const [transactionIndexes] = await connection.execute('SHOW INDEX FROM transacciones');
  if (!transactionIndexes.some((index) => index.Key_name === 'uq_transacciones_offline_identity')) {
    await connection.execute('CREATE UNIQUE INDEX uq_transacciones_offline_identity ON transacciones (organization_id, device_id, client_transaction_id)');
  }

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id VARCHAR(80) PRIMARY KEY,
      numero_empleado INT NOT NULL,
      cajero VARCHAR(120) NOT NULL,
      base DECIMAL(12,2) NOT NULL DEFAULT 0,
      abierta TINYINT(1) NOT NULL DEFAULT 1,
      fecha_apertura DATETIME NOT NULL,
      fecha_cierre DATETIME NULL,
      efectivo_contado DECIMAL(12,2) NULL,
      diferencia DECIMAL(12,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cash_employee_open (numero_empleado, abierta),
      INDEX idx_cash_employee_history (numero_empleado, fecha_apertura)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const ensureInventorySchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      product_id BIGINT NULL,
      sku VARCHAR(100) NOT NULL,
      barcode VARCHAR(100) DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(150) DEFAULT NULL,
      unit VARCHAR(10) NOT NULL DEFAULT 'PZA',
      stock DECIMAL(14,3) NOT NULL DEFAULT 0,
      min_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
      cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      price DECIMAL(14,2) NOT NULL DEFAULT 0,
      supplier VARCHAR(255) DEFAULT NULL,
      warehouse VARCHAR(100) NOT NULL DEFAULT 'PRINCIPAL',
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_inventario_item_product
        FOREIGN KEY (product_id) REFERENCES productos(id) ON DELETE SET NULL,
      UNIQUE KEY uq_inventario_org_sku_almacen (organization_id, sku, warehouse),
      INDEX idx_inventario_nombre (name),
      INDEX idx_inventario_stock (warehouse, stock, min_stock)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_importaciones (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      source VARCHAR(20) NOT NULL,
      filename VARCHAR(255) DEFAULT NULL,
      dry_run TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      total_rows INT UNSIGNED NOT NULL DEFAULT 0,
      valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
      invalid_rows INT UNSIGNED NOT NULL DEFAULT 0,
      duplicate_rows INT UNSIGNED NOT NULL DEFAULT 0,
      imported_rows INT UNSIGNED NOT NULL DEFAULT 0,
      user_id BIGINT DEFAULT NULL,
      username VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inventario_importaciones_fecha (created_at),
      INDEX idx_inventario_importaciones_usuario (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      product_id BIGINT NULL,
      inventario_item_id BIGINT DEFAULT NULL,
      sku VARCHAR(100) NOT NULL,
      warehouse VARCHAR(100) NOT NULL DEFAULT 'PRINCIPAL',
      movement_type VARCHAR(20) NOT NULL,
      quantity DECIMAL(14,3) NOT NULL,
      stock_before DECIMAL(14,3) NOT NULL DEFAULT 0,
      stock_after DECIMAL(14,3) NOT NULL DEFAULT 0,
      reason VARCHAR(255) DEFAULT NULL,
      reference_type VARCHAR(50) DEFAULT NULL,
      reference_id VARCHAR(100) DEFAULT NULL,
      user_id BIGINT DEFAULT NULL,
      username VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inventario_movimientos_item FOREIGN KEY (inventario_item_id)
        REFERENCES inventario_items(id) ON DELETE SET NULL,
      CONSTRAINT fk_inventario_movimientos_product
        FOREIGN KEY (product_id) REFERENCES productos(id) ON DELETE SET NULL,
      INDEX idx_inventario_movimientos_org_fecha (organization_id, created_at),
      INDEX idx_inventario_movimientos_sku (organization_id, sku, warehouse)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [itemColumns] = await connection.execute('SHOW COLUMNS FROM inventario_items');
  if (!itemColumns.some((column) => column.Field === 'product_id')) {
    await connection.execute('ALTER TABLE inventario_items ADD COLUMN product_id BIGINT NULL AFTER organization_id');
  }

  const [importColumns] = await connection.execute('SHOW COLUMNS FROM inventario_importaciones');
  if (!importColumns.some((column) => column.Field === 'organization_id')) {
    await connection.execute('ALTER TABLE inventario_importaciones ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER id');
  }

  const [itemIndexes] = await connection.execute('SHOW INDEX FROM inventario_items');
  if (itemIndexes.some((index) => index.Key_name === 'uq_inventario_sku_almacen')) {
    await connection.execute('ALTER TABLE inventario_items DROP INDEX uq_inventario_sku_almacen');
  }
  if (!itemIndexes.some((index) => index.Key_name === 'uq_inventario_org_sku_almacen')) {
    await connection.execute('ALTER TABLE inventario_items ADD UNIQUE KEY uq_inventario_org_sku_almacen (organization_id, sku, warehouse)');
  }

  const [movementColumns] = await connection.execute('SHOW COLUMNS FROM inventario_movimientos');
  if (!movementColumns.some((column) => column.Field === 'product_id')) {
    await connection.execute('ALTER TABLE inventario_movimientos ADD COLUMN product_id BIGINT NULL AFTER organization_id');
  }
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_importacion_filas (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      importacion_id BIGINT NOT NULL,
      row_index INT UNSIGNED NOT NULL,
      sku VARCHAR(100) DEFAULT NULL,
      status VARCHAR(30) NOT NULL,
      errors JSON DEFAULT NULL,
      raw_data JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inventario_importacion_filas_importacion
        FOREIGN KEY (importacion_id) REFERENCES inventario_importaciones(id)
        ON DELETE CASCADE,
      INDEX idx_inventario_importacion_filas_importacion (importacion_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [importRowColumns] = await connection.execute('SHOW COLUMNS FROM inventario_importacion_filas');
  if (!importRowColumns.some((column) => column.Field === 'raw_data')) {
    await connection.execute('ALTER TABLE inventario_importacion_filas ADD COLUMN raw_data JSON DEFAULT NULL AFTER errors');
  }
};

export const initializeDatabase = async () => {
  try {
    const connection = await getPool().getConnection();
    await ensureLegacyCompatibilitySchema(connection);
    await ensureInventorySchema(connection);
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
    const demoModeEnabled = (process.env.USE_DEMO_MODE ?? 'false').toLowerCase() === 'true';

    if (demoModeEnabled) {
      console.warn('MySQL no disponible, usando modo demo:', error.message);
      return false;
    }

    console.error('MySQL no disponible. Configura la BD real o habilita USE_DEMO_MODE=true.');
    console.error(error.message);
    throw error;
  }
};
