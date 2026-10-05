const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol } = require('../middleware/auth');

// GET /api/tareas?id_seccion=1&estado=pendiente|atrasada|entregada|todas
// CA-002 (HU-010): el estado NO se guarda en la tabla, se deriva de la fecha límite contra hoy,
// exactamente con la misma función pura que usa el navegador (determinarEstadoEntrega).
// (Las tareas del alumno llegarán en su propio endpoint, filtrado por su sesión.)
router.get('/', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const { id_seccion, estado } = req.query;
    let sql = `SELECT t.id_tarea, t.titulo, t.descripcion, t.tipo, t.id_seccion, t.id_docente,
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

// POST /api/tareas  { titulo, descripcion, tipo, id_seccion, fecha_entrega }
// CA-001 (HU-010): publica una tarea nueva para una sección.
// El autor sale de la SESIÓN (id_docente), no del cuerpo de la petición.
router.post('/', requiereRol('docente'), async (req, res) => {
  try {
    const { titulo, descripcion, id_seccion, fecha_entrega } = req.body;
    const tipo = req.body.tipo || 'Tarea';

    // Misma validación que en el navegador: título + sección + fecha límite son obligatorios
    if (!L.validarTarea({ titulo: titulo, id_seccion: id_seccion, fecha_entrega: fecha_entrega })) {
      return res.status(400).json({ error: 'Completa título, grupo y fecha límite' });
    }
    if (!L.validarTipoTarea(tipo)) return res.status(400).json({ error: 'Tipo de tarea inválido' });

    const idDocente = req.session.usuario.id_docente;
    if (!idDocente) return res.status(403).json({ error: 'Tu usuario no tiene un perfil de docente asociado' });

    const [resultado] = await pool.query(
      `INSERT INTO tarea (titulo, descripcion, tipo, id_seccion, id_docente, fecha_asignacion, fecha_entrega)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?)`,
      [titulo.trim(), (descripcion || '').trim() || null, tipo, id_seccion, idDocente, fecha_entrega]
    );

    res.status(201).json({
      id_tarea: resultado.insertId,
      titulo: titulo.trim(),
      tipo: tipo,
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
