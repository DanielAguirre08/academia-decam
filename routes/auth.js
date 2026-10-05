const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pool = require('../config/db');
const { responderError } = require('../middleware/errores');
const A = require('../logica-auth'); // capa de lógica pura: reglas de bloqueo, roles e iniciales
const { requiereSesion } = require('../middleware/auth');

// CA-002 (HU-001): un solo mensaje para "correo inexistente", "contraseña mala" y "rol equivocado",
// así nadie puede averiguar qué correos están registrados.
const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos';

// Hash de relleno: si el correo no existe se compara igual contra algo, para que la respuesta
// tarde lo mismo que con un correo real y no delate cuáles existen.
const HASH_RELLENO = bcrypt.hashSync('relleno-sin-uso', 10);

/** Lo que se guarda en la sesión y se le devuelve al navegador (nunca el hash). */
async function construirDatosSesion(usuario) {
  let idDocente = null, idAlumno = null, idSeccion = null, grupo = null;

  if (usuario.rol === 'docente') {
    const [[fila]] = await pool.query('SELECT id_docente FROM docente WHERE id_usuario = ?', [usuario.id_usuario]);
    idDocente = fila ? fila.id_docente : null;
  }
  if (usuario.rol === 'alumno') {
    const [[fila]] = await pool.query(
      `SELECT a.id_alumno, a.id_seccion, CONCAT(s.grado, '-', s.letra) AS grupo
       FROM alumno a LEFT JOIN seccion s ON s.id_seccion = a.id_seccion
       WHERE a.id_usuario = ?`,
      [usuario.id_usuario]
    );
    if (fila) { idAlumno = fila.id_alumno; idSeccion = fila.id_seccion; grupo = fila.grupo; }
  }

  return {
    id_usuario: usuario.id_usuario,
    nombreCompleto: usuario.nombre + ' ' + usuario.apellido,
    iniciales: A.obtenerIniciales(usuario.nombre, usuario.apellido),
    correo: usuario.correo,
    rol: usuario.rol,
    rolEtiqueta: A.etiquetaRol(usuario.rol, grupo),
    id_docente: idDocente,   // el autor de calificaciones/asistencia/tareas sale de aquí, no del navegador
    id_alumno: idAlumno,     // el alumno solo podrá consultar SUS datos con este id
    id_seccion: idSeccion,
    grupo: grupo
  };
}

function mensajeBloqueo(minutos) {
  return 'Cuenta bloqueada temporalmente por demasiados intentos. Intenta de nuevo en ' +
    minutos + (minutos === 1 ? ' minuto' : ' minutos');
}

// POST /api/auth/login  { correo, contrasena, rol }
// CA-001 / CA-002 (HU-001) y RNF-02 (bcrypt + bloqueo tras 5 intentos fallidos)
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena, rol } = req.body || {};
    if (!A.validarCredenciales(correo, contrasena)) {
      return res.status(400).json({ error: 'Ingresa tu correo y contraseña' });
    }

    const ahora = new Date();
    const [[usuario]] = await pool.query(
      `SELECT id_usuario, nombre, apellido, correo, contrasena_hash, rol, estado,
              intentos_fallidos, bloqueado_hasta
       FROM usuario WHERE correo = ?`,
      [String(correo).trim()]
    );

    if (!usuario) {
      await bcrypt.compare(String(contrasena), HASH_RELLENO);
      return res.status(401).json({ error: MENSAJE_CREDENCIALES });
    }

    // Una cuenta bloqueada se rechaza ANTES de mirar la contraseña: ni la correcta entra.
    if (A.estaBloqueada(usuario.bloqueado_hasta, ahora)) {
      return res.status(423).json({ error: mensajeBloqueo(A.minutosRestantes(usuario.bloqueado_hasta, ahora)) });
    }

    const contrasenaCorrecta = await bcrypt.compare(String(contrasena), usuario.contrasena_hash);
    if (!contrasenaCorrecta || usuario.estado !== 'activo' || !A.rolCoincide(usuario.rol, rol)) {
      const nuevo = A.registrarIntentoFallido(usuario.intentos_fallidos, ahora);
      await pool.query(
        'UPDATE usuario SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?',
        [nuevo.intentosFallidos, nuevo.bloqueadoHasta, usuario.id_usuario]
      );
      if (nuevo.bloqueada) return res.status(423).json({ error: mensajeBloqueo(A.MINUTOS_BLOQUEO) });
      return res.status(401).json({ error: MENSAJE_CREDENCIALES });
    }

    // Acceso correcto: se limpia el contador y se abre una sesión NUEVA (evita fijación de sesión).
    await pool.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?', [usuario.id_usuario]);
    const datos = await construirDatosSesion(usuario);
    req.session.regenerate(function (err) {
      if (err) { console.error(err); return res.status(500).json({ error: 'Error al iniciar sesión' }); }
      req.session.usuario = datos;
      res.json(datos);
    });
  } catch (err) {
    responderError(res, err, 'Error al iniciar sesión');
  }
});

// POST /api/auth/logout
router.post('/logout', function (req, res) {
  req.session.destroy(function () {
    res.clearCookie('decam.sid');
    res.json({ ok: true });
  });
});

// POST /api/auth/contrasena  { actual, nueva, confirmacion }
// "Mi Perfil": cambia la contraseña del usuario de la sesión (p. ej. la inicial que entregó el
// Registrador). Se exige la actual: una sesión olvidada abierta no basta para cambiarla.
router.post('/contrasena', requiereSesion, async (req, res) => {
  try {
    const { actual, nueva, confirmacion } = req.body || {};
    const revision = A.revisarCambioContrasena(actual, nueva, confirmacion);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const idUsuario = req.session.usuario.id_usuario;
    const [[usuario]] = await pool.query('SELECT contrasena_hash FROM usuario WHERE id_usuario = ?', [idUsuario]);
    if (!usuario || !(await bcrypt.compare(String(actual), usuario.contrasena_hash))) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    }
    await pool.query('UPDATE usuario SET contrasena_hash = ? WHERE id_usuario = ?', [await bcrypt.hash(nueva, 10), idUsuario]);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err, 'Error al cambiar la contraseña');
  }
});

// GET /api/auth/me — quién soy según la sesión (el navegador lo usa al recargar la página)
router.get('/me', requiereSesion, function (req, res) {
  res.json(req.session.usuario);
});

module.exports = router;
