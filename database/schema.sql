-- ============================================================================
-- ACADEMIA DECAM — Esquema de la base de datos
-- MySQL 8.0.16+ · InnoDB · utf8mb4 · 14 tablas
--
-- Basado en el diccionario de datos del informe (sección 4.5). Respeta los nombres de tablas
-- y columnas del informe; lo que se AGREGA (restricciones, índices, comentarios y 3 columnas)
-- está listado en database/README.md.
--
-- RE-EJECUTABLE: todas las tablas usan IF NOT EXISTS, así que correr este archivo dos veces no
-- falla ni borra datos. OJO: si una tabla ya existe con otra definición NO se modifica; para
-- aplicar un esquema nuevo sobre una base vieja usa  npm run db:reset  (borra y recrea todo).
--
-- Los datos de prueba están en seed.sql. Cada columna lleva su COMMENT: el diccionario de datos
-- (database/diccionario-de-datos.md) se genera a partir de ellos con  npm run docs:db .
--
-- Convención de nombres de restricciones:
--   uq_<tabla>_<campos>   UNIQUE          chk_<tabla>_<regla>  CHECK
--   fk_<hija>_<padre>     FOREIGN KEY     idx_<tabla>_<campos> índice de consulta
-- ============================================================================

-- Sin esto, un cliente mysql con otra codificación guarda "Mañana" como "MaÃ±ana".
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS academia_decam
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE academia_decam;

-- ============================================================================
-- 1. PERSONAS Y ACCESO
-- ============================================================================

-- ---------- USUARIO ----------
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario        INT AUTO_INCREMENT PRIMARY KEY
                    COMMENT 'Identificador único del usuario',
  nombre            VARCHAR(60)  NOT NULL
                    COMMENT 'Nombres de la persona',
  apellido          VARCHAR(60)  NOT NULL
                    COMMENT 'Apellidos de la persona',
  correo            VARCHAR(100) NOT NULL
                    COMMENT 'Correo institucional; se usa para iniciar sesión (HU-001)',
  contrasena_hash   VARCHAR(255) NOT NULL
                    COMMENT 'Contraseña cifrada con bcrypt (costo 10); nunca se guarda en texto plano (RNF-02)',
  rol               ENUM('docente','alumno','jefe_academico','registrador') NOT NULL
                    COMMENT 'Rol que define los módulos a los que accede el usuario (HU-001)',
  estado            ENUM('activo','inactivo') NOT NULL DEFAULT 'activo'
                    COMMENT 'activo = puede iniciar sesión; inactivo = acceso suspendido',
  fecha_registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    COMMENT 'Fecha y hora en que se creó la cuenta',
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0
                    COMMENT 'Intentos de inicio de sesión fallidos seguidos; se reinicia al acertar o al bloquear (RNF-02)',
  bloqueado_hasta   DATETIME NULL
                    COMMENT 'Si es una fecha futura, la cuenta está bloqueada hasta ese momento (RNF-02)',
  CONSTRAINT uq_usuario_correo UNIQUE (correo),
  CONSTRAINT chk_usuario_correo CHECK (correo REGEXP '^[^@ ]+@[^@ ]+[.][^@ ]+$'),
  CONSTRAINT chk_usuario_intentos CHECK (intentos_fallidos <= 5),
  INDEX idx_usuario_rol_estado (rol, estado)
) ENGINE=InnoDB COMMENT='Cuenta de acceso de toda persona que entra al sistema (los 4 roles)';

