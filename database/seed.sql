-- ============================================================================
-- ACADEMIA DECAM — Datos de prueba (NO forman parte del esquema)
--
-- Deja las 14 tablas con datos coherentes entre sí, para que cada pantalla y cada rol tenga
-- algo que mostrar:  4 docentes · 4 secciones · 15 alumnos · 14 apoderados · 15 matrículas ·
-- notas, asistencia de los últimos 30 días, tareas con entregas, reclamos, avisos, mensajes
-- y horario.
--
-- Es IDEMPOTENTE: usa INSERT IGNORE con claves explícitas, así que se puede correr varias veces
-- sin duplicar nada. Los usuarios, además, vuelven a su contraseña de prueba y quedan
-- desbloqueados (útil después de probar el bloqueo por intentos fallidos, RNF-02).
--
--   mysql --default-character-set=utf8mb4 -u root < database/seed.sql
--
-- Las fechas de tareas, asistencia, reclamos, avisos y mensajes son RELATIVAS a hoy
-- (CURDATE()/NOW()), para que la demo siempre se vea al día: "atrasada" y "pendiente" dependen
-- de la fecha actual.
--
-- CONTRASEÑAS DE PRUEBA (se guardan como hash bcrypt, costo 10; nunca en texto plano):
--   prof@acadecam.edu.pe  y los otros 3 docentes   decam2024    rol docente
--   alumno@acadecam.edu.pe  y los otros 14 alumnos  alumno2024   rol alumno
--   jefe@acadecam.edu.pe                            jefe2024     rol jefe_academico
--   registrador@acadecam.edu.pe                     reg2024      rol registrador
-- ============================================================================
SET NAMES utf8mb4;
USE academia_decam;

SET @hash_docente     := '$2b$10$mGDQyhbeV5f7dRYJmwdb3eMOwX.X8iMwvkl3cv3rzJdTWN5FdiP4O';
SET @hash_alumno      := '$2b$10$XFOm6geEbf1p0foC0unALOpWcwTQglWdKtslfQZKDRtFL8RdrunMC';
SET @hash_jefe        := '$2b$10$Dz.V.qW5p0PogKIJujJKEesTyS3dAVTNENB2RyHujugwGVqyGW.Pe';
SET @hash_registrador := '$2b$10$NEhAx6obsp.Rf8.2y9jqs.CvMh151dMv3fw3PKOlp2vwkmaF5LuMW';

-- ============================================================================
-- 1. USUARIOS (ids 1-6 personal, 101-115 alumnos)
-- ============================================================================
INSERT INTO usuario (id_usuario, nombre, apellido, correo, contrasena_hash, rol) VALUES
  (1,   'Profesor',    'Demo',              'prof@acadecam.edu.pe',           @hash_docente,     'docente'),
  (2,   'Jefe',        'Académico',         'jefe@acadecam.edu.pe',           @hash_jefe,        'jefe_academico'),
  (3,   'Registrador', 'Demo',              'registrador@acadecam.edu.pe',    @hash_registrador, 'registrador'),
  (4,   'Rosa',        'Quispe Huamán',     'rosa.quispe@acadecam.edu.pe',    @hash_docente,     'docente'),
  (5,   'Jorge',       'Mendoza Ríos',      'jorge.mendoza@acadecam.edu.pe',  @hash_docente,     'docente'),
  (6,   'Carmen',      'Vilca Torres',      'carmen.vilca@acadecam.edu.pe',   @hash_docente,     'docente'),
  (101, 'Ana',         'Torres Medina',     'ana.torres@acadecam.edu.pe',     @hash_alumno,      'alumno'),
  (102, 'Luis',        'Pérez Cárdenas',    'luis.perez@acadecam.edu.pe',     @hash_alumno,      'alumno'),
  (103, 'María',       'Gómez Salazar',     'maria.gomez@acadecam.edu.pe',    @hash_alumno,      'alumno'),
  (104, 'Carlos',      'Ruiz Alvarado',     'carlos.ruiz@acadecam.edu.pe',    @hash_alumno,      'alumno'),
  (105, 'Sofía',       'Vargas Núñez',      'sofia.vargas@acadecam.edu.pe',   @hash_alumno,      'alumno'),
  (106, 'Diego',       'Salas Ccori',       'diego.salas@acadecam.edu.pe',    @hash_alumno,      'alumno'),
  (107, 'Alumno',      'Demo',              'alumno@acadecam.edu.pe',         @hash_alumno,      'alumno'),
  (108, 'Valeria',     'Rojas Lazo',        'valeria.rojas@acadecam.edu.pe',  @hash_alumno,      'alumno'),
  (109, 'Mateo',       'Castro Díaz',       'mateo.castro@acadecam.edu.pe',   @hash_alumno,      'alumno'),
  (110, 'Camila',      'Huamán Poma',       'camila.huaman@acadecam.edu.pe',  @hash_alumno,      'alumno'),
  (111, 'Andrés',      'Flores Mamani',     'andres.flores@acadecam.edu.pe',  @hash_alumno,      'alumno'),
  (112, 'Lucía',       'Paredes Soto',      'lucia.paredes@acadecam.edu.pe',  @hash_alumno,      'alumno'),
  (113, 'Gabriel',     'Ortiz Bravo',       'gabriel.ortiz@acadecam.edu.pe',  @hash_alumno,      'alumno'),
  (114, 'Daniela',     'Ríos Vega',         'daniela.rios@acadecam.edu.pe',   @hash_alumno,      'alumno'),
  (115, 'Sebastián',   'León Cáceres',      'sebastian.leon@acadecam.edu.pe', @hash_alumno,      'alumno')
