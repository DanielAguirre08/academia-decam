const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const C = require('../logica-comunicacion');
const LD = require('../logica-docente');
const { requiereSesion } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');

// Mensajes directos entre usuarios. Cada uno ve SOLO los mensajes que envió o recibió.

// GET /api/mensajes?bandeja=recibidos|enviados
router.get('/', requiereSesion, async (req, res) => {
  try {
    const enviados = req.query.bandeja === 'enviados';
    const [filas] = await pool.query(
      `SELECT m.id_mensaje, m.contenido, m.leido, DATE_FORMAT(m.fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio,
              CONCAT(o.nombre, ' ', o.apellido) AS otro, o.correo AS correoOtro
       FROM mensaje m JOIN usuario o ON o.id_usuario = ${enviados ? 'm.id_destinatario' : 'm.id_remitente'}
       WHERE ${enviados ? 'm.id_remitente' : 'm.id_destinatario'} = ?
       ORDER BY m.fecha_envio DESC, m.id_mensaje DESC`,
      [req.session.usuario.id_usuario]
    );
    res.json(filas.map((m) => Object.assign({}, m, { leido: !!m.leido })));
  } catch (err) {
    responderError(res, err, 'Error al obtener los mensajes');
  }
});

// POST /api/mensajes  { para (correo), contenido } — el remitente sale de la sesión.
router.post('/', requiereSesion, async (req, res) => {
  try {
    const u = req.session.usuario;
    const revision = C.revisarMensaje(req.body, u.correo);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const [[destino]] = await pool.query(
      "SELECT id_usuario FROM usuario WHERE correo = ? AND estado = 'activo'", [req.body.para.trim().toLowerCase()]
    );
    if (!destino) return res.status(404).json({ error: 'No existe un usuario activo con ese correo' });
    // La comparación de textos de la capa de Lógica no basta: la intercalación utf8mb4_unicode_ci
    // de MySQL trata "próf@" igual que "prof@". La regla definitiva es por id (control 12).
    if (destino.id_usuario === u.id_usuario) return res.status(400).json({ error: 'No puedes enviarte un mensaje a ti mismo' });

    const [r] = await pool.query(
      'INSERT INTO mensaje (id_remitente, id_destinatario, contenido) VALUES (?, ?, ?)',
      [u.id_usuario, destino.id_usuario, req.body.contenido.trim()]
    );
    res.status(201).json({ id_mensaje: r.insertId });
  } catch (err) {
    responderError(res, err, 'Error al enviar el mensaje');
  }
});

// PATCH /api/mensajes/:id/leido — solo el destinatario puede marcarlo como leído.
router.patch('/:id/leido', requiereSesion, async (req, res) => {
  try {
    if (!LD.esIdValido(req.params.id)) return res.status(400).json({ error: 'Mensaje inválido' });
    const [r] = await pool.query(
      'UPDATE mensaje SET leido = TRUE WHERE id_mensaje = ? AND id_destinatario = ?', [req.params.id, req.session.usuario.id_usuario]
    );
    // Un mensaje ajeno responde igual que uno inexistente: no se revela que existe.
    if (!r.affectedRows) return res.status(404).json({ error: 'El mensaje indicado no existe' });
    res.json({ id_mensaje: Number(req.params.id), leido: true });
  } catch (err) {
    responderError(res, err, 'Error al actualizar el mensaje');
  }
});

module.exports = router;
