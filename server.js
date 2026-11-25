require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');

const app = express();

// --- Cabeceras de seguridad (hallazgo SEG-16, OWASP A05) ---
// No anunciar la tecnología del servidor (X-Powered-By: Express).
app.disable('x-powered-by');
// helmet añade X-Content-Type-Options: nosniff, X-Frame-Options, Referrer-Policy y una
// Content-Security-Policy. La política se ajusta a lo que usa dashboard.html: scripts propios y
// en línea (incluidos los onclick), estilos e íconos de jsDelivr, fuentes de Google e imágenes data:.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"] // nadie puede meter el sistema en un marco (clickjacking)
    }
  }
}));

// --- CORS (hallazgo SEG-18) ---
// El frontend se sirve desde este mismo servidor, así que no necesita CORS. Antes se aceptaba
// cualquier origen (Access-Control-Allow-Origin: *). Si algún día el frontend vive en otro dominio,
// se agrega a CORS_ORIGINS en el .env, separado por comas (p. ej. http://localhost:5500).
const origenesPermitidos = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origenesPermitidos.length ? origenesPermitidos : false, credentials: true }));

app.use(express.json());

// --- Sesión (HU-001) ---
// La cookie solo guarda un identificador; los datos del usuario viven en el servidor.
// MemoryStore es suficiente para desarrollo: al reiniciar el servidor hay que iniciar sesión otra vez.
// En producción la clave es obligatoria: con la de desarrollo (pública en el repo) cualquiera
// podría firmar una cookie de sesión válida.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('Falta SESSION_SECRET: defínela en el .env antes de arrancar en producción');
}
app.use(session({
  name: 'decam.sid',
  secret: process.env.SESSION_SECRET || 'decam-desarrollo-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

// --- Rutas de la API (Capa de Lógica + Datos) ---
// /api/auth es pública (es la que abre la sesión); el resto exige sesión y rol dentro de cada archivo.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/secciones', require('./routes/secciones'));
app.use('/api/calificaciones', require('./routes/calificaciones'));
app.use('/api/asistencia', require('./routes/asistencia'));
app.use('/api/tareas', require('./routes/tareas'));
app.use('/api/registros', require('./routes/registros'));
app.use('/api/matriculas', require('./routes/matriculas'));
app.use('/api/mi', require('./routes/mi'));
app.use('/api/reclamos', require('./routes/reclamos'));
app.use('/api/avisos', require('./routes/avisos'));
app.use('/api/mensajes', require('./routes/mensajes'));
app.use('/api', require('./routes/resumen'));   // GET /api/resumen y GET /api/perfil
app.use('/api', require('./routes/consultas')); // GET /api/horario, /api/seccion y /api/alumnos

// --- Sirve el frontend existente (dashboard.html + js/) sin tocarlo ---
// Se publican SOLO esos dos: un express.static sobre la raíz del proyecto también dejaría
// accesibles .env, schema.sql, config/db.js y server.js desde el navegador.
app.get('/', (req, res) => res.redirect('/dashboard.html'));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// --- Errores ---
// Una ruta de la API que no existe responde JSON (el navegador espera JSON, no HTML).
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(require('./middleware/errores').manejadorFinal);

// Las pruebas de API importan `app` sin abrir el puerto (supertest lo levanta en memoria).
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Academia Decam API escuchando en http://localhost:${PORT}`));
}

module.exports = app;
