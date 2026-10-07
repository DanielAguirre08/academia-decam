// Capa de Datos/Servidor — control de acceso por sesión y por rol (HU-001, RF-07, RF-11, RF-12).
// La regla se aplica AQUÍ, en el servidor: ocultar un botón en el HTML no protege nada.
const pool = require('../config/db');

/** Exige haber iniciado sesión (cualquier rol). */
function requiereSesion(req, res, next) {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ error: 'Debes iniciar sesión' });
}

/** Exige sesión Y que el rol del usuario esté entre los permitidos: requiereRol('docente', 'jefe_academico'). */
function requiereRol(...rolesPermitidos) {
  return function (req, res, next) {
    const usuario = req.session && req.session.usuario;
    if (!usuario) return res.status(401).json({ error: 'Debes iniciar sesión' });
    if (!rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
    }
    next();
  };
}

/**
 * ¿Puede este usuario operar sobre la sección? El jefe académico ve todas; un docente solo las
 * secciones donde dicta (tiene bloques en HORARIO) o de las que es tutor. Cualquier otro rol, no.
 * Las rutas la llaman DESPUÉS de comprobar que la sección existe, para responder 404 antes que 403.
 */
async function puedeOperarEnSeccion(usuario, idSeccion) {
  if (!usuario) return false;
  if (usuario.rol === 'jefe_academico') return true;
  if (usuario.rol !== 'docente' || !usuario.id_docente) return false;
  const [[fila]] = await pool.query(
    `SELECT 1 AS si FROM seccion s
     WHERE s.id_seccion = ?
       AND (s.id_docente_tutor = ?
            OR EXISTS (SELECT 1 FROM horario h WHERE h.id_seccion = s.id_seccion AND h.id_docente = ?))`,
    [idSeccion, usuario.id_docente, usuario.id_docente]
  );
  return !!fila;
}

/** Ids de las secciones donde el usuario puede operar (para filtrar listados). null = todas. */
async function seccionesPermitidas(usuario) {
  if (usuario.rol === 'jefe_academico') return null;
  if (usuario.rol !== 'docente' || !usuario.id_docente) return [];
  const [filas] = await pool.query(
    `SELECT id_seccion FROM seccion WHERE id_docente_tutor = ?
     UNION
     SELECT id_seccion FROM horario WHERE id_docente = ?`,
    [usuario.id_docente, usuario.id_docente]
  );
  return filas.map((f) => f.id_seccion);
}

module.exports = { requiereSesion, requiereRol, puedeOperarEnSeccion, seccionesPermitidas };
