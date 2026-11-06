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
    INSERT IGNORE INTO organizaciones (id, nombre_org, ruc, correo, activo)
    VALUES (1, 'Empresa Demo', 'XAXX010101000', 'contacto@empresa-demo.local', 1)
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
      codigo_prod VARCHAR(50) NOT NULL,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_org_code (org_id, codigo_prod)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [productColumns] = await connection.execute('SHOW COLUMNS FROM productos');
  const productColumnNames = new Set(productColumns.map((column) => column.Field));
  const productColumnMigrations = [
    ['unit', "ALTER TABLE productos ADD COLUMN unit VARCHAR(3) NOT NULL DEFAULT 'PZA' AFTER stock"],
    ['sale_by_weight', 'ALTER TABLE productos ADD COLUMN sale_by_weight TINYINT(1) NOT NULL DEFAULT 0 AFTER unit'],
    ['org_id', 'ALTER TABLE productos ADD COLUMN org_id INT NOT NULL DEFAULT 1 AFTER sale_by_weight'],
    ['stock_decimal', 'ALTER TABLE productos MODIFY COLUMN stock DECIMAL(12,3) NOT NULL DEFAULT 0']
  ];

  for (const [name, query] of productColumnMigrations) {
    if (name === 'stock_decimal' || !productColumnNames.has(name)) {
      await connection.execute(query);
    }
  }

  await connection.execute("UPDATE productos SET unit = CASE WHEN sale_by_weight = 1 THEN 'KG' ELSE 'PZA' END WHERE unit IS NULL OR unit NOT IN ('KG', 'PZA')");
  await connection.execute("UPDATE productos SET sale_by_weight = CASE WHEN unit = 'KG' THEN 1 ELSE 0 END");

  const [productIndexes] = await connection.execute('SHOW INDEX FROM productos');
  const indexesByName = new Map();
  for (const index of productIndexes) {
    const entries = indexesByName.get(index.Key_name) || [];
    entries.push(index);
    indexesByName.set(index.Key_name, entries);
  }
  for (const entries of indexesByName.values()) {
    entries.sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index));
  }
  const [duplicateProductCodes] = await connection.execute(
    `SELECT org_id, codigo_prod, COUNT(*) AS total
     FROM productos
     GROUP BY org_id, codigo_prod
     HAVING COUNT(*) > 1
     LIMIT 1`
  );
  if (duplicateProductCodes.length > 0) {
    throw new Error('Hay códigos de producto duplicados dentro de una organización; resuélvelos antes de aplicar la restricción de inventario multi-organización.');
  }
  for (const [name, entries] of indexesByName) {
    if (
      name !== 'PRIMARY' &&
      Number(entries[0].Non_unique) === 0 &&
      entries.length === 1 &&
      entries[0].Column_name === 'codigo_prod'
    ) {
      await connection.execute(`ALTER TABLE productos DROP INDEX \`${name.replace(/`/g, '``')}\``);
    }
  }
  if (!Array.from(indexesByName.values()).some((entries) => (
    entries.length === 2 &&
    entries[0].Column_name === 'org_id' &&
    entries[1].Column_name === 'codigo_prod' &&
    Number(entries[0].Non_unique) === 0
  ))) {
    await connection.execute('CREATE UNIQUE INDEX uq_product_org_code ON productos (org_id, codigo_prod)');
  }
  if (!Array.from(indexesByName.values()).some((entries) => (
    entries.length === 2 &&
    entries[0].Column_name === 'org_id' &&
    entries[1].Column_name === 'id' &&
    Number(entries[0].Non_unique) === 0
  ))) {
    await connection.execute('CREATE UNIQUE INDEX uq_product_org_id_id ON productos (org_id, id)');
  }

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

