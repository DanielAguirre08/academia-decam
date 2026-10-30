const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { responderError } = require('../middleware/errores');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol, puedeOperarEnSeccion } = require('../middleware/auth');

/**
 * Validaciones comunes a GET y POST (CA-002 y reglas de acceso), en el orden en que se responden:
 * 400 datos inválidos -> 404 sección inexistente -> 403 sección ajena.
 * Devuelve null si todo está bien, o { status, error } para responder.
 */
async function validarSeccionYFecha(usuario, idSeccion, fecha) {
  if (!L.validarGrupoSeleccionado(idSeccion)) return { status: 400, error: 'Debes seleccionar un grupo' };
  if (!L.validarFechaAsistencia(fecha)) return { status: 400, error: 'Debes indicar una fecha válida (AAAA-MM-DD)' };
  if (L.esFechaFutura(fecha, new Date())) return { status: 400, error: 'No se puede pasar lista de una fecha futura' };

  const [[seccion]] = await pool.query('SELECT id_seccion FROM seccion WHERE id_seccion = ?', [idSeccion]);
  if (!seccion) return { status: 404, error: 'El grupo indicado no existe' };
  if (!(await puedeOperarEnSeccion(usuario, idSeccion))) {
    return { status: 403, error: 'No dictas en este grupo' };
  }
  return null;
}

// GET /api/asistencia?id_seccion=1&fecha=2026-09-18
// CA-001 (HU-008): devuelve la lista de alumnos del grupo con la asistencia YA guardada para
// esa fecha, de modo que al volver a la fecha la tabla se ve tal cual se dejó.
// RF-07: la lista del grupo es del docente que dicta ahí y del jefe académico; un alumno no entra.
router.get('/', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const { id_seccion, fecha } = req.query;
    const problema = await validarSeccionYFecha(req.session.usuario, id_seccion, fecha);
    if (problema) return res.status(problema.status).json({ error: problema.error });

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
      return {
        id_alumno: f.id_alumno,
        nombreAlumno: f.nombreAlumno,
        estado: f.estadoGuardado || porDefecto[f.id_alumno],
        guardado: f.estadoGuardado !== null,     // false = es solo el valor por defecto, aún no está en la BD
        diasRegistrados: Number(f.diasRegistrados) || 0,
        faltas: Number(f.faltas) || 0,
        // % histórico en la sección; null si el alumno aún no tiene días registrados.
        porcentajeAsistencia: L.calcularPorcentajeAsistencia(f.diasPresente, f.tardanzas, f.diasRegistrados)
      };
    }));
  } catch (err) {
    responderError(res, err, 'Error al obtener la asistencia');
  }
});

// POST /api/asistencia  { id_seccion, fecha, registros: [{ id_alumno, estado }] }
// CA-003 (HU-008): guarda el pase de lista completo del grupo en una sola operación.
// El docente que firma el registro sale de la SESIÓN, no del cuerpo de la petición.
router.post('/', requiereRol('docente'), async (req, res) => {
  try {
    const { id_seccion, fecha, registros } = req.body || {};

    const idDocente = req.session.usuario.id_docente;
    if (!idDocente) return res.status(403).json({ error: 'Tu usuario no tiene un perfil de docente asociado' });

    const problema = await validarSeccionYFecha(req.session.usuario, id_seccion, fecha);
    if (problema) return res.status(problema.status).json({ error: problema.error });

    // Cada alumno de la lista debe ser un alumno ACTIVO de esta sección, sin repetidos y con un
    // estado del ENUM. La regla vive en la capa de Lógica; aquí solo se le pasa el grupo real.
    const [delGrupo] = await pool.query(
      "SELECT id_alumno FROM alumno WHERE id_seccion = ? AND estado = 'activo'", [id_seccion]
    );
    const revision = L.validarRegistrosAsistencia(registros, delGrupo.map(function (a) { return a.id_alumno; }));
    if (!revision.valido) {
      return res.status(400).json({ error: revision.errores[0], errores: revision.errores });
    }

    // UNIQUE (id_alumno, id_seccion, fecha): volver a guardar el mismo día actualiza, no duplica.
    // Es UNA sola sentencia: InnoDB la aplica completa o no aplica ninguna fila.
    const valores = registros.map(function (r) { return [Number(r.id_alumno), Number(id_seccion), fecha, r.estado, idDocente]; });
    await pool.query(
      `INSERT INTO asistencia (id_alumno, id_seccion, fecha, estado, id_docente_registra)
       VALUES ?
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), id_docente_registra = VALUES(id_docente_registra)`,
      [valores]
    );

    res.json({ id_seccion: Number(id_seccion), fecha: fecha, guardados: registros.length });
  } catch (err) {
    responderError(res, err, 'Error al guardar la asistencia');
  }
});

module.exports = router;