-- ---------- DOCENTE ----------
CREATE TABLE IF NOT EXISTS docente (
  id_docente    INT AUTO_INCREMENT PRIMARY KEY
                COMMENT 'Identificador único del docente',
  id_usuario    INT NOT NULL
                COMMENT 'Cuenta de acceso del docente (un usuario es a lo sumo un docente)',
  dni           VARCHAR(8) NOT NULL
                COMMENT 'Documento de identidad: exactamente 8 dígitos',
  especialidad  VARCHAR(80)
                COMMENT 'Área o curso en que se especializa',
  telefono      VARCHAR(15)
                COMMENT 'Teléfono de contacto',
  CONSTRAINT uq_docente_usuario UNIQUE (id_usuario),
  CONSTRAINT uq_docente_dni UNIQUE (dni),
  CONSTRAINT chk_docente_dni CHECK (dni REGEXP '^[0-9]{8}$'),
  CONSTRAINT fk_docente_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Perfil del usuario con rol docente';

-- ---------- APODERADO ----------
CREATE TABLE IF NOT EXISTS apoderado (
  id_apoderado    INT AUTO_INCREMENT PRIMARY KEY
                  COMMENT 'Identificador único del apoderado',
  id_usuario      INT NULL
                  COMMENT 'Cuenta de acceso, si el apoderado tiene una (no es obligatoria)',
  dni             VARCHAR(8) NOT NULL
                  COMMENT 'Documento de identidad: exactamente 8 dígitos',
  nombre_completo VARCHAR(120) NOT NULL
                  COMMENT 'Nombres y apellidos del apoderado',
  telefono        VARCHAR(15) NOT NULL
                  COMMENT 'Teléfono de contacto',
  direccion       VARCHAR(150)
                  COMMENT 'Domicilio del apoderado',
  correo          VARCHAR(100)
                  COMMENT 'Correo de contacto (lo pide el formulario de matrícula, HU-003)',
  fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                  COMMENT 'Fecha en que se registró (el listado de Registro la muestra, HU-002 CA-001)',
  CONSTRAINT uq_apoderado_dni UNIQUE (dni),
  CONSTRAINT chk_apoderado_correo CHECK (correo IS NULL OR correo REGEXP '^[^@ ]+@[^@ ]+[.][^@ ]+$'),
  CONSTRAINT chk_apoderado_dni CHECK (dni REGEXP '^[0-9]{8}$'),
  CONSTRAINT fk_apoderado_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Responsable legal de uno o más alumnos';

-- ============================================================================
-- 2. ORGANIZACIÓN ACADÉMICA
-- ============================================================================

-- ---------- SECCION ----------
CREATE TABLE IF NOT EXISTS seccion (
  id_seccion       INT AUTO_INCREMENT PRIMARY KEY
                   COMMENT 'Identificador único de la sección',
  nivel            ENUM('Primaria','Secundaria') NOT NULL
                   COMMENT 'Nivel educativo',
  grado            TINYINT NOT NULL
                   COMMENT 'Grado: 1 a 6 en Primaria, 1 a 5 en Secundaria (HU-003 CA-002)',
  letra            CHAR(1) NOT NULL
                   COMMENT 'Letra de la sección (A, B, C...)',
  turno            ENUM('Mañana','Tarde') NOT NULL
                   COMMENT 'Turno en que se dictan las clases',
  aula             VARCHAR(20)
                   COMMENT 'Aula asignada',
  id_docente_tutor INT NULL
                   COMMENT 'Docente tutor de la sección',
  anio_lectivo     YEAR NOT NULL
                   COMMENT 'Año lectivo al que pertenece la sección',
  CONSTRAINT uq_seccion UNIQUE (nivel, grado, letra, anio_lectivo),
  CONSTRAINT chk_seccion_grado CHECK (
    (nivel = 'Primaria' AND grado BETWEEN 1 AND 6) OR (nivel = 'Secundaria' AND grado BETWEEN 1 AND 5)),
  CONSTRAINT chk_seccion_letra CHECK (letra REGEXP '^[A-Z]$'),
  CONSTRAINT fk_seccion_tutor FOREIGN KEY (id_docente_tutor) REFERENCES docente(id_docente)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Grupo de alumnos de un grado, letra y año lectivo (p. ej. 6.° A de Primaria)';

-- ---------- ALUMNO ----------
CREATE TABLE IF NOT EXISTS alumno (
  id_alumno        INT AUTO_INCREMENT PRIMARY KEY
                   COMMENT 'Identificador único del alumno',
  id_usuario       INT NULL
                   COMMENT 'Cuenta de acceso del alumno (un usuario es a lo sumo un alumno)',
  dni              VARCHAR(8) NOT NULL
                   COMMENT 'Documento de identidad: exactamente 8 dígitos',
  fecha_nacimiento DATE NOT NULL
                   COMMENT 'Fecha de nacimiento',
  sexo             ENUM('M','F') NOT NULL
                   COMMENT 'M = masculino, F = femenino',
  direccion        VARCHAR(150)
                   COMMENT 'Domicilio del alumno',
  nivel            ENUM('Primaria','Secundaria') NOT NULL
                   COMMENT 'Nivel educativo en que está registrado',
  id_seccion       INT NULL
                   COMMENT 'Sección en la que está matriculado actualmente',
  id_apoderado     INT NOT NULL
                   COMMENT 'Apoderado responsable del alumno',
  estado           ENUM('activo','inactivo','egresado') NOT NULL DEFAULT 'activo'
                   COMMENT 'activo = estudia actualmente; inactivo = retirado o suspendido; egresado = terminó el colegio',
  CONSTRAINT uq_alumno_usuario UNIQUE (id_usuario),
  CONSTRAINT uq_alumno_dni UNIQUE (dni),
  CONSTRAINT chk_alumno_dni CHECK (dni REGEXP '^[0-9]{8}$'),
  CONSTRAINT fk_alumno_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_alumno_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_alumno_apoderado FOREIGN KEY (id_apoderado) REFERENCES apoderado(id_apoderado)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_alumno_seccion_estado (id_seccion, estado)
) ENGINE=InnoDB COMMENT='Estudiante del colegio (HU-002)';

-- ---------- MATRICULA ----------
CREATE TABLE IF NOT EXISTS matricula (
  id_matricula     INT AUTO_INCREMENT PRIMARY KEY
                   COMMENT 'Identificador único de la matrícula',
  codigo           VARCHAR(10) NOT NULL
                   COMMENT 'Código correlativo único con formato MAT-0001 (HU-003 CA-001)',
  id_alumno        INT NOT NULL
                   COMMENT 'Alumno matriculado',
  id_seccion       INT NOT NULL
                   COMMENT 'Sección en la que se matricula',
  anio_lectivo     YEAR NOT NULL
                   COMMENT 'Año lectivo de la matrícula',
  fecha_matricula  DATE NOT NULL
                   COMMENT 'Fecha en que se registró la matrícula',
  estado           ENUM('activa','inactiva') NOT NULL DEFAULT 'activa'
                   COMMENT 'activa = vigente; inactiva = anulada o retirada (HU-004 CA-002)',
  procedencia      ENUM('nuevo','traslado','promocion') NOT NULL DEFAULT 'nuevo'
                   COMMENT 'Alumno nuevo, traslado de otro colegio o promoción interna (formulario de matrícula, HU-003)',
  observaciones    VARCHAR(200)
                   COMMENT 'Notas libres: procedencia, motivo de retiro, etc.',
  CONSTRAINT uq_matricula_codigo UNIQUE (codigo),
  CONSTRAINT uq_matricula_alumno_anio UNIQUE (id_alumno, anio_lectivo),
  CONSTRAINT chk_matricula_codigo CHECK (codigo REGEXP '^MAT-[0-9]{4,6}$'),
  CONSTRAINT fk_matricula_alumno FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_matricula_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_matricula_seccion_estado (id_seccion, estado)
) ENGINE=InnoDB COMMENT='Inscripción de un alumno en una sección durante un año lectivo (una por alumno y año)';

-- ---------- HORARIO ----------
CREATE TABLE IF NOT EXISTS horario (
  id_horario   INT AUTO_INCREMENT PRIMARY KEY
               COMMENT 'Identificador único del bloque horario',
  id_seccion   INT NOT NULL
               COMMENT 'Sección que recibe la clase',
  dia_semana   ENUM('Lunes','Martes','Miercoles','Jueves','Viernes') NOT NULL
               COMMENT 'Día de la semana',
  hora_inicio  TIME NOT NULL
               COMMENT 'Hora en que empieza la clase',
  hora_fin     TIME NOT NULL
               COMMENT 'Hora en que termina la clase',
  curso        VARCHAR(60) NOT NULL
               COMMENT 'Curso que se dicta en el bloque',
  id_docente   INT NOT NULL
               COMMENT 'Docente que dicta la clase',
  CONSTRAINT uq_horario_seccion_bloque UNIQUE (id_seccion, dia_semana, hora_inicio),
  CONSTRAINT uq_horario_docente_bloque UNIQUE (id_docente, dia_semana, hora_inicio),
  CONSTRAINT chk_horario_horas CHECK (hora_fin > hora_inicio),
  CONSTRAINT fk_horario_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_horario_docente FOREIGN KEY (id_docente) REFERENCES docente(id_docente)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Bloque semanal de clases; una sección no puede tener dos clases a la vez ni un docente estar en dos aulas';

-- ============================================================================
-- 3. GESTIÓN ACADÉMICA
-- ============================================================================

-- ---------- CALIFICACION ----------
CREATE TABLE IF NOT EXISTS calificacion (
  id_calificacion INT AUTO_INCREMENT PRIMARY KEY
                  COMMENT 'Identificador único del registro de notas',
  id_alumno       INT NOT NULL
                  COMMENT 'Alumno calificado',
  id_seccion      INT NOT NULL
                  COMMENT 'Sección en la que se registran las notas',
  examen1         DECIMAL(4,2)
                  COMMENT 'Nota del examen 1 (0 a 20); NULL = aún no registrada',
  examen2         DECIMAL(4,2)
                  COMMENT 'Nota del examen 2 (0 a 20); NULL = aún no registrada',
  tareas          DECIMAL(4,2)
                  COMMENT 'Nota de tareas (0 a 20); NULL = aún no registrada',
  proyecto        DECIMAL(4,2)
                  COMMENT 'Nota del proyecto (0 a 20); NULL = aún no registrada',
  promedio        DECIMAL(4,2)
                  COMMENT 'Promedio de las notas registradas, con 2 decimales; Aprobado desde 11.00 (HU-005 CA-001)',
  periodo         VARCHAR(20) NOT NULL
                  COMMENT 'Periodo académico (Bimestre I a IV)',
  CONSTRAINT uq_calificacion UNIQUE (id_alumno, id_seccion, periodo),
  CONSTRAINT chk_calificacion_notas CHECK (
        (examen1  IS NULL OR examen1  BETWEEN 0 AND 20)
    AND (examen2  IS NULL OR examen2  BETWEEN 0 AND 20)
    AND (tareas   IS NULL OR tareas   BETWEEN 0 AND 20)
    AND (proyecto IS NULL OR proyecto BETWEEN 0 AND 20)
    AND (promedio IS NULL OR promedio BETWEEN 0 AND 20)),
  CONSTRAINT chk_calificacion_periodo CHECK (periodo IN ('Bimestre I','Bimestre II','Bimestre III','Bimestre IV')),
  CONSTRAINT fk_calificacion_alumno FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_calificacion_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_calificacion_seccion_periodo (id_seccion, periodo)
) ENGINE=InnoDB COMMENT='Notas de un alumno en una sección y periodo (HU-005, HU-007)';

-- ---------- ASISTENCIA ----------
CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia        INT AUTO_INCREMENT PRIMARY KEY
                       COMMENT 'Identificador único del registro de asistencia',
  id_alumno            INT NOT NULL
                       COMMENT 'Alumno al que se le toma asistencia',
  id_seccion           INT NOT NULL
                       COMMENT 'Sección en la que se pasa lista',
  fecha                DATE NOT NULL
                       COMMENT 'Día de la asistencia',
  estado               ENUM('presente','ausente','tardanza') NOT NULL
                       COMMENT 'Asistencia del alumno ese día; la tardanza cuenta como asistencia',
  id_docente_registra  INT NOT NULL
                       COMMENT 'Docente que pasó la lista',
  CONSTRAINT uq_asistencia UNIQUE (id_alumno, id_seccion, fecha),
  CONSTRAINT fk_asistencia_alumno FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_asistencia_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_asistencia_docente FOREIGN KEY (id_docente_registra) REFERENCES docente(id_docente)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_asistencia_seccion_fecha (id_seccion, fecha)
) ENGINE=InnoDB COMMENT='Asistencia diaria de un alumno (HU-008, HU-009); un registro por alumno, sección y día';

-- ---------- TAREA ----------
CREATE TABLE IF NOT EXISTS tarea (
  id_tarea          INT AUTO_INCREMENT PRIMARY KEY
                    COMMENT 'Identificador único de la tarea',
  titulo            VARCHAR(100) NOT NULL
                    COMMENT 'Título de la tarea o evaluación',
  descripcion       VARCHAR(300)
                    COMMENT 'Indicaciones para los alumnos',
  tipo              ENUM('Tarea','Examen','Proyecto','Exposición') NOT NULL DEFAULT 'Tarea'
                    COMMENT 'Clase de actividad (HU-010)',
  id_seccion        INT NOT NULL
                    COMMENT 'Sección a la que se asigna',
  id_docente        INT NOT NULL
                    COMMENT 'Docente que la publica',
  fecha_asignacion  DATE NOT NULL
                    COMMENT 'Día en que se publicó',
  fecha_entrega     DATE NOT NULL
                    COMMENT 'Fecha límite de entrega',
  CONSTRAINT fk_tarea_seccion FOREIGN KEY (id_seccion) REFERENCES seccion(id_seccion)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tarea_docente FOREIGN KEY (id_docente) REFERENCES docente(id_docente)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_tarea_seccion_entrega (id_seccion, fecha_entrega)
) ENGINE=InnoDB COMMENT='Tarea, examen, proyecto o exposición asignado a una sección (HU-010)';

-- ---------- ENTREGA_TAREA ----------
CREATE TABLE IF NOT EXISTS entrega_tarea (
  id_entrega          INT AUTO_INCREMENT PRIMARY KEY
                      COMMENT 'Identificador único de la entrega',
  id_tarea            INT NOT NULL
                      COMMENT 'Tarea a la que corresponde',
  id_alumno           INT NOT NULL
                      COMMENT 'Alumno que entrega',
  estado              ENUM('pendiente','entregada','atrasada') NOT NULL DEFAULT 'pendiente'
                      COMMENT 'pendiente = en plazo y sin entregar; entregada = ya entregada; atrasada = venció sin entregar',
  fecha_entrega_real  DATETIME
                      COMMENT 'Momento en que el alumno entregó; obligatorio si el estado es entregada',
  comentario          VARCHAR(200)
                      COMMENT 'Observación del alumno o del docente',
  CONSTRAINT uq_entrega UNIQUE (id_tarea, id_alumno),
  CONSTRAINT chk_entrega_fecha_real CHECK (estado <> 'entregada' OR fecha_entrega_real IS NOT NULL),
  CONSTRAINT fk_entrega_tarea FOREIGN KEY (id_tarea) REFERENCES tarea(id_tarea)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_entrega_alumno FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Cumplimiento de una tarea por un alumno (HU-010 CA-003)';

-- ============================================================================
-- 4. COMUNICACIÓN
-- ============================================================================

-- ---------- RECLAMO ----------
CREATE TABLE IF NOT EXISTS reclamo (
  id_reclamo        INT AUTO_INCREMENT PRIMARY KEY
                    COMMENT 'Identificador único del reclamo',
  id_usuario_autor  INT NOT NULL
                    COMMENT 'Usuario que registra el reclamo (HU-011 CA-001)',
  asunto            VARCHAR(120) NOT NULL
                    COMMENT 'Resumen del reclamo (obligatorio, HU-011 CA-002)',
  tipo              VARCHAR(50) NOT NULL
                    COMMENT 'Categoría: calificacion, asistencia, trato, administrativo u otro',
  prioridad         ENUM('normal','alta','urgente') NOT NULL DEFAULT 'normal'
                    COMMENT 'Urgencia con que debe atenderse',
  descripcion       VARCHAR(500) NOT NULL
                    COMMENT 'Detalle del reclamo (obligatorio, HU-011 CA-002)',
  estado            ENUM('pendiente','revision','resuelto') NOT NULL DEFAULT 'pendiente'
                    COMMENT 'Avanza pendiente, revision y resuelto; solo lo cambia el Jefe Académico (HU-011 CA-003)',
  fecha_registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    COMMENT 'Fecha y hora en que se registró',
  CONSTRAINT chk_reclamo_tipo CHECK (tipo IN ('calificacion','asistencia','trato','administrativo','otro')),
  CONSTRAINT fk_reclamo_autor FOREIGN KEY (id_usuario_autor) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_reclamo_estado_prioridad (estado, prioridad),
  INDEX idx_reclamo_fecha (fecha_registro)
) ENGINE=InnoDB COMMENT='Reclamo académico o administrativo (HU-011)';

-- ---------- AVISO ----------
CREATE TABLE IF NOT EXISTS aviso (
  id_aviso            INT AUTO_INCREMENT PRIMARY KEY
                      COMMENT 'Identificador único del aviso',
  titulo              VARCHAR(120) NOT NULL
                      COMMENT 'Título del aviso',
  contenido           VARCHAR(500) NOT NULL
                      COMMENT 'Texto del aviso',
  id_usuario_autor    INT NOT NULL
                      COMMENT 'Usuario que lo publica; solo el Jefe Académico (RF-12)',
  fecha_publicacion   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                      COMMENT 'Fecha y hora de publicación (HU-012 CA-001)',
  destinatarios       ENUM('todos','docentes','alumnos') NOT NULL DEFAULT 'todos'
                      COMMENT 'Quiénes deben verlo',
  CONSTRAINT fk_aviso_autor FOREIGN KEY (id_usuario_autor) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_aviso_fecha (fecha_publicacion)
) ENGINE=InnoDB COMMENT='Comunicado institucional (HU-012)';

-- ---------- MENSAJE ----------
CREATE TABLE IF NOT EXISTS mensaje (
  id_mensaje        INT AUTO_INCREMENT PRIMARY KEY
                    COMMENT 'Identificador único del mensaje',
  id_remitente      INT NOT NULL
                    COMMENT 'Usuario que envía',
  id_destinatario   INT NOT NULL
                    COMMENT 'Usuario que recibe',
  contenido         VARCHAR(1000) NOT NULL
                    COMMENT 'Texto del mensaje',
  fecha_envio       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    COMMENT 'Fecha y hora de envío',
  leido             BOOLEAN NOT NULL DEFAULT FALSE
                    COMMENT 'TRUE cuando el destinatario ya lo abrió',
  CONSTRAINT fk_mensaje_remitente FOREIGN KEY (id_remitente) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_mensaje_destinatario FOREIGN KEY (id_destinatario) REFERENCES usuario(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_mensaje_bandeja (id_destinatario, leido, fecha_envio)
) ENGINE=InnoDB COMMENT='Mensaje directo entre dos usuarios';
