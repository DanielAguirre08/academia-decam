// Capa de Datos — consultas de solo lectura compartidas por varias rutas, para que dos pantallas
// nunca calculen la misma cifra de formas distintas (p. ej. "alumnos en riesgo" en Inicio y en
// Mis Alumnos).
const pool = require('../config/db');
const L = require('../logica-docente');
const A = require('../logica-alumno');

/** Sección actual del alumno (null si no existe o no está matriculado). */
async function seccionActualDelAlumno(idAlumno) {
  const [[a]] = await pool.query('SELECT id_seccion FROM alumno WHERE id_alumno = ?', [idAlumno]);
  return a ? a.id_seccion : null;
}

/**
 * Promedio general de cada alumno ACTIVO de las secciones indicadas, contando solo sus notas en
 * su sección actual (las de un año o sección anterior no cuentan). Devuelve { id_alumno: promedio|null }.
 * Regla: media de los promedios de sus periodos calificados (logica-alumno.promedioGeneral).
 */
async function promediosGeneralesPorAlumno(idsSecciones) {
  if (!idsSecciones.length) return {};
  const [filas] = await pool.query(
    `SELECT a.id_alumno, c.examen1, c.examen2, c.tareas, c.proyecto
     FROM alumno a
     LEFT JOIN calificacion c ON c.id_alumno = a.id_alumno AND c.id_seccion = a.id_seccion
     WHERE a.estado = 'activo' AND a.id_seccion IN (?)`, [idsSecciones]
  );
  const porAlumno = {};
  // Sin fila de calificación (LEFT JOIN) las notas llegan en NULL: calcularPromedio da null y
  // promedioGeneral la ignora, así el alumno igual aparece (con promedio null = "sin datos").
  filas.forEach((f) => {
    (porAlumno[f.id_alumno] = porAlumno[f.id_alumno] || []).push(L.calcularPromedio(f));
  });
  const resultado = {};
  Object.keys(porAlumno).forEach((id) => { resultado[id] = A.promedioGeneral(porAlumno[id]); });
  return resultado;
}

/** "En riesgo" = promedio general Desaprobado (< 11.00, HU-005 CA-001). Misma regla en todas las pantallas. */
function estaEnRiesgo(promedioGeneral) {
  return L.determinarEstado(promedioGeneral) === 'Desaprobado';
}

module.exports = { seccionActualDelAlumno, promediosGeneralesPorAlumno, estaEnRiesgo };
