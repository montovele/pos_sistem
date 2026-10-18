-- ============================================================================
-- BASE DE DATOS: ssaxxon_pos (Sistema POS)
-- ============================================================================
-- Script SQL para crear la estructura completa de la BD
-- Incluye tablas de catálogo, transacciones y control
-- ============================================================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS ssaxxon_pos DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ssaxxon_pos;

-- ============================================================================
-- TABLAS DE CATÁLOGO Y CONFIGURACIÓN
-- ============================================================================

-- Tabla de Organizaciones
CREATE TABLE IF NOT EXISTS organizaciones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_org VARCHAR(100) NOT NULL,
    ruc VARCHAR(50) UNIQUE,
    direccion VARCHAR(255),
    telefono VARCHAR(20),
    correo VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_activo (activo),
    INDEX idx_nombre (nombre_org)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Turnos
CREATE TABLE IF NOT EXISTS turnos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_turno VARCHAR(50) NOT NULL UNIQUE,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    descripcion TEXT,
    org_id INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nombre (nombre_turno),
    INDEX idx_activo (activo),
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Puestos/Cargos
CREATE TABLE IF NOT EXISTS puestos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_puesto VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    org_id INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nombre (nombre_puesto),
    INDEX idx_activo (activo),
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Categorías de Productos
CREATE TABLE IF NOT EXISTS categorias (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_categoria VARCHAR(100) NOT NULL,
    descripcion TEXT,
    org_id INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nombre (nombre_categoria),
    INDEX idx_activo (activo),
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE EMPLEADOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS empleados (
    id INT PRIMARY KEY AUTO_INCREMENT,
    numero_empleado VARCHAR(50) NOT NULL UNIQUE,
    cedula VARCHAR(20) UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100),
    org_id INT NOT NULL,
    id_puesto INT,
    id_turno INT,
    nss VARCHAR(50),
    foto VARCHAR(255),
    fondoDeCaja DECIMAL(10,2) DEFAULT 0.00,
    identificador VARCHAR(100) UNIQUE,
    activo BOOLEAN DEFAULT TRUE,
    fecha_ingreso DATE,
    fecha_salida DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_cedula (cedula),
    INDEX idx_numero_empleado (numero_empleado),
    INDEX idx_activo (activo),
    INDEX idx_org_id (org_id),
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (id_puesto) REFERENCES puestos(id) ON DELETE SET NULL,
    FOREIGN KEY (id_turno) REFERENCES turnos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE PRODUCTOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo_producto VARCHAR(50) NOT NULL,
    codigo_alterno VARCHAR(50),
    nombre_producto VARCHAR(255) NOT NULL,
    descripcion TEXT,
    precio_unitario DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 0,
    id_categoria INT,
    org_id INT NOT NULL,
    foto_prod VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_producto_org (codigo_producto, org_id),
    INDEX idx_nombre (nombre_producto),
    INDEX idx_categoria (id_categoria),
    INDEX idx_org_id (org_id),
    INDEX idx_activo (activo),
    INDEX idx_stock (stock),
    FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE SESIONES DE CAJA
-- ============================================================================

CREATE TABLE IF NOT EXISTS cajero_activo (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cajero_activo VARCHAR(100) NOT NULL,
    numero_empleado VARCHAR(50),
    org_id INT,
    numero_ident_caja VARCHAR(50),
    fondo_caja DECIMAL(10,2) DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE,
    fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME,
    total_ventas DECIMAL(10,2) DEFAULT 0.00,
    observaciones TEXT,
    INDEX idx_cajero (cajero_activo),
    INDEX idx_activo (activo),
    INDEX idx_fecha_apertura (fecha_apertura),
    INDEX idx_numero_empleado (numero_empleado),
    FOREIGN KEY (numero_empleado) REFERENCES empleados(numero_empleado) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SESIONES DE CAJA DEL POS
-- Una fila representa una apertura y conserva su cierre para el historial.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_sessions (
    id VARCHAR(80) PRIMARY KEY,
    numero_empleado INT NOT NULL,
    cajero VARCHAR(120) NOT NULL,
    base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    abierta BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME NULL,
    efectivo_contado DECIMAL(12,2) NULL,
    diferencia DECIMAL(12,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cash_employee_open (numero_empleado, abierta),
    INDEX idx_cash_employee_history (numero_empleado, fecha_apertura),
    INDEX idx_cash_opened_at (fecha_apertura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TRANSACCIONES DEL POS VINCULADAS A UNA SESION DE CAJA
-- ============================================================================

CREATE TABLE IF NOT EXISTS transacciones (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    organization_id INT NOT NULL DEFAULT 1,
    client_transaction_id VARCHAR(120) DEFAULT NULL,
    device_id VARCHAR(120) DEFAULT NULL,
    codigo_transaccion VARCHAR(80) NOT NULL UNIQUE,
    codigo_ticket VARCHAR(80) NOT NULL UNIQUE,
    fecha_trans TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    items JSON NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    nombre_cajero VARCHAR(120) NOT NULL DEFAULT 'Sistema',
    numero_empleado INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
    cash_session_id VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transactions_cash_session (cash_session_id),
    INDEX idx_transactions_employee (numero_empleado),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_date (fecha_trans),
    UNIQUE KEY uq_transacciones_offline_identity (organization_id, device_id, client_transaction_id),
    CONSTRAINT fk_transactions_cash_session
        FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE TRANSACCIONES DE VENTAS (VENTAS_POS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ventas_pos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo_transaccion VARCHAR(100) NOT NULL UNIQUE,
    codigo_ticket VARCHAR(100) NOT NULL,
    cantidad INT NOT NULL,
    codigo_producto VARCHAR(50) NOT NULL,
    codigo_alterno VARCHAR(50),
    nombre_producto VARCHAR(255) NOT NULL,
    precio_articulo DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) GENERATED ALWAYS AS (cantidad * precio_articulo) STORED,
    fecha_transaccion DATETIME DEFAULT CURRENT_TIMESTAMP,
    org_id INT,
    id_categoria INT,
    foto_prod VARCHAR(255),
    nombre_cajero VARCHAR(100),
    numero_empleado VARCHAR(50),
    estado ENUM('pendiente', 'completada', 'cancelada', 'devuelta') DEFAULT 'completada',
    motivo_cancelacion VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_codigo_transaccion (codigo_transaccion),
    INDEX idx_fecha_transaccion (fecha_transaccion),
    INDEX idx_numero_empleado (numero_empleado),
    INDEX idx_org_id (org_id),
    INDEX idx_codigo_ticket (codigo_ticket),
    INDEX idx_estado (estado),
    FOREIGN KEY (numero_empleado) REFERENCES empleados(numero_empleado) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL,
    FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE ARQUEO DE CAJA
-- ============================================================================

CREATE TABLE IF NOT EXISTS arqueo_caja (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cash_session_id VARCHAR(80),
    numero_empleado VARCHAR(50),
    org_id INT,
    fecha_arqueo DATETIME DEFAULT CURRENT_TIMESTAMP,
    monto_inicial DECIMAL(10,2),
    monto_final DECIMAL(10,2),
    efectivo_contado DECIMAL(10,2),
    total_efectivo DECIMAL(10,2) DEFAULT 0.00,
    total_esperado DECIMAL(10,2) DEFAULT 0.00,
    diferencia DECIMAL(10,2) GENERATED ALWAYS AS (efectivo_contado - total_esperado) STORED,
    cantidad_transacciones INT DEFAULT 0,
    total_ventas DECIMAL(10,2) DEFAULT 0.00,
    observaciones TEXT,
    estado ENUM('pendiente', 'aprobado', 'rechazado') DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_numero_empleado (numero_empleado),
    INDEX idx_cash_session (cash_session_id),
    INDEX idx_fecha_arqueo (fecha_arqueo),
    INDEX idx_org_id (org_id),
    FOREIGN KEY (numero_empleado) REFERENCES empleados(numero_empleado) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES organizaciones(id) ON DELETE SET NULL,
    CONSTRAINT fk_arqueo_cash_session
        FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLA DE AUDITORÍA (Recomendada)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tabla_afectada VARCHAR(100) NOT NULL,
    operacion ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    id_registro INT,
    usuario VARCHAR(100),
    descripcion TEXT,
    valores_anteriores JSON,
    valores_nuevos JSON,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_usuario VARCHAR(45),
    INDEX idx_tabla (tabla_afectada),
    INDEX idx_fecha (fecha_cambio),
    INDEX idx_operacion (operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista: Resumen de ventas por empleado
CREATE OR REPLACE VIEW venta_por_empleado AS
SELECT 
    e.numero_empleado,
    e.nombre,
    COUNT(vp.id) as total_transacciones,
    SUM(vp.subtotal) as total_ventas,
    DATE(vp.fecha_transaccion) as fecha
FROM empleados e
LEFT JOIN ventas_pos vp ON e.numero_empleado = vp.numero_empleado
GROUP BY e.numero_empleado, e.nombre, DATE(vp.fecha_transaccion);

-- Vista: Stock bajo (menos de 10 unidades)
CREATE OR REPLACE VIEW productos_stock_bajo AS
SELECT 
    id,
    codigo_producto,
    nombre_producto,
    stock,
    id_categoria,
    org_id
FROM products
WHERE stock < 10 AND activo = TRUE;

-- Vista: Cajas activas
CREATE OR REPLACE VIEW cajas_activas AS
SELECT 
    ca.id,
    ca.cajero_activo,
    e.nombre as nombre_empleado,
    ca.numero_ident_caja,
    ca.fondo_caja,
    ca.fecha_apertura,
    TIMEDIFF(NOW(), ca.fecha_apertura) as tiempo_abierta
FROM cajero_activo ca
LEFT JOIN empleados e ON ca.numero_empleado = e.numero_empleado
WHERE ca.activo = TRUE;

-- ============================================================================
-- ÍNDICES ADICIONALES PARA OPTIMIZACIÓN
-- ============================================================================

CREATE INDEX idx_ventas_pos_empresa_fecha ON ventas_pos(org_id, fecha_transaccion);
CREATE INDEX idx_ventas_pos_empleado_fecha ON ventas_pos(numero_empleado, fecha_transaccion);
CREATE INDEX idx_empleados_org ON empleados(org_id, activo);
CREATE INDEX idx_products_org_categoria ON products(org_id, id_categoria);

-- ============================================================================
-- INSERCIONES DE DATOS INICIALES (Opcionales)
-- ============================================================================

-- Insertar organización por defecto
INSERT INTO organizaciones (nombre_org, ruc, direccion) 
VALUES ('Organización Principal', 'RUC-000001', 'Matriz') 
ON DUPLICATE KEY UPDATE nombre_org = VALUES(nombre_org);

-- Insertar turnos por defecto
INSERT IGNORE INTO turnos (nombre_turno, hora_inicio, hora_fin, org_id) VALUES
('Mañana', '06:00:00', '14:00:00', 1),
('Tarde', '14:00:00', '22:00:00', 1),
('Noche', '22:00:00', '06:00:00', 1);

-- Insertar puestos por defecto
INSERT IGNORE INTO puestos (nombre_puesto, descripcion, org_id) VALUES
('Cajero', 'Personal de caja', 1),
('Vendedor', 'Personal de ventas', 1),
('Gerente', 'Gerente de tienda', 1),
('Supervisor', 'Supervisor de turno', 1);

-- Insertar categorías por defecto
INSERT IGNORE INTO categorias (nombre_categoria, org_id) VALUES
('Electrónica', 1),
('Ropa', 1),
('Alimentos', 1),
('Bebidas', 1),
('Otros', 1);

-- ============================================================================
-- COMPATIBILIDAD CON EL BACKEND ACTUAL
-- ============================================================================
-- El backend usa un esquema legado con tablas usuarios/productos/transacciones.
-- Para evitar romper la API y mantener el modelo real de la base de datos,
-- se crean tablas de compatibilidad que alimentan las consultas del servicio.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    activo = VALUES(activo);

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    image = VALUES(image);

CREATE TABLE IF NOT EXISTS transacciones (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    organization_id INT NOT NULL DEFAULT 1,
    client_transaction_id VARCHAR(120) DEFAULT NULL,
    device_id VARCHAR(120) DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- INFORMACIÓN DE CONEXIÓN
-- ============================================================================
-- Base de datos: ssaxxon_pos
-- Usuario: root
-- Password: configurar mediante DB_PASSWORD o dejar vacío si no se usa contraseña
-- Host: localhost
-- Puerto: 3306
-- ============================================================================
