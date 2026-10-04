const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol } = require('../middleware/auth');

// GET /api/asistencia?id_seccion=1&fecha=2026-09-18
// CA-001 (HU-008): devuelve la lista de alumnos del grupo con la asistencia YA guardada para
// esa fecha, de modo que al volver a la fecha la tabla se ve tal cual se dejó.
// RF-07: la lista del grupo es del docente y del jefe académico; un alumno no entra aquí.
router.get('/', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const { id_seccion, fecha } = req.query;

    // CA-002: sin grupo y sin fecha válida no hay nada que cargar (misma regla que en el navegador)
    if (!L.validarGrupoSeleccionado(id_seccion)) return res.status(400).json({ error: 'Debes seleccionar un grupo' });
    if (!L.validarFechaAsistencia(fecha)) return res.status(400).json({ error: 'Debes indicar una fecha válida' });

    const [filas] = await pool.query(
      `SELECT a.id_alumno,
              CONCAT(u.nombre, ' ', u.apellido) AS nombreAlumno,
              hoy.estado AS estadoGuardado,
              COUNT(hist.id_asistencia)          AS diasRegistrados,
              SUM(hist.estado = 'presente')      AS diasPresente,
              SUM(hist.estado = 'tardanza')      AS tardanzas,
              SUM(hist.estado = 'ausente')       AS faltas
       FROM alumno a
       JOIN usuario u ON u.id_usuario = a.id_usuario
       LEFT JOIN asistencia hoy  ON hoy.id_alumno  = a.id_alumno AND hoy.id_seccion  = ? AND hoy.fecha = ?
       LEFT JOIN asistencia hist ON hist.id_alumno = a.id_alumno AND hist.id_seccion = ?
       WHERE a.id_seccion = ? AND a.estado = 'activo'
       GROUP BY a.id_alumno, u.nombre, u.apellido, hoy.estado
       ORDER BY u.apellido, u.nombre`,
      [id_seccion, fecha, id_seccion, id_seccion]
    );

    // CA-003: los alumnos que todavía no tienen asistencia en esa fecha arrancan en "presente".
    // Ese valor por defecto lo calcula la MISMA función pura que usa el botón "Todos presentes".
    const porDefecto = {};
    L.marcarAsistenciaTodos(filas.map(function (f) { return f.id_alumno; }), 'presente')
      .forEach(function (r) { porDefecto[r.id_alumno] = r.estado; });

    res.json(filas.map(function (f) {
      const dias = Number(f.diasRegistrados) || 0;
      const asistio = Number(f.diasPresente || 0) + Number(f.tardanzas || 0);
      return {
        id_alumno: f.id_alumno,
        nombreAlumno: f.nombreAlumno,
        estado: f.estadoGuardado || porDefecto[f.id_alumno],
        guardado: f.estadoGuardado !== null,     // false = es solo el valor por defecto, aún no está en la BD
        diasRegistrados: dias,
        faltas: Number(f.faltas) || 0,
        // % histórico de asistencia del alumno en la sección (la tardanza cuenta como asistencia).
        porcentajeAsistencia: dias ? Math.round((asistio / dias) * 100) : 100
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la asistencia' });
  }
});

// POST /api/asistencia  { id_seccion, fecha, registros: [{ id_alumno, estado }] }
// CA-003 (HU-008): guarda el pase de lista completo del grupo en una sola operación.
// El docente que firma el registro sale de la SESIÓN, no del cuerpo de la petición.
router.post('/', requiereRol('docente'), async (req, res) => {
  try {
    const { id_seccion, fecha, registros } = req.body;

    if (!L.validarGrupoSeleccionado(id_seccion)) return res.status(400).json({ error: 'Debes seleccionar un grupo' });
    if (!L.validarFechaAsistencia(fecha)) return res.status(400).json({ error: 'Debes indicar una fecha válida' });
    if (!Array.isArray(registros) || !registros.length) return res.status(400).json({ error: 'No hay alumnos que registrar' });

    const invalido = registros.find(function (r) { return !L.validarEstadoAsistencia(r.estado); });
    if (invalido) return res.status(400).json({ error: 'Estado de asistencia inválido: ' + invalido.estado });

    const idDocente = req.session.usuario.id_docente;
    if (!idDocente) return res.status(403).json({ error: 'Tu usuario no tiene un perfil de docente asociado' });

    // UNIQUE (id_alumno, id_seccion, fecha): volver a guardar el mismo día actualiza, no duplica.
    const valores = registros.map(function (r) { return [r.id_alumno, id_seccion, fecha, r.estado, idDocente]; });
    await pool.query(
      `INSERT INTO asistencia (id_alumno, id_seccion, fecha, estado, id_docente_registra)
       VALUES ?
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), id_docente_registra = VALUES(id_docente_registra)`,
      [valores]
    );

    res.json({ id_seccion: Number(id_seccion), fecha: fecha, guardados: registros.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la asistencia' });
  }
});

module.exports = router;
