-- ============================================================
-- ACADEMIA DECAM — Esquema de Base de Datos
-- MySQL 8.0 · InnoDB · utf8mb4
-- Corresponde 1 a 1 con el diccionario de datos del informe (sección 4.5)
--
-- Es RE-EJECUTABLE: todas las tablas usan IF NOT EXISTS, así que correrlo dos veces no falla
-- ni borra datos. Este archivo solo crea la estructura; los datos de prueba están en seed.sql.
-- Para empezar de cero (borra TODO): mysql -u root < reset.sql
--
-- Cambios respecto a la versión original (actualizar el diccionario de datos del informe):
--   usuario.intentos_fallidos  -> RNF-02, bloqueo de cuenta tras 5 intentos fallidos
--   usuario.bloqueado_hasta    -> RNF-02, hasta cuándo dura el bloqueo
--   tarea.tipo                 -> HU-010, Tarea / Examen / Proyecto / Exposición
-- ============================================================

-- Sin esto, un cliente mysql con otra codificación guarda "Mañana" como "MaÃ±ana".
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS academia_decam
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE academia_decam;

-- ---------- USUARIO ----------
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario        INT AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(60)  NOT NULL,
  apellido          VARCHAR(60)  NOT NULL,
  correo            VARCHAR(100) NOT NULL UNIQUE,
  contrasena_hash   VARCHAR(255) NOT NULL,
  rol               ENUM('docente','alumno','jefe_academico','registrador') NOT NULL,
  estado            ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  fecha_registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta   DATETIME NULL
) ENGINE=InnoDB;

