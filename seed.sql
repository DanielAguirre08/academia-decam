-- ============================================================
-- ACADEMIA DECAM — Datos de prueba (NO forma parte del esquema)
-- ------------------------------------------------------------
-- schema.sql solo crea las tablas. Este archivo carga los usuarios de prueba (uno por rol),
-- las secciones y los alumnos, para poder ver y probar el sistema de punta a punta.
--
-- Es idempotente: usa INSERT IGNORE con claves explícitas, así que se puede correr varias
-- veces sin duplicar nada. Los usuarios, además, vuelven a su contraseña de prueba y quedan
-- desbloqueados (útil después de probar el bloqueo por intentos fallidos, RNF-02).
--
--   mysql --default-character-set=utf8mb4 -u root < seed.sql
--
-- CONTRASEÑAS DE PRUEBA (guardadas como hash bcrypt, costo 10, nunca en texto plano):
--   prof@acadecam.edu.pe         decam2024     docente
--   alumno@acadecam.edu.pe       alumno2024    alumno (6-A)
--   jefe@acadecam.edu.pe         jefe2024      jefe_academico
--   registrador@acadecam.edu.pe  reg2024       registrador
--   (los otros 6 alumnos usan alumno2024)
-- ============================================================
SET NAMES utf8mb4;
USE academia_decam;

-- ---------- Usuarios de prueba: uno por rol ----------
INSERT INTO usuario (id_usuario, nombre, apellido, correo, contrasena_hash, rol) VALUES
  (1, 'Profesor',    'Demo',     'prof@acadecam.edu.pe',        '$2b$10$mGDQyhbeV5f7dRYJmwdb3eMOwX.X8iMwvkl3cv3rzJdTWN5FdiP4O', 'docente'),
  (2, 'Jefe',        'Académico','jefe@acadecam.edu.pe',        '$2b$10$Dz.V.qW5p0PogKIJujJKEesTyS3dAVTNENB2RyHujugwGVqyGW.Pe', 'jefe_academico'),
  (3, 'Registrador', 'Demo',     'registrador@acadecam.edu.pe', '$2b$10$NEhAx6obsp.Rf8.2y9jqs.CvMh151dMv3fw3PKOlp2vwkmaF5LuMW', 'registrador')
ON DUPLICATE KEY UPDATE contrasena_hash = VALUES(contrasena_hash), intentos_fallidos = 0, bloqueado_hasta = NULL;

INSERT IGNORE INTO docente (id_docente, id_usuario, dni, especialidad) VALUES
  (1, 1, '10000001', 'Matemática');

-- ---------- Secciones: 6-A (tutor: el docente demo) y 5-A, para que el filtro por grupo sea demostrable ----------
INSERT IGNORE INTO seccion (id_seccion, nivel, grado, letra, turno, aula, id_docente_tutor, anio_lectivo) VALUES
  (1, 'Primaria', 6, 'A', 'Mañana', NULL,      1, 2026),
  (2, 'Primaria', 5, 'A', 'Mañana', 'Aula 12', 1, 2026);

-- ---------- Apoderado (ALUMNO.id_apoderado es NOT NULL, así que hace falta al menos uno) ----------
INSERT IGNORE INTO apoderado (id_apoderado, id_usuario, dni, nombre_completo, telefono, direccion) VALUES
  (1, NULL, '40000001', 'Apoderado Demo', '999000111', 'Av. Siempre Viva 123');