AS nuevo
ON DUPLICATE KEY UPDATE contrasena_hash = nuevo.contrasena_hash, intentos_fallidos = 0, bloqueado_hasta = NULL;

-- ============================================================================
-- 2. PERSONAS: docentes y apoderados
-- ============================================================================
INSERT IGNORE INTO docente (id_docente, id_usuario, dni, especialidad, telefono) VALUES
  (1, 1, '10000001', 'Matemática',          '987654321'),
  (2, 4, '10000002', 'Comunicación',        '987654322'),
  (3, 5, '10000003', 'Ciencia y Tecnología','987654323'),
  (4, 6, '10000004', 'Personal Social',     '987654324');

INSERT IGNORE INTO apoderado (id_apoderado, id_usuario, dni, nombre_completo, telefono, direccion) VALUES
  (1,  NULL, '40000001', 'Marta Medina de Torres',  '999000101', 'Jr. Las Flores 220'),
  (2,  NULL, '40000002', 'Julio Pérez Cárdenas',    '999000102', 'Av. Los Olivos 88'),
  (3,  NULL, '40000003', 'Rosa Salazar de Gómez',   '999000103', 'Calle Unión 45'),
  (4,  NULL, '40000004', 'Pedro Ruiz Alvarado',     '999000104', 'Jr. Arequipa 601'),
  (5,  NULL, '40000005', 'Elena Núñez de Vargas',   '999000105', 'Av. Brasil 1420'),
  (6,  NULL, '40000006', 'Hugo Salas Quispe',       '999000106', 'Jr. Cusco 310'),
  (7,  NULL, '40000007', 'Patricia Lazo de Rojas',  '999000107', 'Av. Central 100'),
  (8,  NULL, '40000008', 'Walter Castro Palomino',  '999000108', 'Jr. Puno 455'),
  (9,  NULL, '40000009', 'Sonia Poma de Huamán',    '999000109', 'Av. Grau 780'),
  (10, NULL, '40000010', 'Luis Flores Quispe',      '999000110', 'Calle Lima 134'),
  (11, NULL, '40000011', 'Gladys Soto de Paredes',  '999000111', 'Jr. Tacna 92'),
  (12, NULL, '40000012', 'Fernando Ortiz Salcedo',  '999000112', 'Av. Pardo 1250'),
  (13, NULL, '40000013', 'Mónica Vega de Ríos',     '999000113', 'Calle Bolívar 33'),
  (14, NULL, '40000014', 'Raúl León Medina',        '999000114', 'Jr. Ayacucho 508');

