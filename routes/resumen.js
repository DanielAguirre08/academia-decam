const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente');
const A = require('../logica-alumno');
const { requiereSesion, seccionesPermitidas } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');

// Cifras de la página de Inicio y datos del perfil, según el rol de la sesión.
// Reemplazan a los "?" y "0" fijos del prototipo. Las reglas (promedio, % de asistencia, estado
// de las tareas, puesto en el grupo) son las MISMAS funciones puras que usan los demás módulos.

/** Tareas de las secciones indicadas con su estado derivado (igual que GET /api/tareas). */
async function tareasConEstado(idsSecciones) {
  if (!idsSecciones.length) return [];
  const [filas] = await pool.query(
    `SELECT t.id_tarea, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
            (SELECT COUNT(*) FROM entrega_tarea e WHERE e.id_tarea = t.id_tarea AND e.estado = 'entregada') AS entregas,
            (SELECT COUNT(*) FROM alumno al WHERE al.id_seccion = t.id_seccion AND al.estado = 'activo') AS total
     FROM tarea t WHERE t.id_seccion IN (?)`, [idsSecciones]
  );
  const hoy = new Date();
  return filas.map((t) => {
    const total = Number(t.total) || 0;
    return L.determinarEstadoEntrega(t.fecha_entrega, total > 0 && Number(t.entregas) >= total, hoy);
  });
}

async function resumenDocente(usuario) {
  let ids = await seccionesPermitidas(usuario);
  if (ids === null) ids = [];
  const hayIds = ids.length ? ids : [0]; // IN () vacío no es SQL válido

  const [[alumnos]] = await pool.query(
    "SELECT COUNT(*) AS n FROM alumno WHERE estado = 'activo' AND id_seccion IN (?)", [hayIds]
  );
  const [[asis]] = await pool.query(
    `SELECT COUNT(*) AS dias, SUM(estado = 'presente') AS presentes, SUM(estado = 'tardanza') AS tardanzas
     FROM asistencia WHERE id_seccion IN (?)`, [hayIds]
  );
  const [promedios] = await pool.query(
    `SELECT c.promedio FROM calificacion c JOIN alumno a ON a.id_alumno = c.id_alumno
     WHERE a.estado = 'activo' AND c.id_seccion IN (?)`, [hayIds]
  );
  const estados = await tareasConEstado(ids);
  const dia = L.diaDeHorario(new Date());
  const [clases] = dia ? await pool.query(
    `SELECT TIME_FORMAT(h.hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(h.hora_fin, '%H:%i') AS hora_fin,
            h.curso, CONCAT(s.grado, '-', s.letra) AS grupo, s.aula
     FROM horario h JOIN seccion s ON s.id_seccion = h.id_seccion
     WHERE h.id_docente = ? AND h.dia_semana = ? ORDER BY h.hora_inicio`, [usuario.id_docente, dia]
  ) : [[]];
  const [entregas] = await pool.query(
    `SELECT CONCAT(u.nombre, ' ', u.apellido) AS alumno, t.titulo AS tarea,
            DATE_FORMAT(e.fecha_entrega_real, '%Y-%m-%d %H:%i') AS fecha
     FROM entrega_tarea e
     JOIN tarea t ON t.id_tarea = e.id_tarea
     JOIN alumno a ON a.id_alumno = e.id_alumno JOIN usuario u ON u.id_usuario = a.id_usuario
     WHERE e.estado = 'entregada' AND t.id_seccion IN (?)
     ORDER BY e.fecha_entrega_real DESC LIMIT 5`, [hayIds]
  );

  return {
    alumnosActivos: Number(alumnos.n),
    asistenciaPromedio: L.calcularPorcentajeAsistencia(asis.presentes, asis.tardanzas, asis.dias),
    tareasAtrasadas: estados.filter((e) => e === 'atrasada').length,
    // "En riesgo" = Desaprobado según la regla oficial (promedio < 11.00, HU-005 CA-001).
    alumnosEnRiesgo: promedios.filter((p) => L.determinarEstado(p.promedio === null ? null : Number(p.promedio)) === 'Desaprobado').length,
    clasesHoy: clases,
    ultimasEntregas: entregas
  };
}

