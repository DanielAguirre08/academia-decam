-- ============================================================
-- ACADEMIA DECAM — Datos de prueba (NO forma parte del esquema)
-- ------------------------------------------------------------
-- schema.sql solo crea las tablas + el docente y la sección 6-A. Este archivo agrega
-- alumnos reales para poder ver y probar las 3 HU de punta a punta contra MySQL.
--
-- Es idempotente: usa INSERT IGNORE con claves explícitas, así que se puede correr
-- varias veces sin duplicar nada y sin borrar lo que ya hayas registrado desde la app.
--
--   mysql -u root < seed.sql
-- ============================================================
USE academia_decam;

-- ---------- Una segunda sección, para que el filtro por grupo (CA-003) sea demostrable ----------
INSERT IGNORE INTO seccion (id_seccion, nivel, grado, letra, turno, aula, id_docente_tutor, anio_lectivo) VALUES
  (2, 'Primaria', 5, 'A', 'Mañana', 'Aula 12', 1, 2026);

-- ---------- Apoderado (ALUMNO.id_apoderado es NOT NULL, así que hace falta al menos uno) ----------
INSERT IGNORE INTO apoderado (id_apoderado, id_usuario, dni, nombre_completo, telefono, direccion) VALUES
  (1, NULL, '40000001', 'Apoderado Demo', '999000111', 'Av. Siempre Viva 123');

-- ---------- Usuarios de los alumnos (para tener nombre y apellido reales) ----------
INSERT IGNORE INTO usuario (id_usuario, nombre, apellido, correo, contrasena_hash, rol) VALUES
  (101, 'Ana',    'Torres', 'ana.torres@acadecam.edu.pe',    '$2b$10$placeholder_hash_reemplazar', 'alumno'),
  (102, 'Luis',   'Perez',  'luis.perez@acadecam.edu.pe',    '$2b$10$placeholder_hash_reemplazar', 'alumno'),
  (103, 'Maria',  'Gomez',  'maria.gomez@acadecam.edu.pe',   '$2b$10$placeholder_hash_reemplazar', 'alumno'),
  (104, 'Carlos', 'Ruiz',   'carlos.ruiz@acadecam.edu.pe',   '$2b$10$placeholder_hash_reemplazar', 'alumno'),
  (105, 'Sofia',  'Vargas', 'sofia.vargas@acadecam.edu.pe',  '$2b$10$placeholder_hash_reemplazar', 'alumno'),
  (106, 'Diego',  'Salas',  'diego.salas@acadecam.edu.pe',   '$2b$10$placeholder_hash_reemplazar', 'alumno');

-- ---------- Alumnos: 4 en la sección 1 (6-A) y 2 en la sección 2 (5-A) ----------
INSERT IGNORE INTO alumno (id_alumno, id_usuario, dni, fecha_nacimiento, sexo, direccion, nivel, id_seccion, id_apoderado, estado) VALUES
  (1, 101, '70000001', '2014-03-11', 'F', 'Jr. Las Flores 220', 'Primaria', 1, 1, 'activo'),
  (2, 102, '70000002', '2014-07-02', 'M', 'Av. Los Olivos 88',  'Primaria', 1, 1, 'activo'),
  (3, 103, '70000003', '2014-01-25', 'F', 'Calle Union 45',     'Primaria', 1, 1, 'activo'),
  (4, 104, '70000004', '2014-11-09', 'M', 'Jr. Arequipa 601',   'Primaria', 1, 1, 'activo'),
  (5, 105, '70000005', '2015-05-18', 'F', 'Av. Brasil 1420',    'Primaria', 2, 1, 'activo'),
  (6, 106, '70000006', '2015-09-30', 'M', 'Jr. Cusco 310',      'Primaria', 2, 1, 'activo');

-- ---------- Calificaciones (el promedio lo recalcula la capa de Lógica, aquí va el valor coherente) ----------
-- Mezcla intencional de Aprobados (>= 11.00), Desaprobados (< 11.00) y "Sin calificar" (todo NULL),
-- para poder probar el filtro por estado de CA-003 sin tener que capturar notas a mano.
INSERT IGNORE INTO calificacion (id_calificacion, id_alumno, id_seccion, examen1, examen2, tareas, proyecto, promedio, periodo) VALUES
  (1, 1, 1, 15.00, 16.00, 18.00, 17.00, 16.50, 'Bimestre I'),
  (2, 2, 1,  8.00,  9.00, 10.00,  7.00,  8.50, 'Bimestre I'),
  (3, 3, 1, 12.50, 14.00, 13.00, NULL,  13.17, 'Bimestre I'),
  (4, 4, 1,  NULL,  NULL,  NULL, NULL,   NULL, 'Bimestre I'),
  (5, 5, 2, 19.00, 18.00, 20.00, 19.00, 19.00, 'Bimestre I'),
  (6, 6, 2, 10.00, 11.00,  9.00, 12.00, 10.50, 'Bimestre I');

-- ---------- Una tarea ya vencida y otra vigente (para ver "Atrasada" vs "Pendiente" en HU-010) ----------
INSERT IGNORE INTO tarea (id_tarea, titulo, descripcion, id_seccion, id_docente, fecha_asignacion, fecha_entrega) VALUES
  (1, 'Practica de fracciones', 'Resolver los ejercicios 1 al 20 del capitulo 4.', 1, 1, '2026-09-01', '2026-09-10'),
  (2, 'Exposicion de Ciencias', 'Exposicion grupal sobre el ciclo del agua.',      1, 1, '2026-09-15', '2026-12-20');

SELECT 'Datos de prueba cargados' AS resultado,
       (SELECT COUNT(*) FROM alumno) AS alumnos,
       (SELECT COUNT(*) FROM calificacion) AS calificaciones,
       (SELECT COUNT(*) FROM tarea) AS tareas;