-- ============================================================================
-- 3. ORGANIZACIÓN: secciones y alumnos
--    Etiquetas de grupo (grado-letra) distintas entre niveles: 6-A, 5-A, 6-B (Primaria) y 3-A (Secundaria).
-- ============================================================================
INSERT IGNORE INTO seccion (id_seccion, nivel, grado, letra, turno, aula, id_docente_tutor, anio_lectivo) VALUES
  (1, 'Primaria',   6, 'A', 'Mañana', 'Aula 14', 1, 2026),
  (2, 'Primaria',   5, 'A', 'Mañana', 'Aula 12', 2, 2026),
  (3, 'Primaria',   6, 'B', 'Tarde',  'Aula 15', 3, 2026),
  (4, 'Secundaria', 3, 'A', 'Mañana', 'Aula 21', 4, 2026);

INSERT IGNORE INTO alumno (id_alumno, id_usuario, dni, fecha_nacimiento, sexo, direccion, nivel, id_seccion, id_apoderado, estado) VALUES
  -- 6-A (sección 1)
  (1,  101, '70000001', '2014-03-11', 'F', 'Jr. Las Flores 220', 'Primaria',   1, 1,  'activo'),
  (2,  102, '70000002', '2014-07-02', 'M', 'Av. Los Olivos 88',  'Primaria',   1, 2,  'activo'),
  (3,  103, '70000003', '2014-01-25', 'F', 'Calle Unión 45',     'Primaria',   1, 3,  'activo'),
  (4,  104, '70000004', '2014-11-09', 'M', 'Jr. Arequipa 601',   'Primaria',   1, 4,  'activo'),
  (7,  107, '70000007', '2014-06-15', 'M', 'Av. Central 100',    'Primaria',   1, 7,  'activo'),
  -- 5-A (sección 2); Mateo Castro está retirado (alumno inactivo, matrícula inactiva)
  (5,  105, '70000005', '2015-05-18', 'F', 'Av. Brasil 1420',    'Primaria',   2, 5,  'activo'),
  (6,  106, '70000006', '2015-09-30', 'M', 'Jr. Cusco 310',      'Primaria',   2, 6,  'activo'),
  (8,  108, '70000008', '2015-02-14', 'F', 'Av. Central 100',    'Primaria',   2, 7,  'activo'),
  (9,  109, '70000009', '2015-08-21', 'M', 'Jr. Puno 455',       'Primaria',   2, 8,  'inactivo'),
  -- 6-B (sección 3, turno tarde)
  (10, 110, '70000010', '2014-04-03', 'F', 'Av. Grau 780',       'Primaria',   3, 9,  'activo'),
  (11, 111, '70000011', '2014-10-19', 'M', 'Calle Lima 134',     'Primaria',   3, 10, 'activo'),
  (12, 112, '70000012', '2014-12-07', 'F', 'Jr. Tacna 92',       'Primaria',   3, 11, 'activo'),
  -- 3-A de Secundaria (sección 4)
  (13, 113, '70000013', '2011-05-27', 'M', 'Av. Pardo 1250',     'Secundaria', 4, 12, 'activo'),
  (14, 114, '70000014', '2011-09-09', 'F', 'Calle Bolívar 33',   'Secundaria', 4, 13, 'activo'),
  (15, 115, '70000015', '2011-01-30', 'M', 'Jr. Ayacucho 508',   'Secundaria', 4, 14, 'activo');

-- ============================================================================
-- 4. MATRÍCULAS (una por alumno, código correlativo MAT-NNNN)
-- ============================================================================
INSERT IGNORE INTO matricula (id_matricula, codigo, id_alumno, id_seccion, anio_lectivo, fecha_matricula, estado, procedencia, observaciones) VALUES
  (1,  'MAT-0001', 1,  1, 2026, '2026-02-16', 'activa',   'nuevo',     NULL),
  (2,  'MAT-0002', 2,  1, 2026, '2026-02-16', 'activa',   'nuevo',     NULL),
  (3,  'MAT-0003', 3,  1, 2026, '2026-02-17', 'activa',   'nuevo',     NULL),
  (4,  'MAT-0004', 4,  1, 2026, '2026-02-18', 'activa',   'nuevo',     NULL),
  (5,  'MAT-0005', 5,  2, 2026, '2026-02-19', 'activa',   'nuevo',     NULL),
  (6,  'MAT-0006', 6,  2, 2026, '2026-02-19', 'activa',   'nuevo',     NULL),
  (7,  'MAT-0007', 7,  1, 2026, '2026-02-23', 'activa',   'nuevo',     NULL),
  (8,  'MAT-0008', 8,  2, 2026, '2026-02-23', 'activa',   'traslado',  NULL),
  (9,  'MAT-0009', 9,  2, 2026, '2026-02-24', 'inactiva', 'nuevo',     'Matrícula anulada por traslado de ciudad'),
  (10, 'MAT-0010', 10, 3, 2026, '2026-02-25', 'activa',   'nuevo',     NULL),
  (11, 'MAT-0011', 11, 3, 2026, '2026-02-26', 'activa',   'promocion', NULL),
  (12, 'MAT-0012', 12, 3, 2026, '2026-02-26', 'activa',   'nuevo',     NULL),
  (13, 'MAT-0013', 13, 4, 2026, '2026-03-02', 'activa',   'nuevo',     NULL),
  (14, 'MAT-0014', 14, 4, 2026, '2026-03-02', 'activa',   'nuevo',     NULL),
  (15, 'MAT-0015', 15, 4, 2026, '2026-03-03', 'activa',   'nuevo',     NULL);

