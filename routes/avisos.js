const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const C = require('../logica-comunicacion');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');

const SQL_AVISOS = `
  SELECT a.id_aviso, a.titulo, a.contenido, a.destinatarios,
         DATE_FORMAT(a.fecha_publicacion, '%Y-%m-%d %H:%i') AS fecha_publicacion,
         CONCAT(u.nombre, ' ', u.apellido) AS autor
  FROM aviso a JOIN usuario u ON u.id_usuario = a.id_usuario_autor`;

// GET /api/avisos — HU-012 CA-001/CA-002: cualquier usuario con sesión ve (en modo consulta) los
// avisos dirigidos a su rol; los roles administrativos los ven todos.
router.get('/', requiereSesion, async (req, res) => {
  try {
    const visibles = C.destinatariosVisibles(req.session.usuario.rol);
    const [filas] = await pool.query(
      SQL_AVISOS + ' WHERE a.destinatarios IN (?) ORDER BY a.fecha_publicacion DESC, a.id_aviso DESC', [visibles]
    );
    res.json(filas);
  } catch (err) {
    responderError(res, err, 'Error al obtener los avisos');
  }
});

// POST /api/avisos  { titulo, contenido, destinatarios }
// HU-012 CA-001: publica con la fecha del servidor. CA-002 y RF-12: solo el Jefe Académico publica
// (el control 11 de verificar-integridad.sql vigila que ningún otro rol aparezca como autor).
router.post('/', requiereRol('jefe_academico'), async (req, res) => {
  try {
    const datos = Object.assign({ destinatarios: 'todos' }, req.body || {});
    const revision = C.revisarAviso(datos);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const [r] = await pool.query(
      'INSERT INTO aviso (titulo, contenido, id_usuario_autor, destinatarios) VALUES (?, ?, ?, ?)',
      [datos.titulo.trim(), datos.contenido.trim(), req.session.usuario.id_usuario, datos.destinatarios]
    );
    const [[creado]] = await pool.query(SQL_AVISOS + ' WHERE a.id_aviso = ?', [r.insertId]);
    res.status(201).json(creado);
  } catch (err) {
    responderError(res, err, 'Error al publicar el aviso');
  }
});

module.exports = router;
