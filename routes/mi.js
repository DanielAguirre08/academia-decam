const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const A = require('../logica-alumno');
const LD = require('../logica-docente');
const { requiereRol } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');

// Todo /api/mi es del ALUMNO y SIEMPRE se filtra por el alumno de la sesión: ningún parámetro de
// la petición puede elegir otro alumno (HU-007 CA-001: "no expone las calificaciones de otros").
router.use(requiereRol('alumno'));
router.use(function (req, res, next) {
  if (!req.session.usuario.id_alumno) return res.status(403).json({ error: 'Tu usuario no tiene un perfil de alumno asociado' });
  next();
});

/** Datos actuales del alumno de la sesión (la sección puede haber cambiado desde que inició sesión). */
async function alumnoDeLaSesion(req) {
  const [[alumno]] = await pool.query(
    'SELECT id_alumno, id_seccion, estado FROM alumno WHERE id_alumno = ?', [req.session.usuario.id_alumno]
  );
  return alumno;
}

// GET /api/mi/calificaciones — HU-007 CA-001: sus notas por evaluación con promedio y estado.
router.get('/calificaciones', async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT c.id_calificacion, c.periodo, c.examen1, c.examen2, c.tareas, c.proyecto,
              CONCAT(s.grado, '-', s.letra) AS grupo, s.nivel,
              CONCAT(ut.nombre, ' ', ut.apellido) AS tutor
       FROM calificacion c
       JOIN seccion s ON s.id_seccion = c.id_seccion
       LEFT JOIN docente d ON d.id_docente = s.id_docente_tutor
       LEFT JOIN usuario ut ON ut.id_usuario = d.id_usuario
       WHERE c.id_alumno = ?
       ORDER BY FIELD(c.periodo, 'Bimestre I', 'Bimestre II', 'Bimestre III', 'Bimestre IV')`,
      [req.session.usuario.id_alumno]
    );
    res.json(A.prepararMisCalificaciones(filas));
  } catch (err) {
    responderError(res, err, 'Error al obtener tus calificaciones');
  }
});

// GET /api/mi/asistencia — HU-009: todos sus registros (el calendario muestra el mes en curso) y
// los indicadores acumulados del periodo (CA-003), calculados por la capa de Lógica.
router.get('/asistencia', async (req, res) => {
  try {
    const [registros] = await pool.query(
      `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado
       FROM asistencia WHERE id_alumno = ? ORDER BY fecha`,
      [req.session.usuario.id_alumno]
    );
    res.json({ registros, resumen: A.resumirAsistencia(registros) });
  } catch (err) {
    responderError(res, err, 'Error al obtener tu asistencia');
  }
});

// GET /api/mi/tareas?estado= — HU-010 CA-003: las tareas de SU sección con el estado de SU entrega.
router.get('/tareas', async (req, res) => {
  try {
    const alumno = await alumnoDeLaSesion(req);
    if (!alumno || !alumno.id_seccion) return res.json([]);

    const [filas] = await pool.query(
      `SELECT t.id_tarea, t.titulo, t.descripcion, t.tipo, d.especialidad AS materia,
              CONCAT(s.grado, '-', s.letra) AS grupo,
              DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
              (e.estado = 'entregada') AS entregue,
              DATE_FORMAT(e.fecha_entrega_real, '%Y-%m-%d %H:%i') AS fecha_entrega_real
       FROM tarea t
       JOIN seccion s ON s.id_seccion = t.id_seccion
       JOIN docente d ON d.id_docente = t.id_docente
       LEFT JOIN entrega_tarea e ON e.id_tarea = t.id_tarea AND e.id_alumno = ?
       WHERE t.id_seccion = ?
       ORDER BY t.fecha_entrega DESC`,
      [alumno.id_alumno, alumno.id_seccion]
    );
    const hoy = new Date();
    const tareas = filas.map(function (t) {
      const estado = A.estadoDeMiTarea(t.fecha_entrega, t.entregue === 1, hoy);
      return Object.assign({}, t, { entregue: t.entregue === 1, estado: estado, status: estado });
    });
    res.json(LD.filtrarTareasPorEstado(tareas, req.query.estado));
  } catch (err) {
    responderError(res, err, 'Error al obtener tus tareas');
  }
});

/** La tarea debe ser de la sección actual del alumno, y el alumno debe estar activo. */
async function tareaPropia(req) {
  if (!LD.esIdValido(req.params.id)) return { status: 400, error: 'Tarea inválida' };
  const alumno = await alumnoDeLaSesion(req);
  if (!alumno || alumno.estado !== 'activo') return { status: 403, error: 'Tu matrícula no está activa' };
  const [[tarea]] = await pool.query('SELECT id_tarea, id_seccion FROM tarea WHERE id_tarea = ?', [req.params.id]);
  // Una tarea de otra sección responde 404, igual que una inexistente: no se revela que existe.
  if (!tarea || tarea.id_seccion !== alumno.id_seccion) return { status: 404, error: 'La tarea indicada no existe' };
  return { alumno, tarea };
}

// POST /api/mi/tareas/:id/entrega — HU-010 CA-003: el alumno marca SU entrega.
router.post('/tareas/:id/entrega', async (req, res) => {
  try {
    const propia = await tareaPropia(req);
    if (propia.error) return res.status(propia.status).json({ error: propia.error });
    await pool.query(
      `INSERT INTO entrega_tarea (id_tarea, id_alumno, estado, fecha_entrega_real)
       VALUES (?, ?, 'entregada', NOW())
       ON DUPLICATE KEY UPDATE estado = 'entregada', fecha_entrega_real = NOW()`,
      [propia.tarea.id_tarea, propia.alumno.id_alumno]
    );
    res.status(201).json({ id_tarea: propia.tarea.id_tarea, estado: 'entregada' });
  } catch (err) {
    responderError(res, err, 'Error al registrar tu entrega');
  }
});

// DELETE /api/mi/tareas/:id/entrega — desmarca SU entrega (si la marcó por error).
router.delete('/tareas/:id/entrega', async (req, res) => {
  try {
    const propia = await tareaPropia(req);
    if (propia.error) return res.status(propia.status).json({ error: propia.error });
    const [r] = await pool.query(
      'DELETE FROM entrega_tarea WHERE id_tarea = ? AND id_alumno = ?', [propia.tarea.id_tarea, propia.alumno.id_alumno]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No tenías esta entrega registrada' });
    const [[t]] = await pool.query("SELECT DATE_FORMAT(fecha_entrega, '%Y-%m-%d') AS f FROM tarea WHERE id_tarea = ?", [propia.tarea.id_tarea]);
    res.json({ id_tarea: propia.tarea.id_tarea, estado: A.estadoDeMiTarea(t.f, false, new Date()) });
  } catch (err) {
    responderError(res, err, 'Error al desmarcar tu entrega');
  }
});

module.exports = router;
