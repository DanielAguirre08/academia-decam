require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- Rutas de la API (Capa de Lógica + Datos) ---
app.use('/api/secciones', require('./routes/secciones'));
app.use('/api/calificaciones', require('./routes/calificaciones'));
app.use('/api/asistencia', require('./routes/asistencia'));
app.use('/api/tareas', require('./routes/tareas'));

// --- Sirve el frontend existente (dashboard.html + js/) sin tocarlo ---
// Se publican SOLO esos dos: un express.static sobre la raíz del proyecto también dejaría
// accesibles .env, schema.sql, config/db.js y server.js desde el navegador.
app.get('/', (req, res) => res.redirect('/dashboard.html'));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.use('/js', express.static(path.join(__dirname, 'js')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Academia Decam API escuchando en http://localhost:${PORT}`));
