const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual

// GET /api/tareas?id_seccion=1&estado=pendiente|atrasada|entregada|todas
// CA-002 (HU-010): el estado NO se guarda en la tabla, se deriva de la fecha límite contra hoy,
// exactamente con la misma función pura que usa el navegador (determinarEstadoEntrega).
router.get('/', async (req, res) => {
  try {
    const { id_seccion, estado } = req.query;
    let sql = `SELECT t.id_tarea, t.titulo, t.descripcion, t.id_seccion, t.id_docente,
                      DATE_FORMAT(t.fecha_asignacion, '%Y-%m-%d') AS fecha_asignacion,
                      DATE_FORMAT(t.fecha_entrega,   '%Y-%m-%d') AS fecha_entrega,
                      CONCAT(s.grado, '-', s.letra) AS grupo,
                      COUNT(e.id_entrega) AS entregas,
                      (SELECT COUNT(*) FROM alumno al
                        WHERE al.id_seccion = t.id_seccion AND al.estado = 'activo') AS totalAlumnos
               FROM tarea t
               JOIN seccion s ON s.id_seccion = t.id_seccion
               LEFT JOIN entrega_tarea e ON e.id_tarea = t.id_tarea AND e.estado = 'entregada'`;
    const params = [];
    if (id_seccion) { sql += ' WHERE t.id_seccion = ?'; params.push(id_seccion); }
    sql += ' GROUP BY t.id_tarea, s.grado, s.letra ORDER BY t.fecha_entrega DESC';

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
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las tareas' });
  }
});

// POST /api/tareas  { titulo, descripcion, id_seccion, fecha_entrega, id_docente }
// CA-001 (HU-010): publica una tarea nueva para una sección.
router.post('/', async (req, res) => {
  try {
    const { titulo, descripcion, id_seccion, fecha_entrega, id_docente } = req.body;

    // Misma validación que en el navegador: título + sección + fecha límite son obligatorios
    if (!L.validarTarea({ titulo: titulo, id_seccion: id_seccion, fecha_entrega: fecha_entrega })) {
      return res.status(400).json({ error: 'Completa título, grupo y fecha límite' });
    }

    // TAREA.id_docente es NOT NULL; el login del prototipo aún no devuelve un id_docente real.
    let idDocente = id_docente;
    if (!idDocente) {
      const [[seccion]] = await pool.query('SELECT id_docente_tutor FROM seccion WHERE id_seccion = ?', [id_seccion]);
      idDocente = (seccion && seccion.id_docente_tutor) || null;
    }
    if (!idDocente) {
      const [[docente]] = await pool.query('SELECT MIN(id_docente) AS id_docente FROM docente');
      idDocente = docente ? docente.id_docente : null;
    }
    if (!idDocente) return res.status(400).json({ error: 'No hay un docente al que atribuir la tarea' });

    const [resultado] = await pool.query(
      `INSERT INTO tarea (titulo, descripcion, id_seccion, id_docente, fecha_asignacion, fecha_entrega)
       VALUES (?, ?, ?, ?, CURDATE(), ?)`,
      [titulo.trim(), (descripcion || '').trim() || null, id_seccion, idDocente, fecha_entrega]
    );

    res.status(201).json({
      id_tarea: resultado.insertId,
      titulo: titulo.trim(),
      id_seccion: Number(id_seccion),
      fecha_entrega: fecha_entrega,
      estado: L.determinarEstadoEntrega(fecha_entrega, false, new Date())
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al publicar la tarea' });
  }
});

module.exports = router;