const ensureInventoryOrganizationForeignKey = async (connection, tableName, constraintName) => {
  const [orphanRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM \`${tableName}\` inventory
     LEFT JOIN organizaciones organization ON organization.id = inventory.organization_id
     WHERE organization.id IS NULL`
  );
  const orphanCount = Number(orphanRows[0]?.total || 0);
  if (orphanCount > 0) {
    throw new Error(`${tableName} contiene ${orphanCount} registros con una organización inexistente; corrige esos registros antes de iniciar el servicio.`);
  }

  const [foreignKeys] = await connection.execute(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = 'organization_id'
       AND REFERENCED_TABLE_NAME = 'organizaciones'`,
    [tableName]
  );
  if (foreignKeys.length === 0) {
    await connection.execute(
      `ALTER TABLE \`${tableName}\`
       ADD CONSTRAINT \`${constraintName}\`
       FOREIGN KEY (organization_id) REFERENCES organizaciones(id)
       ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  }
};

const ensureScopedInventoryProductForeignKey = async (connection, tableName, indexName, constraintName) => {
  const [invalidRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM \`${tableName}\` inventory
     LEFT JOIN productos product
       ON product.id = inventory.product_id
      AND product.org_id = inventory.organization_id
     WHERE inventory.product_id IS NOT NULL AND product.id IS NULL`
  );
  const invalidCount = Number(invalidRows[0]?.total || 0);
  if (invalidCount > 0) {
    console.warn(`[INVENTARIO] Se desvinculan ${invalidCount} referencias de producto inconsistentes en ${tableName}; se conservan los registros de inventario.`);
    await connection.execute(
      `UPDATE \`${tableName}\` inventory
       LEFT JOIN productos product
         ON product.id = inventory.product_id
        AND product.org_id = inventory.organization_id
       SET inventory.product_id = NULL
       WHERE inventory.product_id IS NOT NULL AND product.id IS NULL`
    );
  }

  const [indexes] = await connection.execute(`SHOW INDEX FROM \`${tableName}\``);
  if (!indexes.some((index) => index.Key_name === indexName)) {
    await connection.execute(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (organization_id, product_id)`);
  }

  const [foreignKeys] = await connection.execute(
    `SELECT DISTINCT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME = 'productos'
       AND COLUMN_NAME = 'product_id'`,
    [tableName]
  );
  for (const foreignKey of foreignKeys) {
    if (foreignKey.CONSTRAINT_NAME !== constraintName) {
      const name = String(foreignKey.CONSTRAINT_NAME).replace(/`/g, '``');
      await connection.execute(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${name}\``);
    }
  }
  if (!foreignKeys.some((foreignKey) => foreignKey.CONSTRAINT_NAME === constraintName)) {
    await connection.execute(
      `ALTER TABLE \`${tableName}\`
       ADD CONSTRAINT \`${constraintName}\`
       FOREIGN KEY (organization_id, product_id)
       REFERENCES productos (org_id, id)
       ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  }
};

const dropLegacyInventoryProductForeignKeys = async (connection, tableName, constraintName) => {
  const [foreignKeys] = await connection.execute(
    `SELECT DISTINCT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME = 'productos'
       AND COLUMN_NAME = 'product_id'`,
    [tableName]
  );
  for (const foreignKey of foreignKeys) {
    if (foreignKey.CONSTRAINT_NAME !== constraintName) {
      const name = String(foreignKey.CONSTRAINT_NAME).replace(/`/g, '``');
      await connection.execute(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${name}\``);
    }
  }
};

const ensureScopedInventoryItemForeignKey = async (connection) => {
  const [invalidRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM inventario_movimientos movement
     LEFT JOIN inventario_items item
       ON item.id = movement.inventario_item_id
      AND item.organization_id = movement.organization_id
     WHERE movement.inventario_item_id IS NOT NULL AND item.id IS NULL`
  );
  const invalidCount = Number(invalidRows[0]?.total || 0);
  if (invalidCount > 0) {
    console.warn(`[INVENTARIO] Se desvinculan ${invalidCount} movimientos de artículos de otra organización; se conserva el historial.`);
    await connection.execute(
      `UPDATE inventario_movimientos movement
       LEFT JOIN inventario_items item
         ON item.id = movement.inventario_item_id
        AND item.organization_id = movement.organization_id
       SET movement.inventario_item_id = NULL
       WHERE movement.inventario_item_id IS NOT NULL AND item.id IS NULL`
    );
  }

  const [itemIndexes] = await connection.execute('SHOW INDEX FROM inventario_items');
  if (!itemIndexes.some((index) => index.Key_name === 'uq_inventario_org_id_id')) {
    await connection.execute('CREATE UNIQUE INDEX uq_inventario_org_id_id ON inventario_items (organization_id, id)');
  }
  const [movementIndexes] = await connection.execute('SHOW INDEX FROM inventario_movimientos');
  if (!movementIndexes.some((index) => index.Key_name === 'idx_inventario_movimientos_org_item')) {
    await connection.execute('CREATE INDEX idx_inventario_movimientos_org_item ON inventario_movimientos (organization_id, inventario_item_id)');
  }

  const [foreignKeys] = await connection.execute(
    `SELECT DISTINCT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventario_movimientos'
       AND REFERENCED_TABLE_NAME = 'inventario_items'
       AND COLUMN_NAME = 'inventario_item_id'`
  );
  for (const foreignKey of foreignKeys) {
    if (foreignKey.CONSTRAINT_NAME !== 'fk_inventario_movimientos_org_item') {
      const name = String(foreignKey.CONSTRAINT_NAME).replace(/`/g, '``');
      await connection.execute(`ALTER TABLE inventario_movimientos DROP FOREIGN KEY \`${name}\``);
    }
  }
  if (!foreignKeys.some((foreignKey) => foreignKey.CONSTRAINT_NAME === 'fk_inventario_movimientos_org_item')) {
    await connection.execute(
      `ALTER TABLE inventario_movimientos
       ADD CONSTRAINT fk_inventario_movimientos_org_item
       FOREIGN KEY (organization_id, inventario_item_id)
       REFERENCES inventario_items (organization_id, id)
       ON DELETE RESTRICT ON UPDATE CASCADE`
    );
  }
};

const ensureInventorySchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      product_id INT NULL,
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
      CONSTRAINT fk_inventario_item_org_product
        FOREIGN KEY (organization_id, product_id) REFERENCES productos(org_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_inventario_item_organization
        FOREIGN KEY (organization_id) REFERENCES organizaciones(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      UNIQUE KEY uq_inventario_org_sku_almacen (organization_id, sku, warehouse),
      UNIQUE KEY uq_inventario_org_id_id (organization_id, id),
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
      INDEX idx_inventario_importaciones_usuario (user_id),
      CONSTRAINT fk_inventario_importaciones_organization
        FOREIGN KEY (organization_id) REFERENCES organizaciones(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL DEFAULT 1,
      product_id INT NULL,
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
      CONSTRAINT fk_inventario_movimientos_org_item
        FOREIGN KEY (organization_id, inventario_item_id)
        REFERENCES inventario_items(organization_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_inventario_movimientos_org_product
        FOREIGN KEY (organization_id, product_id) REFERENCES productos(org_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_inventario_movimientos_organization
        FOREIGN KEY (organization_id) REFERENCES organizaciones(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      INDEX idx_inventario_movimientos_org_fecha (organization_id, created_at),
      INDEX idx_inventario_movimientos_sku (organization_id, sku, warehouse)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await dropLegacyInventoryProductForeignKeys(
    connection,
    'inventario_items',
    'fk_inventario_item_org_product'
  );
  await dropLegacyInventoryProductForeignKeys(
    connection,
    'inventario_movimientos',
    'fk_inventario_movimientos_org_product'
  );

  const [itemColumns] = await connection.execute('SHOW COLUMNS FROM inventario_items');
  if (!itemColumns.some((column) => column.Field === 'organization_id')) {
    await connection.execute('ALTER TABLE inventario_items ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER id');
  }
  if (!itemColumns.some((column) => column.Field === 'product_id')) {
    await connection.execute('ALTER TABLE inventario_items ADD COLUMN product_id INT NULL AFTER organization_id');
  } else if (String(itemColumns.find((column) => column.Field === 'product_id').Type).toLowerCase().replace(/\(\d+\)/, '') !== 'int') {
    await connection.execute('ALTER TABLE inventario_items MODIFY COLUMN product_id INT NULL');
  }

  const [importColumns] = await connection.execute('SHOW COLUMNS FROM inventario_importaciones');
  if (!importColumns.some((column) => column.Field === 'organization_id')) {
    await connection.execute('ALTER TABLE inventario_importaciones ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER id');
  }

  const [movementColumns] = await connection.execute('SHOW COLUMNS FROM inventario_movimientos');
  if (!movementColumns.some((column) => column.Field === 'organization_id')) {
    await connection.execute('ALTER TABLE inventario_movimientos ADD COLUMN organization_id INT NOT NULL DEFAULT 1 AFTER id');
  }
  if (!movementColumns.some((column) => column.Field === 'product_id')) {
    await connection.execute('ALTER TABLE inventario_movimientos ADD COLUMN product_id INT NULL AFTER organization_id');
  } else if (String(movementColumns.find((column) => column.Field === 'product_id').Type).toLowerCase().replace(/\(\d+\)/, '') !== 'int') {
    await connection.execute('ALTER TABLE inventario_movimientos MODIFY COLUMN product_id INT NULL');
  }

  const [itemIndexes] = await connection.execute('SHOW INDEX FROM inventario_items');
  if (itemIndexes.some((index) => index.Key_name === 'uq_inventario_sku_almacen')) {
    await connection.execute('ALTER TABLE inventario_items DROP INDEX uq_inventario_sku_almacen');
  }
  if (!itemIndexes.some((index) => index.Key_name === 'uq_inventario_org_sku_almacen')) {
    await connection.execute('ALTER TABLE inventario_items ADD UNIQUE KEY uq_inventario_org_sku_almacen (organization_id, sku, warehouse)');
  }

  await ensureInventoryOrganizationForeignKey(connection, 'inventario_items', 'fk_inventario_item_organization');
  await ensureInventoryOrganizationForeignKey(connection, 'inventario_importaciones', 'fk_inventario_importaciones_organization');
  await ensureInventoryOrganizationForeignKey(connection, 'inventario_movimientos', 'fk_inventario_movimientos_organization');

  await ensureScopedInventoryProductForeignKey(
    connection,
    'inventario_items',
    'idx_inventario_org_product',
    'fk_inventario_item_org_product'
  );
  await ensureScopedInventoryProductForeignKey(
    connection,
    'inventario_movimientos',
    'idx_inventario_movimientos_org_product',
    'fk_inventario_movimientos_org_product'
  );
  await ensureScopedInventoryItemForeignKey(connection);

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

const ensureSubscriptionSchema = async (connection) => {
  const superAdminUsername = String(process.env.SUPERADMIN_USERNAME || '').trim();
  if (superAdminUsername) {
    const [result] = await connection.execute(
      "UPDATE usuarios SET role = 'superadmin' WHERE username = ?",
      [superAdminUsername]
    );
    if (!result.affectedRows) {
      console.warn('[AUTH] SUPERADMIN_USERNAME no coincide con ningún usuario existente.');
    }
  }

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_plans (
      code VARCHAR(40) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'MXN',
      interval_unit VARCHAR(10) NOT NULL DEFAULT 'month',
      interval_count INT UNSIGNED NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      stripe_product_id VARCHAR(120) DEFAULT NULL,
      stripe_price_id VARCHAR(120) DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.execute(`
    INSERT IGNORE INTO pos_subscription_plans
      (code, name, description, amount, currency, interval_unit, interval_count)
    VALUES ('monthly', 'Suscripción mensual', 'Acceso mensual al sistema POS', 599.00, 'MXN', 'month', 1)
  `);
  const [planColumns] = await connection.execute('SHOW COLUMNS FROM pos_subscription_plans');
  if (!planColumns.some((column) => column.Field === 'is_active')) {
    await connection.execute('ALTER TABLE pos_subscription_plans ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER interval_count');
  }

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_price_history (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      plan_code VARCHAR(40) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency CHAR(3) NOT NULL,
      interval_unit VARCHAR(10) NOT NULL,
      interval_count INT UNSIGNED NOT NULL DEFAULT 1,
      stripe_price_id VARCHAR(120) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pos_subscription_price_plan (plan_code, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_customers (
      organization_id INT PRIMARY KEY,
      stripe_customer_id VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_pending_signups (
      id CHAR(36) PRIMARY KEY,
      idempotency_key VARCHAR(64) NOT NULL,
      nombre_org VARCHAR(100) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      telefono VARCHAR(20) DEFAULT NULL,
      stripe_customer_id VARCHAR(120) DEFAULT NULL UNIQUE,
      stripe_checkout_session_id VARCHAR(120) DEFAULT NULL UNIQUE,
      status VARCHAR(30) NOT NULL DEFAULT 'checkout_pending',
      organization_id INT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      account_email_sent_at DATETIME DEFAULT NULL,
      account_email_last_attempt_at DATETIME DEFAULT NULL,
      recovery_token_hash CHAR(64) DEFAULT NULL,
      recovery_token_expires_at DATETIME DEFAULT NULL,
      recovery_last_sent_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pos_pending_recovery_token (recovery_token_hash),
      INDEX idx_pos_pending_signups_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [pendingSignupColumns] = await connection.execute('SHOW COLUMNS FROM pos_pending_signups');
  if (!pendingSignupColumns.some((column) => column.Field === 'account_email_last_attempt_at')) {
    await connection.execute(
      'ALTER TABLE pos_pending_signups ADD COLUMN account_email_last_attempt_at DATETIME DEFAULT NULL AFTER account_email_sent_at'
    );
  }
  const pendingSignupColumnNames = new Set(pendingSignupColumns.map((column) => column.Field));
  if (!pendingSignupColumnNames.has('recovery_token_hash')) {
    await connection.execute(
      'ALTER TABLE pos_pending_signups ADD COLUMN recovery_token_hash CHAR(64) DEFAULT NULL AFTER account_email_last_attempt_at'
    );
  }
  if (!pendingSignupColumnNames.has('recovery_token_expires_at')) {
    await connection.execute(
      'ALTER TABLE pos_pending_signups ADD COLUMN recovery_token_expires_at DATETIME DEFAULT NULL AFTER recovery_token_hash'
    );
  }
  if (!pendingSignupColumnNames.has('recovery_last_sent_at')) {
    await connection.execute(
      'ALTER TABLE pos_pending_signups ADD COLUMN recovery_last_sent_at DATETIME DEFAULT NULL AFTER recovery_token_expires_at'
    );
  }
  const [pendingSignupIndexes] = await connection.execute('SHOW INDEX FROM pos_pending_signups');
  if (!pendingSignupIndexes.some((index) => index.Key_name === 'uq_pos_pending_recovery_token')) {
    await connection.execute(
      'ALTER TABLE pos_pending_signups ADD UNIQUE KEY uq_pos_pending_recovery_token (recovery_token_hash)'
    );
  }

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_account_setup_tokens (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pos_account_setup_user (user_id, consumed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscriptions (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL,
      plan_code VARCHAR(40) NOT NULL,
      stripe_customer_id VARCHAR(120) DEFAULT NULL,
      stripe_subscription_id VARCHAR(120) DEFAULT NULL UNIQUE,
      stripe_price_id VARCHAR(120) DEFAULT NULL,
      status VARCHAR(30) NOT NULL,
      current_period_start DATETIME DEFAULT NULL,
      current_period_end DATETIME DEFAULT NULL,
      cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
      canceled_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pos_subscriptions_org (organization_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [subscriptionColumns] = await connection.execute('SHOW COLUMNS FROM pos_subscriptions');
  if (subscriptionColumns.some((column) => column.Field === 'stripe_subscription_id' && column.Null === 'NO')) {
    await connection.execute('ALTER TABLE pos_subscriptions MODIFY COLUMN stripe_subscription_id VARCHAR(120) DEFAULT NULL');
  }
  if (!subscriptionColumns.some((column) => column.Field === 'current_period_start')) {
    await connection.execute('ALTER TABLE pos_subscriptions ADD COLUMN current_period_start DATETIME DEFAULT NULL AFTER status');
  }

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_events (
      event_id VARCHAR(120) PRIMARY KEY,
      event_type VARCHAR(120) NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_payments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      organization_id INT NOT NULL,
      stripe_invoice_id VARCHAR(120) NOT NULL UNIQUE,
      stripe_subscription_id VARCHAR(120) DEFAULT NULL,
      stripe_payment_intent_id VARCHAR(120) DEFAULT NULL,
      invoice_number VARCHAR(80) DEFAULT NULL,
      amount_paid_minor BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL,
      status VARCHAR(30) NOT NULL,
      paid_at DATETIME DEFAULT NULL,
      hosted_invoice_url VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pos_subscription_payments_org (organization_id, paid_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pos_subscription_audit (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      organization_id INT DEFAULT NULL,
      actor_user_id INT DEFAULT NULL,
      action VARCHAR(80) NOT NULL,
      details_json JSON DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pos_subscription_audit_org (organization_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const initializeDatabase = async () => {
  let connection;
  try {
    connection = await getPool().getConnection();
    await ensureLegacyCompatibilitySchema(connection);
    await ensureInventorySchema(connection);
    await ensureSubscriptionSchema(connection);
    return true;
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
    return false;
  } finally {
    connection?.release();
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