-- ============================================================================
-- 5. CALIFICACIONES del Bimestre I (promedio = media de las notas registradas, 2 decimales)
--    Mezcla de Aprobados (>= 11.00), Desaprobados y "Sin calificar" (todo NULL).
--    Solo hay un periodo cargado: la API lista todos los registros de la sección, y un segundo
--    bimestre duplicaría a cada alumno en el cuadro del docente.
-- ============================================================================
INSERT IGNORE INTO calificacion (id_calificacion, id_alumno, id_seccion, examen1, examen2, tareas, proyecto, promedio, periodo) VALUES
  (1,  1,  1, 15.00, 16.00, 18.00, 17.00, 16.50, 'Bimestre I'),
  (2,  2,  1,  8.00,  9.00, 10.00,  7.00,  8.50, 'Bimestre I'),
  (3,  3,  1, 12.50, 14.00, 13.00,  NULL, 13.17, 'Bimestre I'),
  (4,  4,  1,  NULL,  NULL,  NULL,  NULL,  NULL, 'Bimestre I'),
  (5,  7,  1, 14.00, 13.00, 15.00, 16.00, 14.50, 'Bimestre I'),
  (6,  5,  2, 19.00, 18.00, 20.00, 19.00, 19.00, 'Bimestre I'),
  (7,  6,  2, 10.00, 11.00,  9.00, 12.00, 10.50, 'Bimestre I'),
  (8,  8,  2, 16.00, 15.00, 17.00,  NULL, 16.00, 'Bimestre I'),
  (9,  10, 3, 13.00, 12.00, 14.00, 15.00, 13.50, 'Bimestre I'),
  (10, 11, 3,  7.00,  9.00,  8.00, 10.00,  8.50, 'Bimestre I'),
  (11, 12, 3, 17.00, 18.00, 16.00, 19.00, 17.50, 'Bimestre I'),
  (12, 13, 4, 11.00, 12.00, 10.00, 13.00, 11.50, 'Bimestre I'),
  (13, 14, 4, 18.00, 17.00, 19.00, 18.00, 18.00, 'Bimestre I'),
  (14, 15, 4,  9.00, 10.00, 11.00, 12.00, 10.50, 'Bimestre I');

-- ============================================================================
-- 6. ASISTENCIA: los últimos 30 días hábiles hasta AYER (hoy queda libre para pasar lista).
--    El patrón de ausencias y tardanzas es fijo (depende del alumno y del día), no aleatorio.
--    El registro lo firma el docente tutor de cada sección.
-- ============================================================================
INSERT IGNORE INTO asistencia (id_alumno, id_seccion, fecha, estado, id_docente_registra)
WITH RECURSIVE dias (fecha) AS (
  SELECT CURDATE() - INTERVAL 30 DAY
  UNION ALL
  SELECT fecha + INTERVAL 1 DAY FROM dias WHERE fecha < CURDATE() - INTERVAL 1 DAY
)
SELECT a.id_alumno, a.id_seccion, d.fecha,
       CASE WHEN MOD(a.id_alumno * 7 + DATEDIFF(d.fecha, '2026-01-01'), 13) = 0 THEN 'ausente'
            WHEN MOD(a.id_alumno * 5 + DATEDIFF(d.fecha, '2026-01-01'), 9)  = 0 THEN 'tardanza'
            ELSE 'presente' END,
       s.id_docente_tutor
