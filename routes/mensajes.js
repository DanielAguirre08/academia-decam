const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const C = require('../logica-comunicacion');
const LD = require('../logica-docente');
const Destinatarios = require('../datos/destinatarios');
const { enTransaccion } = require('../datos/transaccion');
const { requiereSesion } = require('../middleware/auth');
const { responderError } = require('../middleware/errores');

// Mensajes directos entre usuarios. Cada uno ve SOLO los mensajes que envió o recibió, y solo
// puede escribir a quien comparte clases con él (HU-013, regla en datos/destinatarios.js).

// Mismo texto para "no existe" y "no puedes escribirle": no se revela quién existe fuera de tu alcance.
const MSJ_DESTINO_INVALIDO = 'El destinatario no existe o no puedes escribirle';

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

// GET /api/mensajes/no-leidos — cuántos mensajes recibidos faltan abrir (contador del menú).
// Usa el índice idx_mensaje_bandeja (id_destinatario, leido, ...): es barato aunque se consulte cada minuto.
router.get('/no-leidos', requiereSesion, async (req, res) => {
  try {
    const [[fila]] = await pool.query(
      'SELECT COUNT(*) AS n FROM mensaje WHERE id_destinatario = ? AND leido = FALSE', [req.session.usuario.id_usuario]
    );
    res.json({ no_leidos: Number(fila.n) });
  } catch (err) {
    responderError(res, err, 'Error al contar los mensajes no leídos');
  }
});

// GET /api/mensajes/destinatarios?q=ana — sugerencias del buscador "Para" (HU-013).
// Con menos de 2 letras responde [] (no es un error: el usuario aún está escribiendo).
router.get('/destinatarios', requiereSesion, async (req, res) => {
  try {
    res.json(await Destinatarios.buscar(req.session.usuario, req.query.q));
  } catch (err) {
    responderError(res, err, 'Error al buscar destinatarios');
  }
});

// POST /api/mensajes  { para: [id_usuario, ...] | correo, contenido } — el remitente sale de la sesión.
// Con varios destinatarios se guarda un mensaje por cada uno, todos o ninguno (transacción).
router.post('/', requiereSesion, async (req, res) => {
  try {
    const u = req.session.usuario;
    const revision = C.revisarMensaje(req.body, u.correo, u.id_usuario);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    let ids;
    if (Array.isArray(req.body.para)) {
      ids = C.destinatariosUnicos(req.body.para);
    } else {
      const [[destino]] = await pool.query(
        "SELECT id_usuario FROM usuario WHERE correo = ? AND estado = 'activo'", [req.body.para.trim().toLowerCase()]
      );
      if (!destino) return res.status(404).json({ error: MSJ_DESTINO_INVALIDO });
      // La comparación de textos de la capa de Lógica no basta: la intercalación utf8mb4_unicode_ci
      // de MySQL trata "próf@" igual que "prof@". La regla definitiva es por id (control 12).
      if (destino.id_usuario === u.id_usuario) return res.status(400).json({ error: 'No puedes enviarte un mensaje a ti mismo' });
      ids = [destino.id_usuario];
    }
    if (await Destinatarios.contarPermitidos(u, ids) !== ids.length) return res.status(404).json({ error: MSJ_DESTINO_INVALIDO });

    const contenido = req.body.contenido.trim();
    const idsMensaje = await enTransaccion(async (conexion) => {
      const creados = [];
      for (const id of ids) {
        const [r] = await conexion.query(
          'INSERT INTO mensaje (id_remitente, id_destinatario, contenido) VALUES (?, ?, ?)', [u.id_usuario, id, contenido]
        );
        creados.push(r.insertId);
      }
      return creados;
    });
    res.status(201).json({ id_mensaje: idsMensaje[0], ids_mensaje: idsMensaje, enviados: idsMensaje.length });
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
