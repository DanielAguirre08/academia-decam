// Capa de Datos/Servidor — traducción uniforme de errores a respuestas HTTP.
// Regla: un dato inválido que se le escapó a la validación y que MySQL rechaza es culpa de la
// petición (4xx), no del servidor. Solo lo verdaderamente inesperado responde 500.

// Códigos de error de MySQL que significan "la petición trae datos imposibles".
const ERRORES_DE_DATOS = {
  ER_NO_REFERENCED_ROW_2: { status: 400, error: 'Alguno de los registros indicados no existe' },
  ER_DUP_ENTRY: { status: 409, error: 'Ya existe un registro con esos datos' },
  ER_CHECK_CONSTRAINT_VIOLATED: { status: 400, error: 'Algún dato está fuera del rango permitido' },
  ER_TRUNCATED_WRONG_VALUE: { status: 400, error: 'Algún dato tiene un formato inválido' },
  ER_WRONG_VALUE: { status: 400, error: 'Algún dato tiene un formato inválido' },
  ER_DATA_TOO_LONG: { status: 400, error: 'Algún texto supera la longitud permitida' },
  ER_TRUNCATED_WRONG_VALUE_FOR_FIELD: { status: 400, error: 'Algún dato tiene un formato inválido' }
};

/**
 * Responde un error capturado en una ruta. `mensaje500` es el texto para el caso inesperado
 * (el detalle técnico va al log del servidor, nunca al navegador).
 */
function responderError(res, err, mensaje500) {
  const conocido = err && ERRORES_DE_DATOS[err.code];
  if (conocido) return res.status(conocido.status).json({ error: conocido.error });
  console.error(err);
  res.status(500).json({ error: mensaje500 || 'Error interno del servidor' });
}

/** Manejador final de Express: JSON mal formado -> 400 (en vez de la página HTML por defecto). */
function manejadorFinal(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  responderError(res, err);
}

module.exports = { responderError, manejadorFinal };