FROM dias d
JOIN alumno a  ON a.estado = 'activo' AND a.id_seccion IS NOT NULL
JOIN seccion s ON s.id_seccion = a.id_seccion
WHERE DAYOFWEEK(d.fecha) BETWEEN 2 AND 6;      -- lunes a viernes

-- ============================================================================
-- 7. TAREAS y ENTREGAS (fechas relativas a hoy)
--    Vencidas: 1, 5 y 8 · Vigentes: 2, 3, 4, 6 y 7
-- ============================================================================
INSERT IGNORE INTO tarea (id_tarea, titulo, descripcion, tipo, id_seccion, id_docente, fecha_asignacion, fecha_entrega) VALUES
  (1, 'Práctica de fracciones',               'Resolver los ejercicios 1 al 20 del capítulo 4.',                'Tarea',      1, 1, CURDATE() - INTERVAL 25 DAY, CURDATE() - INTERVAL 16 DAY),
  (2, 'Exposición de Ciencias',               'Exposición grupal sobre el ciclo del agua (5 minutos por grupo).', 'Exposición', 1, 1, CURDATE() - INTERVAL 18 DAY, CURDATE() + INTERVAL 14 DAY),
  (3, 'Examen de Matemática: Unidad 2',       'Fracciones, decimales y proporcionalidad. Traer calculadora.',  'Examen',     1, 1, CURDATE() - INTERVAL 5 DAY,  CURDATE() + INTERVAL 3 DAY),
  (4, 'Proyecto: maqueta del sistema solar',  'Maqueta con los 8 planetas a escala y una ficha informativa.',  'Proyecto',   2, 3, CURDATE() - INTERVAL 12 DAY, CURDATE() + INTERVAL 9 DAY),
  (5, 'Comprensión lectora: capítulo 3',      'Leer el capítulo 3 y responder el cuestionario de 10 preguntas.', 'Tarea',     2, 2, CURDATE() - INTERVAL 10 DAY, CURDATE() - INTERVAL 2 DAY),
  (6, 'Producción de textos',                 'Redactar una crónica de una página sobre un hecho de la escuela.', 'Tarea',    3, 2, CURDATE() - INTERVAL 7 DAY,  CURDATE() + INTERVAL 5 DAY),
  (7, 'Informe de laboratorio',               'Informe del experimento de densidad con tablas y conclusiones.', 'Proyecto',   4, 3, CURDATE() - INTERVAL 9 DAY,  CURDATE() + INTERVAL 6 DAY),
  (8, 'Línea de tiempo de la Independencia',  'Línea de tiempo ilustrada con 10 hechos y sus fechas.',          'Tarea',      4, 4, CURDATE() - INTERVAL 14 DAY, CURDATE() - INTERVAL 5 DAY);

-- 'entregada' = ya entregó (con fecha real) · 'atrasada' = venció sin entregar · sin fila = pendiente
INSERT IGNORE INTO entrega_tarea (id_entrega, id_tarea, id_alumno, estado, fecha_entrega_real, comentario) VALUES
  (1,  1, 1,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 17 DAY, '09:15:00'), NULL),
  (2,  1, 2,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 16 DAY, '07:40:00'), 'Entregado en físico'),
  (3,  1, 7,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 18 DAY, '11:05:00'), NULL),
  (4,  1, 3,  'atrasada',  NULL,                                              'Pidió una prórroga'),
  (5,  1, 4,  'atrasada',  NULL,                                              NULL),
  (6,  2, 1,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 1 DAY,  '10:20:00'), 'Ensayo previo a la exposición'),
  (7,  4, 5,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 2 DAY,  '08:50:00'), NULL),
  (8,  5, 5,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 3 DAY,  '12:30:00'), NULL),
  (9,  5, 8,  'entregada', TIMESTAMP(CURDATE() - INTERVAL 2 DAY,  '07:55:00'), NULL),
  (10, 5, 6,  'atrasada',  NULL,                                              NULL),
  (11, 7, 14, 'entregada', TIMESTAMP(CURDATE() - INTERVAL 1 DAY,  '15:10:00'), NULL),
  (12, 8, 13, 'entregada', TIMESTAMP(CURDATE() - INTERVAL 6 DAY,  '09:00:00'), NULL),
  (13, 8, 14, 'entregada', TIMESTAMP(CURDATE() - INTERVAL 5 DAY,  '10:45:00'), NULL),
  (14, 8, 15, 'atrasada',  NULL,                                              NULL);

