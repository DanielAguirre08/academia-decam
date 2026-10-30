const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { responderError } = require('../middleware/errores');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol, puedeOperarEnSeccion, seccionesPermitidas } = require('../middleware/auth');

/**
 * Carga la tarea y comprueba que el usuario puede operar en su sección.
 * Devuelve { tarea } o { status, error } (400 id inválido, 404 no existe, 403 sección ajena).
 */
async function tareaAccesible(usuario, idTarea) {
  if (!L.esIdValido(idTarea)) return { status: 400, error: 'Tarea inválida' };
  const [[tarea]] = await pool.query(
    'SELECT id_tarea, id_seccion, DATE_FORMAT(fecha_entrega, \'%Y-%m-%d\') AS fecha_entrega FROM tarea WHERE id_tarea = ?',
    [idTarea]
  );
  if (!tarea) return { status: 404, error: 'La tarea indicada no existe' };
  if (!(await puedeOperarEnSeccion(usuario, tarea.id_seccion))) {
    return { status: 403, error: 'No dictas en el grupo de esta tarea' };
  }
  return { tarea };
}

// GET /api/tareas?id_seccion=1&estado=pendiente|atrasada|entregada|todas
// CA-002 (HU-010): el estado NO se guarda en la tabla, se deriva de la fecha límite contra hoy,
// exactamente con la misma función pura que usa el navegador (determinarEstadoEntrega).
// Un docente solo ve las tareas de las secciones donde dicta; el jefe académico ve todas.
// (Las tareas del alumno llegarán en su propio endpoint, filtrado por su sesión.)
router.get('/', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const { id_seccion, estado } = req.query;
    if (id_seccion !== undefined && id_seccion !== '' && !L.esIdValido(id_seccion)) {
      return res.status(400).json({ error: 'Grupo inválido' });
    }
    const permitidas = await seccionesPermitidas(req.session.usuario); // null = todas
    if (id_seccion && permitidas && !permitidas.includes(Number(id_seccion))) {
      return res.status(403).json({ error: 'No dictas en este grupo' });
    }

    // "materia · tipo" (diseño de Figma): la materia es la especialidad del docente que la publicó.
    let sql = `SELECT t.id_tarea, t.titulo, t.descripcion, t.tipo, t.id_seccion, t.id_docente,
                      d.especialidad AS materia,
                      DATE_FORMAT(t.fecha_asignacion, '%Y-%m-%d') AS fecha_asignacion,
                      DATE_FORMAT(t.fecha_entrega,   '%Y-%m-%d') AS fecha_entrega,
                      CONCAT(s.grado, '-', s.letra) AS grupo,
                      COUNT(e.id_entrega) AS entregas,
                      (SELECT COUNT(*) FROM alumno al
                        WHERE al.id_seccion = t.id_seccion AND al.estado = 'activo') AS totalAlumnos
               FROM tarea t
               JOIN seccion s ON s.id_seccion = t.id_seccion
               JOIN docente d ON d.id_docente = t.id_docente
               LEFT JOIN entrega_tarea e ON e.id_tarea = t.id_tarea AND e.estado = 'entregada'
               WHERE 1 = 1`;
    const params = [];
    if (id_seccion) { sql += ' AND t.id_seccion = ?'; params.push(id_seccion); }
    if (permitidas) {
      if (!permitidas.length) return res.json([]);
      sql += ' AND t.id_seccion IN (?)'; params.push(permitidas);
    }
    sql += ' GROUP BY t.id_tarea, s.grado, s.letra, d.especialidad ORDER BY t.fecha_entrega DESC';

    const [filas] = await pool.query(sql, params);

    const hoy = new Date();
    const conEstado = filas.map(function (t) {
      const entregas = Number(t.entregas) || 0;
      const totalAlumnos = Number(t.totalAlumnos) || 0;
      // La tarea se considera entregada solo cuando la entregó todo el grupo.
      const entregadaPorTodos = totalAlumnos > 0 && entregas >= totalAlumnos;
      const estadoTarea = L.determinarEstadoEntrega(t.fecha_entrega, entregadaPorTodos, hoy);
      return Object.assign({}, t, {
        entregas: entregas,
        totalAlumnos: totalAlumnos,
        estado: estadoTarea,
        status: estadoTarea // filtrarTareasPorEstado lee `status` (misma forma que el prototipo)
      });
    });

    // CA-002: el filtro por estado se resuelve con la MISMA función pura del frontend
    res.json(L.filtrarTareasPorEstado(conEstado, estado));
  } catch (err) {
    responderError(res, err, 'Error al obtener las tareas');
  }
});

