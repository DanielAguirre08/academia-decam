-- ============================================================================
-- ACADEMIA DECAM — Controles de integridad entre tablas
--
-- Las llaves foráneas y los CHECK del esquema garantizan lo que se puede expresar en una sola
-- tabla o en un solo vínculo. Estas consultas comprueban las reglas que cruzan varias tablas:
-- CADA CONTROL DEBE DEVOLVER 0. Si alguno devuelve un número mayor, hay datos inconsistentes.
--
--   npm run db:check
-- ============================================================================
SET NAMES utf8mb4;
USE academia_decam;

SELECT control, filas_con_error, IF(filas_con_error = 0, 'OK', 'REVISAR') AS resultado FROM (

  SELECT '01 Alumno con nivel distinto al de su sección' AS control, COUNT(*) AS filas_con_error
  FROM alumno a JOIN seccion s ON s.id_seccion = a.id_seccion
  WHERE a.nivel <> s.nivel

  UNION ALL SELECT '02 Alumno activo con sección pero sin matrícula activa en ella', COUNT(*)
  FROM alumno a
  WHERE a.estado = 'activo' AND a.id_seccion IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM matricula m WHERE m.id_alumno = a.id_alumno
                    AND m.id_seccion = a.id_seccion AND m.estado = 'activa')

  UNION ALL SELECT '03 Matrícula activa de un alumno que no está activo', COUNT(*)
  FROM matricula m JOIN alumno a ON a.id_alumno = m.id_alumno
  WHERE m.estado = 'activa' AND a.estado <> 'activo'

  UNION ALL SELECT '04 Promedio que no coincide con la media de las notas registradas', COUNT(*)
  FROM calificacion c
  WHERE NOT (c.promedio <=> ROUND(
          (COALESCE(c.examen1,0) + COALESCE(c.examen2,0) + COALESCE(c.tareas,0) + COALESCE(c.proyecto,0))
          / NULLIF((c.examen1 IS NOT NULL) + (c.examen2 IS NOT NULL) + (c.tareas IS NOT NULL) + (c.proyecto IS NOT NULL), 0), 2))

  UNION ALL SELECT '05 Calificación en una sección distinta a la del alumno', COUNT(*)
  FROM calificacion c JOIN alumno a ON a.id_alumno = c.id_alumno
  WHERE a.id_seccion IS NULL OR a.id_seccion <> c.id_seccion

  UNION ALL SELECT '06 Asistencia en una sección distinta a la del alumno', COUNT(*)
  FROM asistencia x JOIN alumno a ON a.id_alumno = x.id_alumno
  WHERE a.id_seccion IS NULL OR a.id_seccion <> x.id_seccion

  UNION ALL SELECT '07 Entrega de un alumno que no pertenece a la sección de la tarea', COUNT(*)
  FROM entrega_tarea e JOIN tarea t ON t.id_tarea = e.id_tarea JOIN alumno a ON a.id_alumno = e.id_alumno
  WHERE a.id_seccion IS NULL OR a.id_seccion <> t.id_seccion

  UNION ALL SELECT '08 Usuario con rol docente sin perfil en DOCENTE', COUNT(*)
  FROM usuario u WHERE u.rol = 'docente' AND NOT EXISTS (SELECT 1 FROM docente d WHERE d.id_usuario = u.id_usuario)

  UNION ALL SELECT '09 Usuario con rol alumno sin perfil en ALUMNO', COUNT(*)
  FROM usuario u WHERE u.rol = 'alumno' AND NOT EXISTS (SELECT 1 FROM alumno a WHERE a.id_usuario = u.id_usuario)

  UNION ALL SELECT '10 Perfil de docente o alumno cuyo usuario tiene otro rol', COUNT(*)
  FROM (SELECT u.id_usuario FROM docente d JOIN usuario u ON u.id_usuario = d.id_usuario WHERE u.rol <> 'docente'
        UNION ALL
        SELECT u.id_usuario FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario WHERE u.rol <> 'alumno') x

  UNION ALL SELECT '11 Aviso publicado por alguien que no es Jefe Académico (RF-12)', COUNT(*)
  FROM aviso v JOIN usuario u ON u.id_usuario = v.id_usuario_autor WHERE u.rol <> 'jefe_academico'

  UNION ALL SELECT '12 Mensaje de un usuario a sí mismo', COUNT(*)
  FROM mensaje WHERE id_remitente = id_destinatario

  UNION ALL SELECT '13 Horario con un curso distinto a la especialidad del docente', COUNT(*)
  FROM horario h JOIN docente d ON d.id_docente = h.id_docente WHERE h.curso <> d.especialidad

  UNION ALL SELECT '14 Tarea que vence antes de publicarse', COUNT(*)
  FROM tarea WHERE fecha_entrega < fecha_asignacion

) controles
ORDER BY control;