async function resumenAlumno(usuario) {
  const [[alumno]] = await pool.query('SELECT id_alumno, id_seccion FROM alumno WHERE id_alumno = ?', [usuario.id_alumno]);
  if (!alumno) return {};

  const [misCalif] = await pool.query('SELECT examen1, examen2, tareas, proyecto FROM calificacion WHERE id_alumno = ?', [alumno.id_alumno]);
  const miPromedio = A.promedioGeneral(misCalif.map((c) => L.calcularPromedio(c)));

  // Promedio general de cada compañero activo de la sección (para el puesto en el grupo).
  const [delGrupo] = await pool.query(
    `SELECT c.id_alumno, c.examen1, c.examen2, c.tareas, c.proyecto
     FROM calificacion c JOIN alumno a ON a.id_alumno = c.id_alumno
     WHERE a.id_seccion = ? AND a.estado = 'activo'`, [alumno.id_seccion || 0]
  );
  const porAlumno = {};
  delGrupo.forEach((c) => { (porAlumno[c.id_alumno] = porAlumno[c.id_alumno] || []).push(L.calcularPromedio(c)); });
  const promediosGrupo = Object.keys(porAlumno).map((id) => A.promedioGeneral(porAlumno[id]));

  const [registros] = await pool.query('SELECT estado FROM asistencia WHERE id_alumno = ?', [alumno.id_alumno]);
  const [tareas] = await pool.query(
    `SELECT t.titulo, t.tipo, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega, (e.estado = 'entregada') AS entregue
     FROM tarea t LEFT JOIN entrega_tarea e ON e.id_tarea = t.id_tarea AND e.id_alumno = ?
     WHERE t.id_seccion = ? ORDER BY t.fecha_entrega`, [alumno.id_alumno, alumno.id_seccion || 0]
  );
  const hoy = new Date();
  const pendientes = tareas
    .map((t) => Object.assign({}, t, { estado: A.estadoDeMiTarea(t.fecha_entrega, t.entregue === 1, hoy) }))
    .filter((t) => t.estado !== 'entregada');
  const [cursos] = await pool.query(
    `SELECT DISTINCT h.curso, CONCAT(u.nombre, ' ', u.apellido) AS docente
     FROM horario h JOIN docente d ON d.id_docente = h.id_docente JOIN usuario u ON u.id_usuario = d.id_usuario
     WHERE h.id_seccion = ? ORDER BY h.curso`, [alumno.id_seccion || 0]
  );

  return {
    promedioGeneral: miPromedio,
    tareasPendientes: pendientes.length,
    asistencia: A.resumirAsistencia(registros).porcentaje,
    lugarEnGrupo: A.lugarEnGrupo(promediosGrupo, miPromedio),
    proximasTareas: pendientes.filter((t) => t.estado === 'pendiente').slice(0, 3),
    misCursos: cursos
  };
}

