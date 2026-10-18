CREATE DATABASE IF NOT EXISTS ssaxxon_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ssaxxon_pos;

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
