const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente');
const A = require('../logica-alumno');
const { requiereRol, seccionesPermitidas } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');
const D = require('../datos/consultas');

// Pantallas de consulta sin HU propia (Horario, Mi Sección, Mis Alumnos): solo lectura, para que
// muestren datos reales en lugar de los datos fijos del prototipo.

// GET /api/horario — docente: sus bloques en todas sus secciones; alumno: los de su sección.
router.get('/horario', requiereRol('docente', 'alumno'), async (req, res) => {
  try {
    const u = req.session.usuario;
    const filtro = u.rol === 'docente' ? 'h.id_docente = ?' : 'h.id_seccion = ?';
    const valor = u.rol === 'docente' ? u.id_docente : await D.seccionActualDelAlumno(u.id_alumno);
    const [bloques] = await pool.query(
      `SELECT h.dia_semana, TIME_FORMAT(h.hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(h.hora_fin, '%H:%i') AS hora_fin,
              h.curso, CONCAT(s.grado, '-', s.letra) AS grupo, s.aula, CONCAT(du.nombre, ' ', du.apellido) AS docente
       FROM horario h
       JOIN seccion s ON s.id_seccion = h.id_seccion
       JOIN docente d ON d.id_docente = h.id_docente JOIN usuario du ON du.id_usuario = d.id_usuario
       WHERE ${filtro} ORDER BY h.hora_inicio`, [valor || 0]
    );
    res.json(L.organizarHorario(bloques));
  } catch (err) {
    responderError(res, err, 'Error al obtener el horario');
  }
});

// GET /api/seccion?id_seccion= — "Mi Sección".
// Docente: las secciones de las que es tutor (`opciones`) y el detalle de la elegida (por defecto la
// primera: año más reciente, luego nivel, grado y letra). Alumno: siempre SU sección (el parámetro
// se ignora, no puede ver otra).
router.get('/seccion', requiereRol('docente', 'alumno'), async (req, res) => {
  try {
    const u = req.session.usuario;
    let opciones;
    if (u.rol === 'docente') {
      [opciones] = await pool.query(
        `SELECT id_seccion, CONCAT(grado, '-', letra) AS grupo, nivel FROM seccion
         WHERE id_docente_tutor = ? ORDER BY anio_lectivo DESC, nivel, grado, letra`, [u.id_docente]
      );
    } else {
      const idSeccion = await D.seccionActualDelAlumno(u.id_alumno);
      [opciones] = await pool.query(
        "SELECT id_seccion, CONCAT(grado, '-', letra) AS grupo, nivel FROM seccion WHERE id_seccion = ?", [idSeccion || 0]
      );
    }
    if (!opciones.length) return res.json(null);

    const pedida = u.rol === 'docente' ? opciones.find((o) => String(o.id_seccion) === String(req.query.id_seccion)) : null;
    if (u.rol === 'docente' && req.query.id_seccion && !pedida) {
      return res.status(403).json({ error: 'No eres tutor de esa sección' });
    }
    const [[seccion]] = await pool.query('SELECT * FROM seccion WHERE id_seccion = ?', [(pedida || opciones[0]).id_seccion]);

    const [[tutor]] = await pool.query(
      `SELECT CONCAT(us.nombre, ' ', us.apellido) AS nombre FROM docente d JOIN usuario us ON us.id_usuario = d.id_usuario
       WHERE d.id_docente = ?`, [seccion.id_docente_tutor || 0]
    );
    const [alumnos] = await pool.query(
      `SELECT CONCAT(us.nombre, ' ', us.apellido) AS nombreAlumno
       FROM alumno a JOIN usuario us ON us.id_usuario = a.id_usuario
       WHERE a.id_seccion = ? AND a.estado = 'activo' ORDER BY us.apellido, us.nombre`, [seccion.id_seccion]
    );
    res.json({
      id_seccion: seccion.id_seccion, grupo: seccion.grado + '-' + seccion.letra, nivel: seccion.nivel, turno: seccion.turno,
      aula: seccion.aula, anio_lectivo: seccion.anio_lectivo, tutor: tutor ? tutor.nombre : null, alumnos: alumnos,
      opciones: opciones
    });
  } catch (err) {
    responderError(res, err, 'Error al obtener la sección');
  }
});

// GET /api/alumnos — "Mis Alumnos": directorio de los alumnos activos de las secciones del docente
// con su promedio, % de asistencia, tareas pendientes y nivel de desempeño (mismas reglas oficiales).
router.get('/alumnos', requiereRol('docente'), async (req, res) => {
  try {
    const ids = (await seccionesPermitidas(req.session.usuario)) || [];
    if (!ids.length) return res.json([]);
    const [alumnos] = await pool.query(
      `SELECT a.id_alumno, a.id_seccion, CONCAT(us.nombre, ' ', us.apellido) AS nombreAlumno,
              CONCAT(s.grado, '-', s.letra) AS grupo, ap.nombre_completo AS apoderado, ap.telefono AS telefonoApoderado
       FROM alumno a
       JOIN usuario us ON us.id_usuario = a.id_usuario
       JOIN seccion s ON s.id_seccion = a.id_seccion
       JOIN apoderado ap ON ap.id_apoderado = a.id_apoderado
       WHERE a.estado = 'activo' AND a.id_seccion IN (?) ORDER BY s.grado, s.letra, us.apellido, us.nombre`, [ids]
    );
    if (!alumnos.length) return res.json([]);
    const idsAlumnos = alumnos.map((a) => a.id_alumno);

    // Promedio y asistencia SOLO de la sección actual de cada alumno (no de años o secciones anteriores).
    const promedios = await D.promediosGeneralesPorAlumno(ids);
    const [asis] = await pool.query(
      `SELECT x.id_alumno, COUNT(*) AS dias, SUM(x.estado = 'presente') AS presentes, SUM(x.estado = 'tardanza') AS tardanzas
       FROM asistencia x JOIN alumno a ON a.id_alumno = x.id_alumno AND a.id_seccion = x.id_seccion
       WHERE x.id_alumno IN (?) GROUP BY x.id_alumno`, [idsAlumnos]
    );
    const [tareas] = await pool.query(
      `SELECT a.id_alumno, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega, (e.estado = 'entregada') AS entregue
       FROM alumno a JOIN tarea t ON t.id_seccion = a.id_seccion
       LEFT JOIN entrega_tarea e ON e.id_tarea = t.id_tarea AND e.id_alumno = a.id_alumno
       WHERE a.id_alumno IN (?)`, [idsAlumnos]
    );

    const hoy = new Date();
    const asistencia = {};
    asis.forEach((x) => { asistencia[x.id_alumno] = L.calcularPorcentajeAsistencia(x.presentes, x.tardanzas, x.dias); });
    const pendientes = {};
    tareas.forEach((t) => {
      if (A.estadoDeMiTarea(t.fecha_entrega, t.entregue === 1, hoy) !== 'entregada') pendientes[t.id_alumno] = (pendientes[t.id_alumno] || 0) + 1;
    });

    res.json(alumnos.map((a) => {
      const promedio = promedios[a.id_alumno] === undefined ? null : promedios[a.id_alumno];
      return Object.assign({}, a, {
        promedio: promedio,
        porcentajeAsistencia: asistencia[a.id_alumno] === undefined ? null : asistencia[a.id_alumno],
        tareasPendientes: pendientes[a.id_alumno] || 0,
        desempeno: L.etiquetaDesempeno(promedio)
      });
    }));
  } catch (err) {
    responderError(res, err, 'Error al obtener tus alumnos');
  }
});

module.exports = router;
