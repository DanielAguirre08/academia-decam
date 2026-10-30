// Capa de Datos — a quién puede escribirle cada usuario (HU-013). Como en un aula virtual, cada
// uno solo encuentra a la gente con la que comparte clases:
//   alumno            -> los docentes de SU sección (dictan en ella o son tutores), el jefe y el registrador
//   docente           -> los alumnos activos de las secciones donde dicta o es tutor, los demás
//                        docentes, el jefe y el registrador
//   jefe / registrador -> cualquier usuario activo
// La regla es simétrica (si el docente puede escribirle al alumno, el alumno puede responderle) y
// se aplica al BUSCAR y al ENVIAR: ocultar a alguien en el buscador no protege nada si el POST
// aceptara cualquier id.
const pool = require('../config/db');
const C = require('../logica-comunicacion');

const MAX_RESULTADOS = 8;

// `d` dicta en la sección `s` o es su tutor (la misma regla que puedeOperarEnSeccion).
const DICTA_EN_SECCION = `(s.id_docente_tutor = d.id_docente
  OR EXISTS (SELECT 1 FROM horario h WHERE h.id_seccion = s.id_seccion AND h.id_docente = d.id_docente))`;

/** Condición SQL sobre el usuario `u` (destinatario) según el rol de quien escribe. */
function alcance(usuario) {
  if (usuario.rol === 'jefe_academico' || usuario.rol === 'registrador') return { sql: 'TRUE', params: [] };
  if (usuario.rol === 'alumno') {
    return {
      sql: `(u.rol IN ('jefe_academico', 'registrador')
             OR (u.rol = 'docente' AND EXISTS (
               SELECT 1 FROM docente d
               JOIN alumno a ON a.id_usuario = ? AND a.estado = 'activo'
               JOIN seccion s ON s.id_seccion = a.id_seccion
               WHERE d.id_usuario = u.id_usuario AND ${DICTA_EN_SECCION})))`,
      params: [usuario.id_usuario]
    };
  }
  if (usuario.rol === 'docente') {
    return {
      sql: `(u.rol <> 'alumno'
             OR EXISTS (
               SELECT 1 FROM alumno a
               JOIN seccion s ON s.id_seccion = a.id_seccion
               JOIN docente d ON d.id_usuario = ?
               WHERE a.id_usuario = u.id_usuario AND a.estado = 'activo' AND ${DICTA_EN_SECCION}))`,
      params: [usuario.id_usuario]
    };
  }
  return { sql: 'FALSE', params: [] };
}

/** `%` y `_` del texto se buscan literalmente: "%" no debe listar a todos. */
function escaparLike(t) {
  return t.replace(/[\\%_]/g, '\\$&');
}

/**
 * HU-013: hasta 8 usuarios activos a los que `usuario` puede escribir y que coinciden con TODAS
 * las palabras buscadas (en nombre, apellido o correo; sin distinguir mayúsculas ni tildes, por la
 * intercalación utf8mb4_unicode_ci). Primero los que EMPIEZAN con lo escrito.
 */
async function buscar(usuario, q) {
  const palabras = C.palabrasDeBusqueda(q);
  if (!palabras.length) return [];
  const regla = alcance(usuario);
  const [filas] = await pool.query(
    `SELECT u.id_usuario, CONCAT(u.nombre, ' ', u.apellido) AS nombre, u.correo, u.rol, doc.especialidad,
            CASE WHEN alu.estado = 'activo' THEN CONCAT(sec.grado, '-', sec.letra) END AS grupo
     FROM usuario u
     LEFT JOIN docente doc ON doc.id_usuario = u.id_usuario
     LEFT JOIN alumno alu ON alu.id_usuario = u.id_usuario
     LEFT JOIN seccion sec ON sec.id_seccion = alu.id_seccion
     WHERE u.estado = 'activo' AND u.id_usuario <> ? AND ${regla.sql}
       AND ${palabras.map(() => "CONCAT_WS(' ', u.nombre, u.apellido, u.correo) LIKE ?").join(' AND ')}
     ORDER BY CONCAT(u.nombre, ' ', u.apellido) LIKE ? DESC, u.nombre, u.apellido
     LIMIT ${MAX_RESULTADOS}`,
    [usuario.id_usuario, ...regla.params, ...palabras.map((p) => '%' + escaparLike(p) + '%'), escaparLike(palabras[0]) + '%']
  );
  return filas.map((f) => ({
    id_usuario: f.id_usuario,
    nombre: f.nombre,
    correo: f.correo,
    rol: f.rol,
    detalle: C.detalleDestinatario(f)
  }));
}

/** Cuántos de los `ids` son usuarios activos a los que `usuario` puede escribir. */
async function contarPermitidos(usuario, ids) {
  const regla = alcance(usuario);
  const [[fila]] = await pool.query(
    `SELECT COUNT(*) AS n FROM usuario u
     WHERE u.id_usuario IN (?) AND u.estado = 'activo' AND u.id_usuario <> ? AND ${regla.sql}`,
    [ids, usuario.id_usuario, ...regla.params]
  );
  return Number(fila.n);
}

module.exports = { MAX_RESULTADOS, alcance, escaparLike, buscar, contarPermitidos };