-- ---------- Usuarios de los alumnos (101 a 106 + la cuenta demo 107) ----------
INSERT INTO usuario (id_usuario, nombre, apellido, correo, contrasena_hash, rol) VALUES
  (101, 'Ana',    'Torres', 'ana.torres@acadecam.edu.pe',    '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (102, 'Luis',   'Perez',  'luis.perez@acadecam.edu.pe',    '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (103, 'Maria',  'Gomez',  'maria.gomez@acadecam.edu.pe',   '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (104, 'Carlos', 'Ruiz',   'carlos.ruiz@acadecam.edu.pe',   '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (105, 'Sofia',  'Vargas', 'sofia.vargas@acadecam.edu.pe',  '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (106, 'Diego',  'Salas',  'diego.salas@acadecam.edu.pe',   '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno'),
  (107, 'Alumno', 'Demo',   'alumno@acadecam.edu.pe',        '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC', 'alumno')
ON DUPLICATE KEY UPDATE contrasena_hash = VALUES(contrasena_hash), intentos_fallidos = 0, bloqueado_hasta = NULL;

-- ---------- Alumnos: 5 en la sección 1 (6-A) y 2 en la sección 2 (5-A) ----------
INSERT IGNORE INTO alumno (id_alumno, id_usuario, dni, fecha_nacimiento, sexo, direccion, nivel, id_seccion, id_apoderado, estado) VALUES
  (1, 101, '70000001', '2014-03-11', 'F', 'Jr. Las Flores 220', 'Primaria', 1, 1, 'activo'),
  (2, 102, '70000002', '2014-07-02', 'M', 'Av. Los Olivos 88',  'Primaria', 1, 1, 'activo'),
  (3, 103, '70000003', '2014-01-25', 'F', 'Calle Union 45',     'Primaria', 1, 1, 'activo'),
  (4, 104, '70000004', '2014-11-09', 'M', 'Jr. Arequipa 601',   'Primaria', 1, 1, 'activo'),
  (5, 105, '70000005', '2015-05-18', 'F', 'Av. Brasil 1420',    'Primaria', 2, 1, 'activo'),
  (6, 106, '70000006', '2015-09-30', 'M', 'Jr. Cusco 310',      'Primaria', 2, 1, 'activo'),
  (7, 107, '70000007', '2014-06-15', 'M', 'Av. Central 100',    'Primaria', 1, 1, 'activo');

-- ---------- Calificaciones (el promedio lo recalcula la capa de Lógica, aquí va el valor coherente) ----------
-- Mezcla intencional de Aprobados (>= 11.00), Desaprobados (< 11.00) y "Sin calificar" (todo NULL),
-- para poder probar el filtro por estado de CA-003 sin tener que capturar notas a mano.
INSERT IGNORE INTO calificacion (id_calificacion, id_alumno, id_seccion, examen1, examen2, tareas, proyecto, promedio, periodo) VALUES
  (1, 1, 1, 15.00, 16.00, 18.00, 17.00, 16.50, 'Bimestre I'),
  (2, 2, 1,  8.00,  9.00, 10.00,  7.00,  8.50, 'Bimestre I'),
  (3, 3, 1, 12.50, 14.00, 13.00, NULL,  13.17, 'Bimestre I'),
  (4, 4, 1,  NULL,  NULL,  NULL, NULL,   NULL, 'Bimestre I'),
  (5, 5, 2, 19.00, 18.00, 20.00, 19.00, 19.00, 'Bimestre I'),
  (6, 6, 2, 10.00, 11.00,  9.00, 12.00, 10.50, 'Bimestre I'),
  (7, 7, 1, 14.00, 13.00, 15.00, 16.00, 14.50, 'Bimestre I');

-- ---------- Una tarea ya vencida y otra vigente (para ver "Atrasada" vs "Pendiente" en HU-010) ----------
INSERT IGNORE INTO tarea (id_tarea, titulo, descripcion, tipo, id_seccion, id_docente, fecha_asignacion, fecha_entrega) VALUES
  (1, 'Practica de fracciones', 'Resolver los ejercicios 1 al 20 del capitulo 4.', 'Tarea',      1, 1, '2026-09-01', '2026-09-10'),
  (2, 'Exposicion de Ciencias', 'Exposicion grupal sobre el ciclo del agua.',      'Exposición', 1, 1, '2026-09-15', '2026-12-20');

SELECT 'Datos de prueba cargados' AS resultado,
       (SELECT COUNT(*) FROM usuario)      AS usuarios,
       (SELECT COUNT(*) FROM alumno)       AS alumnos,
       (SELECT COUNT(*) FROM calificacion) AS calificaciones,
       (SELECT COUNT(*) FROM tarea)        AS tareas;