-- ============================================================================
-- 8. COMUNICACIÓN: reclamos, avisos y mensajes
-- ============================================================================
INSERT IGNORE INTO reclamo (id_reclamo, id_usuario_autor, asunto, tipo, prioridad, descripcion, estado, fecha_registro) VALUES
  (1, 107, 'Error en mi nota del Examen 2',          'calificacion',   'alta',    'Mi examen 2 figura con 13 pero en la hoja corregida obtuve 15. Adjunto la foto de la hoja.', 'revision',  NOW() - INTERVAL 3 DAY),
  (2, 101, 'Falta registrada por error',             'asistencia',     'normal',  'El lunes aparezco como ausente, pero asistí con permiso médico.',                           'pendiente', NOW() - INTERVAL 1 DAY),
  (3, 110, 'Constancia de estudios',                 'administrativo', 'normal',  'Solicito la constancia de estudios para un trámite familiar.',                              'resuelto',  NOW() - INTERVAL 10 DAY),
  (4, 4,   'Aula 15 sin proyector',                  'administrativo', 'urgente', 'El proyector del aula 15 no funciona y se necesita para las exposiciones de esta semana.',  'pendiente', NOW() - INTERVAL 2 HOUR),
  (5, 112, 'Incidente durante el recreo',            'trato',          'alta',    'Un compañero me quitó mi lonchera y me dijo cosas hirientes. Pido que se hable con él.',    'resuelto',  NOW() - INTERVAL 15 DAY),
  (6, 102, 'Revisión de la nota del proyecto',       'calificacion',   'normal',  'Quisiera saber por qué mi proyecto tiene 7 y qué criterios se evaluaron.',                  'pendiente', NOW() - INTERVAL 2 DAY);

INSERT IGNORE INTO aviso (id_aviso, titulo, contenido, id_usuario_autor, fecha_publicacion, destinatarios) VALUES
  (1, 'Inicio del II Bimestre',              'El II Bimestre comienza el próximo lunes. Revisen sus horarios actualizados en el portal.',        2, NOW() - INTERVAL 20 DAY, 'todos'),
  (2, 'Reunión de docentes',                 'Se convoca a todos los docentes a reunión el viernes a las 4:00 p. m. en la sala de profesores.',  2, NOW() - INTERVAL 6 DAY,  'docentes'),
  (3, 'Entrega de libretas del I Bimestre',  'Las libretas se entregarán en el aula el jueves en el horario de clases. Se requiere al apoderado.', 2, NOW() - INTERVAL 3 DAY,  'todos'),
  (4, 'Cronograma de exámenes',              'Los exámenes de la Unidad 2 se rendirán la próxima semana. Estudien con anticipación.',             2, NOW() - INTERVAL 2 DAY,  'alumnos'),
  (5, 'Simulacro de sismo',                  'Mañana a las 10:00 a. m. habrá un simulacro. Sigan las indicaciones de su tutor.',                  2, NOW() - INTERVAL 1 DAY,  'todos');

INSERT IGNORE INTO mensaje (id_mensaje, id_remitente, id_destinatario, contenido, fecha_envio, leido) VALUES
  (1, 1,   107, 'Recuerda traer tu proyecto el viernes.',                                  NOW() - INTERVAL 2 DAY,  TRUE),
  (2, 107, 1,   'Profesor, ¿puedo entregar el trabajo mañana? Estuve enfermo.',            NOW() - INTERVAL 1 DAY,  FALSE),
  (3, 2,   1,   'Por favor registre las notas del I Bimestre antes del viernes.',          NOW() - INTERVAL 4 DAY,  TRUE),
  (4, 1,   2,   'Las notas ya están registradas. Quedo atento a cualquier observación.',   NOW() - INTERVAL 3 DAY,  FALSE),
  (5, 3,   1,   'La lista de sus alumnos fue actualizada con las nuevas matrículas.',      NOW() - INTERVAL 8 DAY,  TRUE),
  (6, 6,   113, 'Gabriel, trae el informe impreso para la clase de mañana.',               NOW() - INTERVAL 1 DAY,  FALSE);