async function resumenJefe() {
  const anio = new Date().getFullYear();
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM alumno WHERE estado = 'activo') AS alumnosActivos,
            (SELECT COUNT(*) FROM matricula WHERE estado = 'activa' AND anio_lectivo = ?) AS matriculasActivas,
            (SELECT COUNT(*) FROM seccion WHERE anio_lectivo = ?) AS secciones,
            (SELECT COUNT(*) FROM reclamo WHERE estado = 'pendiente') AS reclamosPendientes`, [anio, anio]
  );
  const [reclamos] = await pool.query(
    `SELECT r.asunto, r.prioridad, CONCAT(u.nombre, ' ', u.apellido) AS autor,
            DATE_FORMAT(r.fecha_registro, '%Y-%m-%d') AS fecha
     FROM reclamo r JOIN usuario u ON u.id_usuario = r.id_usuario_autor
     WHERE r.estado = 'pendiente' ORDER BY FIELD(r.prioridad, 'urgente', 'alta', 'normal'), r.fecha_registro LIMIT 5`
  );
  return {
    alumnosActivos: Number(c.alumnosActivos), matriculasActivas: Number(c.matriculasActivas),
    secciones: Number(c.secciones), reclamosPendientes: Number(c.reclamosPendientes), reclamosPorAtender: reclamos
  };
}

async function resumenRegistrador() {
  const anio = new Date().getFullYear();
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM matricula WHERE estado = 'activa' AND anio_lectivo = ?) AS matriculasActivas,
            (SELECT COUNT(*) FROM matricula WHERE YEAR(fecha_matricula) = YEAR(CURDATE()) AND MONTH(fecha_matricula) = MONTH(CURDATE())) AS matriculasDelMes,
            (SELECT COUNT(*) FROM matricula WHERE estado = 'inactiva' AND anio_lectivo = ?) AS matriculasInactivas,
            (SELECT COUNT(*) FROM seccion WHERE anio_lectivo = ?) AS secciones`, [anio, anio, anio]
  );
  const [ultimas] = await pool.query(
    `SELECT m.codigo, CONCAT(u.nombre, ' ', u.apellido) AS alumno, CONCAT(s.grado, '-', s.letra) AS seccion,
            DATE_FORMAT(m.fecha_matricula, '%Y-%m-%d') AS fecha
     FROM matricula m JOIN alumno a ON a.id_alumno = m.id_alumno JOIN usuario u ON u.id_usuario = a.id_usuario
     JOIN seccion s ON s.id_seccion = m.id_seccion ORDER BY m.id_matricula DESC LIMIT 5`
  );
  return {
    matriculasActivas: Number(c.matriculasActivas), matriculasDelMes: Number(c.matriculasDelMes),
    matriculasInactivas: Number(c.matriculasInactivas), secciones: Number(c.secciones), ultimasMatriculas: ultimas
  };
}

// GET /api/resumen — tarjetas y paneles de Inicio del rol de la sesión.
router.get('/resumen', requiereSesion, async (req, res) => {
  try {
    const u = req.session.usuario;
    const porRol = { docente: resumenDocente, alumno: resumenAlumno, jefe_academico: resumenJefe, registrador: resumenRegistrador };
    res.json(Object.assign({ rol: u.rol }, await porRol[u.rol](u)));
  } catch (err) {
    responderError(res, err, 'Error al obtener el resumen');
  }
});

// GET /api/perfil — datos reales del perfil (antes eran "?").
router.get('/perfil', requiereSesion, async (req, res) => {
  try {
    const u = req.session.usuario;
    const [[base]] = await pool.query(
      "SELECT correo, DATE_FORMAT(fecha_registro, '%Y-%m-%d') AS desde FROM usuario WHERE id_usuario = ?", [u.id_usuario]
    );
    const perfil = { nombreCompleto: u.nombreCompleto, correo: base.correo, rol: u.rol, rolEtiqueta: u.rolEtiqueta, desde: base.desde };

    if (u.rol === 'docente') {
      const [[d]] = await pool.query('SELECT dni, especialidad, telefono FROM docente WHERE id_docente = ?', [u.id_docente]);
      const ids = (await seccionesPermitidas(u)) || [];
      const [grupos] = ids.length
        ? await pool.query("SELECT CONCAT(grado, '-', letra) AS grupo FROM seccion WHERE id_seccion IN (?) ORDER BY nivel, grado, letra", [ids])
        : [[]];
      Object.assign(perfil, { dni: d.dni, especialidad: d.especialidad, telefono: d.telefono, grupos: grupos.map((g) => g.grupo) });
    }
    if (u.rol === 'alumno') {
      const [[a]] = await pool.query(
        `SELECT a.dni, CONCAT(s.grado, '-', s.letra) AS grupo, s.nivel, CONCAT(ut.nombre, ' ', ut.apellido) AS tutor,
                m.codigo AS matricula, m.anio_lectivo AS ciclo
         FROM alumno a
         LEFT JOIN seccion s ON s.id_seccion = a.id_seccion
         LEFT JOIN docente d ON d.id_docente = s.id_docente_tutor LEFT JOIN usuario ut ON ut.id_usuario = d.id_usuario
         LEFT JOIN matricula m ON m.id_alumno = a.id_alumno AND m.estado = 'activa'
         WHERE a.id_alumno = ?`, [u.id_alumno]
      );
      Object.assign(perfil, a);
    }
    res.json(perfil);
  } catch (err) {
    responderError(res, err, 'Error al obtener el perfil');
  }
});

module.exports = router;