// POST /api/tareas  { titulo, descripcion, tipo, id_seccion, fecha_entrega }
// CA-001 (HU-010): publica una tarea nueva para una sección donde el docente dicta.
// El autor sale de la SESIÓN (id_docente), no del cuerpo de la petición.
router.post('/', requiereRol('docente'), async (req, res) => {
  try {
    const datos = Object.assign({}, req.body || {});
    if (datos.tipo === undefined || datos.tipo === '') datos.tipo = 'Tarea';

    // Misma revisión que en el navegador (capa de Lógica): título, grupo, fecha y tipo.
    const revision = L.revisarTarea(datos, new Date());
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const idDocente = req.session.usuario.id_docente;
    if (!idDocente) return res.status(403).json({ error: 'Tu usuario no tiene un perfil de docente asociado' });

    const [[seccion]] = await pool.query('SELECT id_seccion FROM seccion WHERE id_seccion = ?', [datos.id_seccion]);
    if (!seccion) return res.status(404).json({ error: 'El grupo indicado no existe' });
    if (!(await puedeOperarEnSeccion(req.session.usuario, datos.id_seccion))) {
      return res.status(403).json({ error: 'No dictas en este grupo' });
    }

    const titulo = datos.titulo.trim();
    const descripcion = typeof datos.descripcion === 'string' && datos.descripcion.trim() ? datos.descripcion.trim() : null;
    const [resultado] = await pool.query(
      `INSERT INTO tarea (titulo, descripcion, tipo, id_seccion, id_docente, fecha_asignacion, fecha_entrega)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?)`,
      [titulo, descripcion, datos.tipo, datos.id_seccion, idDocente, datos.fecha_entrega]
    );

    res.status(201).json({
      id_tarea: resultado.insertId,
      titulo: titulo,
      tipo: datos.tipo,
      id_seccion: Number(datos.id_seccion),
      fecha_entrega: datos.fecha_entrega,
      estado: L.determinarEstadoEntrega(datos.fecha_entrega, false, new Date())
    });
  } catch (err) {
    responderError(res, err, 'Error al publicar la tarea');
  }
});

// GET /api/tareas/:id_tarea/entregas
// HU-010 (seguimiento del cumplimiento): la lista del grupo con quién entregó y quién no.
router.get('/:id_tarea/entregas', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const acceso = await tareaAccesible(req.session.usuario, req.params.id_tarea);
    if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });

    const [filas] = await pool.query(
      `SELECT a.id_alumno, CONCAT(u.nombre, ' ', u.apellido) AS nombreAlumno,
              e.estado AS estadoGuardado,
              DATE_FORMAT(e.fecha_entrega_real, '%Y-%m-%d %H:%i') AS fecha_entrega_real
       FROM alumno a
       JOIN usuario u ON u.id_usuario = a.id_usuario
       LEFT JOIN entrega_tarea e ON e.id_tarea = ? AND e.id_alumno = a.id_alumno
       WHERE a.id_seccion = ? AND a.estado = 'activo'
       ORDER BY u.apellido, u.nombre`,
      [acceso.tarea.id_tarea, acceso.tarea.id_seccion]
    );

    const hoy = new Date();
    res.json(filas.map(function (f) {
      const entregada = f.estadoGuardado === 'entregada';
      return {
        id_alumno: f.id_alumno,
        nombreAlumno: f.nombreAlumno,
        // Mismo criterio que la lista de tareas: entregada, o pendiente/atrasada según la fecha.
        estado: L.determinarEstadoEntrega(acceso.tarea.fecha_entrega, entregada, hoy),
        fecha_entrega_real: entregada ? f.fecha_entrega_real : null
      };
    }));
  } catch (err) {
    responderError(res, err, 'Error al obtener las entregas');
  }
});

