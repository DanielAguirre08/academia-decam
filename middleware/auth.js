// Capa de Datos/Servidor — control de acceso por sesión y por rol (HU-001, RF-07, RF-11, RF-12).
// La regla se aplica AQUÍ, en el servidor: ocultar un botón en el HTML no protege nada.

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

module.exports = { requiereSesion, requiereRol };