-- ---------- DOCENTE ----------
CREATE TABLE IF NOT EXISTS docente (
  id_docente    INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario    INT NOT NULL,
  dni           VARCHAR(8) NOT NULL UNIQUE,
  especialidad  VARCHAR(80),
  telefono      VARCHAR(15),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- APODERADO ----------
CREATE TABLE IF NOT EXISTS apoderado (
  id_apoderado    INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario      INT NULL,
  dni             VARCHAR(8) NOT NULL UNIQUE,
  nombre_completo VARCHAR(120) NOT NULL,
  telefono        VARCHAR(15) NOT NULL,
  direccion       VARCHAR(150),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- SECCION ----------
CREATE TABLE IF NOT EXISTS seccion (
  id_seccion       INT AUTO_INCREMENT PRIMARY KEY,
  nivel            ENUM('Primaria','Secundaria') NOT NULL,
  grado            TINYINT NOT NULL,
  letra            CHAR(1) NOT NULL,
  turno            ENUM('Mañana','Tarde') NOT NULL,
  aula             VARCHAR(20),
  id_docente_tutor INT NULL,
  anio_lectivo     YEAR NOT NULL,
  FOREIGN KEY (id_docente_tutor) REFERENCES docente(id_docente) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- ALUMNO ----------
CREATE TABLE IF NOT EXISTS alumno (
  id_alumno        INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario       INT NULL,
  dni              VARCHAR(8) NOT NULL UNIQUE,
  fecha_nacimiento DATE NOT NULL,
  sexo             ENUM('M','F') NOT NULL,
  direccion        VARCHAR(150),
  nivel            ENUM('Primaria','Secundaria') NOT NULL,
  id_seccion       INT NULL,
  id_apoderado     INT NOT NULL,
  estado           ENUM('activo','inactivo','egresado') NOT NULL DEFAULT 'activo',
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (id_apoderado) REFERENCES apoderado(id_apoderado) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- MATRICULA ----------
CREATE TABLE IF NOT EXISTS matricula (
  id_matricula     INT AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(10) NOT NULL UNIQUE,
  id_alumno        INT NOT NULL,
  id_seccion       INT NOT NULL,
  anio_lectivo     YEAR NOT NULL,
  fecha_matricula  DATE NOT NULL,
  estado           ENUM('activa','inactiva') NOT NULL DEFAULT 'activa',
  observaciones    VARCHAR(200),
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- CALIFICACION ----------
CREATE TABLE IF NOT EXISTS calificacion (
  id_calificacion INT AUTO_INCREMENT PRIMARY KEY,
  id_alumno       INT NOT NULL,
  id_seccion      INT NOT NULL,
  examen1         DECIMAL(4,2),
  examen2         DECIMAL(4,2),
  tareas          DECIMAL(4,2),
  proyecto        DECIMAL(4,2),
  promedio        DECIMAL(4,2),
  periodo         VARCHAR(20) NOT NULL,
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_calif (id_alumno, id_seccion, periodo)
) ENGINE=InnoDB;

-- ---------- ASISTENCIA ----------
CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia        INT AUTO_INCREMENT PRIMARY KEY,
  id_alumno            INT NOT NULL,
  id_seccion           INT NOT NULL,
  fecha                DATE NOT NULL,
  estado               ENUM('presente','ausente','tardanza') NOT NULL,
  id_docente_registra  INT NOT NULL,
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_docente_registra) REFERENCES docente(id_docente) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_asistencia (id_alumno, id_seccion, fecha)
) ENGINE=InnoDB;

-- ---------- TAREA ----------
CREATE TABLE IF NOT EXISTS tarea (
  id_tarea          INT AUTO_INCREMENT PRIMARY KEY,
  titulo            VARCHAR(100) NOT NULL,
  descripcion       VARCHAR(300),
  tipo              ENUM('Tarea','Examen','Proyecto','Exposición') NOT NULL DEFAULT 'Tarea',
  id_seccion        INT NOT NULL,
  id_docente        INT NOT NULL,
  fecha_asignacion  DATE NOT NULL,
  fecha_entrega     DATE NOT NULL,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_docente) REFERENCES docente(id_docente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- ENTREGA_TAREA ----------
CREATE TABLE IF NOT EXISTS entrega_tarea (
  id_entrega          INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea            INT NOT NULL,
  id_alumno           INT NOT NULL,
  estado              ENUM('pendiente','entregada','atrasada') NOT NULL DEFAULT 'pendiente',
  fecha_entrega_real  DATETIME,
  comentario          VARCHAR(200),
  FOREIGN KEY (id_tarea) REFERENCES tarea(id_tarea) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_entrega (id_tarea, id_alumno)
) ENGINE=InnoDB;

-- ---------- RECLAMO ----------
CREATE TABLE IF NOT EXISTS reclamo (
  id_reclamo        INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario_autor  INT NOT NULL,
  asunto            VARCHAR(120) NOT NULL,
  tipo              VARCHAR(50) NOT NULL,
  prioridad         ENUM('normal','alta','urgente') NOT NULL DEFAULT 'normal',
  descripcion       VARCHAR(500) NOT NULL,
  estado            ENUM('pendiente','revision','resuelto') NOT NULL DEFAULT 'pendiente',
  fecha_registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario_autor) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- AVISO ----------
CREATE TABLE IF NOT EXISTS aviso (
  id_aviso            INT AUTO_INCREMENT PRIMARY KEY,
  titulo              VARCHAR(120) NOT NULL,
  contenido           VARCHAR(500) NOT NULL,
  id_usuario_autor    INT NOT NULL,
  fecha_publicacion   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  destinatarios       ENUM('todos','docentes','alumnos') NOT NULL DEFAULT 'todos',
  FOREIGN KEY (id_usuario_autor) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- MENSAJE ----------
CREATE TABLE IF NOT EXISTS mensaje (
  id_mensaje        INT AUTO_INCREMENT PRIMARY KEY,
  id_remitente      INT NOT NULL,
  id_destinatario   INT NOT NULL,
  contenido         VARCHAR(1000) NOT NULL,
  fecha_envio       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leido             BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (id_remitente) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_destinatario) REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- HORARIO ----------
CREATE TABLE IF NOT EXISTS horario (
  id_horario   INT AUTO_INCREMENT PRIMARY KEY,
  id_seccion   INT NOT NULL,
  dia_semana   ENUM('Lunes','Martes','Miercoles','Jueves','Viernes') NOT NULL,
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  curso        VARCHAR(60) NOT NULL,
  id_docente   INT NOT NULL,
  FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_docente) REFERENCES docente(id_docente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