// POST /api/tareas/:id_tarea/entregas  { id_alumno }
// Registra (o actualiza) la entrega de UN alumno para una tarea puntual.
// UNIQUE (id_tarea, id_alumno): volver a entregar la misma tarea actualiza la fecha real,
// no duplica la fila. Solo el docente marca entregas, y solo en tareas de una sección donde dicta.
router.post('/:id_tarea/entregas', requiereRol('docente'), async (req, res) => {
  try {
    const { id_alumno } = req.body || {};
    if (!L.esIdValido(id_alumno)) return res.status(400).json({ error: 'Debes indicar el alumno que entrega' });

    const acceso = await tareaAccesible(req.session.usuario, req.params.id_tarea);
    if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
    const tarea = acceso.tarea;

    const [[alumno]] = await pool.query('SELECT id_seccion, estado FROM alumno WHERE id_alumno = ?', [id_alumno]);
    if (!alumno) return res.status(404).json({ error: 'El alumno indicado no existe' });
    if (alumno.id_seccion !== tarea.id_seccion || alumno.estado !== 'activo') {
      return res.status(400).json({ error: 'El alumno no pertenece al grupo de esta tarea' });
    }

    await pool.query(
      `INSERT INTO entrega_tarea (id_tarea, id_alumno, estado, fecha_entrega_real)
       VALUES (?, ?, 'entregada', NOW())
       ON DUPLICATE KEY UPDATE estado = 'entregada', fecha_entrega_real = NOW()`,
      [tarea.id_tarea, id_alumno]
    );

    const [[entrega]] = await pool.query(
      `SELECT id_entrega, id_tarea, id_alumno, estado,
              DATE_FORMAT(fecha_entrega_real, '%Y-%m-%d %H:%i:%s') AS fecha_entrega_real
       FROM entrega_tarea WHERE id_tarea = ? AND id_alumno = ?`,
      [tarea.id_tarea, id_alumno]
    );

    res.status(201).json(entrega);
  } catch (err) {
    responderError(res, err, 'Error al registrar la entrega');
  }
});

// DELETE /api/tareas/:id_tarea/entregas/:id_alumno
// Desmarca una entrega registrada por error: el alumno vuelve a pendiente/atrasada según la fecha.
router.delete('/:id_tarea/entregas/:id_alumno', requiereRol('docente'), async (req, res) => {
  try {
    if (!L.esIdValido(req.params.id_alumno)) return res.status(400).json({ error: 'Alumno inválido' });
    const acceso = await tareaAccesible(req.session.usuario, req.params.id_tarea);
    if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });

    const [resultado] = await pool.query(
      'DELETE FROM entrega_tarea WHERE id_tarea = ? AND id_alumno = ?',
      [acceso.tarea.id_tarea, req.params.id_alumno]
    );
    if (!resultado.affectedRows) return res.status(404).json({ error: 'Ese alumno no tenía la entrega registrada' });
    res.json({
      id_tarea: acceso.tarea.id_tarea,
      id_alumno: Number(req.params.id_alumno),
      estado: L.determinarEstadoEntrega(acceso.tarea.fecha_entrega, false, new Date())
    });
  } catch (err) {
    responderError(res, err, 'Error al desmarcar la entrega');
  }
});

module.exports = router;