-- ============================================================================
-- 9. HORARIO (75 bloques). Cada docente da su especialidad; los 4 docentes rotan por día y bloque
--    sin chocar (UNIQUE docente/día/hora y sección/día/hora). Mañana: 07:00-13:00, Tarde: 13:00-17:30.
-- ============================================================================
INSERT IGNORE INTO horario (id_horario, id_seccion, dia_semana, hora_inicio, hora_fin, curso, id_docente) VALUES
  (1, 1, 'Lunes', '07:00', '08:30', 'Matemática', 1),
  (2, 1, 'Lunes', '08:30', '10:00', 'Comunicación', 2),
  (3, 1, 'Lunes', '10:00', '11:30', 'Ciencia y Tecnología', 3),
  (4, 1, 'Lunes', '11:30', '13:00', 'Personal Social', 4),
  (5, 1, 'Martes', '07:00', '08:30', 'Comunicación', 2),
  (6, 1, 'Martes', '08:30', '10:00', 'Ciencia y Tecnología', 3),
  (7, 1, 'Martes', '10:00', '11:30', 'Personal Social', 4),
  (8, 1, 'Martes', '11:30', '13:00', 'Matemática', 1),
  (9, 1, 'Miercoles', '07:00', '08:30', 'Ciencia y Tecnología', 3),
  (10, 1, 'Miercoles', '08:30', '10:00', 'Personal Social', 4),
  (11, 1, 'Miercoles', '10:00', '11:30', 'Matemática', 1),
  (12, 1, 'Miercoles', '11:30', '13:00', 'Comunicación', 2),
  (13, 1, 'Jueves', '07:00', '08:30', 'Personal Social', 4),
  (14, 1, 'Jueves', '08:30', '10:00', 'Matemática', 1),
  (15, 1, 'Jueves', '10:00', '11:30', 'Comunicación', 2),
  (16, 1, 'Jueves', '11:30', '13:00', 'Ciencia y Tecnología', 3),
  (17, 1, 'Viernes', '07:00', '08:30', 'Matemática', 1),
  (18, 1, 'Viernes', '08:30', '10:00', 'Comunicación', 2),
  (19, 1, 'Viernes', '10:00', '11:30', 'Ciencia y Tecnología', 3),
  (20, 1, 'Viernes', '11:30', '13:00', 'Personal Social', 4),
  (21, 2, 'Lunes', '07:00', '08:30', 'Comunicación', 2),
  (22, 2, 'Lunes', '08:30', '10:00', 'Ciencia y Tecnología', 3),
  (23, 2, 'Lunes', '10:00', '11:30', 'Personal Social', 4),
  (24, 2, 'Lunes', '11:30', '13:00', 'Matemática', 1),
  (25, 2, 'Martes', '07:00', '08:30', 'Ciencia y Tecnología', 3),
  (26, 2, 'Martes', '08:30', '10:00', 'Personal Social', 4),
  (27, 2, 'Martes', '10:00', '11:30', 'Matemática', 1),
  (28, 2, 'Martes', '11:30', '13:00', 'Comunicación', 2),
  (29, 2, 'Miercoles', '07:00', '08:30', 'Personal Social', 4),
  (30, 2, 'Miercoles', '08:30', '10:00', 'Matemática', 1),
  (31, 2, 'Miercoles', '10:00', '11:30', 'Comunicación', 2),
  (32, 2, 'Miercoles', '11:30', '13:00', 'Ciencia y Tecnología', 3),
  (33, 2, 'Jueves', '07:00', '08:30', 'Matemática', 1),
  (34, 2, 'Jueves', '08:30', '10:00', 'Comunicación', 2),
  (35, 2, 'Jueves', '10:00', '11:30', 'Ciencia y Tecnología', 3),
  (36, 2, 'Jueves', '11:30', '13:00', 'Personal Social', 4),
  (37, 2, 'Viernes', '07:00', '08:30', 'Comunicación', 2),
  (38, 2, 'Viernes', '08:30', '10:00', 'Ciencia y Tecnología', 3),
  (39, 2, 'Viernes', '10:00', '11:30', 'Personal Social', 4),
  (40, 2, 'Viernes', '11:30', '13:00', 'Matemática', 1),
  (41, 4, 'Lunes', '07:00', '08:30', 'Ciencia y Tecnología', 3),
  (42, 4, 'Lunes', '08:30', '10:00', 'Personal Social', 4),
  (43, 4, 'Lunes', '10:00', '11:30', 'Matemática', 1),
  (44, 4, 'Lunes', '11:30', '13:00', 'Comunicación', 2),
  (45, 4, 'Martes', '07:00', '08:30', 'Personal Social', 4),
  (46, 4, 'Martes', '08:30', '10:00', 'Matemática', 1),
  (47, 4, 'Martes', '10:00', '11:30', 'Comunicación', 2),
  (48, 4, 'Martes', '11:30', '13:00', 'Ciencia y Tecnología', 3),
  (49, 4, 'Miercoles', '07:00', '08:30', 'Matemática', 1),
  (50, 4, 'Miercoles', '08:30', '10:00', 'Comunicación', 2),
  (51, 4, 'Miercoles', '10:00', '11:30', 'Ciencia y Tecnología', 3),
  (52, 4, 'Miercoles', '11:30', '13:00', 'Personal Social', 4),
  (53, 4, 'Jueves', '07:00', '08:30', 'Comunicación', 2),
  (54, 4, 'Jueves', '08:30', '10:00', 'Ciencia y Tecnología', 3),
  (55, 4, 'Jueves', '10:00', '11:30', 'Personal Social', 4),
  (56, 4, 'Jueves', '11:30', '13:00', 'Matemática', 1),
  (57, 4, 'Viernes', '07:00', '08:30', 'Ciencia y Tecnología', 3),
  (58, 4, 'Viernes', '08:30', '10:00', 'Personal Social', 4),
  (59, 4, 'Viernes', '10:00', '11:30', 'Matemática', 1),
  (60, 4, 'Viernes', '11:30', '13:00', 'Comunicación', 2),
  (61, 3, 'Lunes', '13:00', '14:30', 'Personal Social', 4),
  (62, 3, 'Lunes', '14:30', '16:00', 'Matemática', 1),
  (63, 3, 'Lunes', '16:00', '17:30', 'Comunicación', 2),
  (64, 3, 'Martes', '13:00', '14:30', 'Matemática', 1),
  (65, 3, 'Martes', '14:30', '16:00', 'Comunicación', 2),
  (66, 3, 'Martes', '16:00', '17:30', 'Ciencia y Tecnología', 3),
  (67, 3, 'Miercoles', '13:00', '14:30', 'Comunicación', 2),
  (68, 3, 'Miercoles', '14:30', '16:00', 'Ciencia y Tecnología', 3),
  (69, 3, 'Miercoles', '16:00', '17:30', 'Personal Social', 4),
  (70, 3, 'Jueves', '13:00', '14:30', 'Ciencia y Tecnología', 3),
  (71, 3, 'Jueves', '14:30', '16:00', 'Personal Social', 4),
  (72, 3, 'Jueves', '16:00', '17:30', 'Matemática', 1),
  (73, 3, 'Viernes', '13:00', '14:30', 'Personal Social', 4),
  (74, 3, 'Viernes', '14:30', '16:00', 'Matemática', 1),
  (75, 3, 'Viernes', '16:00', '17:30', 'Comunicación', 2);

-- ============================================================================
-- Resumen de lo cargado
-- ============================================================================
SELECT 'usuario' AS tabla, COUNT(*) AS filas FROM usuario
UNION ALL SELECT 'docente',       COUNT(*) FROM docente
UNION ALL SELECT 'apoderado',     COUNT(*) FROM apoderado
UNION ALL SELECT 'seccion',       COUNT(*) FROM seccion
UNION ALL SELECT 'alumno',        COUNT(*) FROM alumno
UNION ALL SELECT 'matricula',     COUNT(*) FROM matricula
UNION ALL SELECT 'calificacion',  COUNT(*) FROM calificacion
UNION ALL SELECT 'asistencia',    COUNT(*) FROM asistencia
UNION ALL SELECT 'tarea',         COUNT(*) FROM tarea
UNION ALL SELECT 'entrega_tarea', COUNT(*) FROM entrega_tarea
UNION ALL SELECT 'reclamo',       COUNT(*) FROM reclamo
UNION ALL SELECT 'aviso',         COUNT(*) FROM aviso
UNION ALL SELECT 'mensaje',       COUNT(*) FROM mensaje
UNION ALL SELECT 'horario',       COUNT(*) FROM horario;
