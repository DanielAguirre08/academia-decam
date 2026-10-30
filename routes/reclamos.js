const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const C = require('../logica-comunicacion');
const LD = require('../logica-docente');
const { requiereRol } = require('../middleware/auth');
const { responderError, ErrorDeNegocio } = require('../middleware/errores');
const { enTransaccion } = require('../datos/transaccion');

const SQL_RECLAMOS = `
  SELECT r.id_reclamo, r.asunto, r.tipo, r.prioridad, r.descripcion, r.estado, r.id_usuario_autor,
         DATE_FORMAT(r.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
         CONCAT(u.nombre, ' ', u.apellido) AS autor, u.rol AS rol_autor
  FROM reclamo r JOIN usuario u ON u.id_usuario = r.id_usuario_autor`;

function conEtiqueta(r) {
  return Object.assign({}, r, { estadoEtiqueta: C.etiquetaEstadoReclamo(r.estado) });
}

// GET /api/reclamos?estado=
// HU-011: el autor ve SOLO sus reclamos; el Jefe Académico, que los atiende, ve todos.
router.get('/', requiereRol('alumno', 'docente', 'jefe_academico'), async (req, res) => {
  try {
    const usuario = req.session.usuario;
    let sql = SQL_RECLAMOS;
    const params = [];
    if (usuario.rol !== 'jefe_academico') { sql += ' WHERE r.id_usuario_autor = ?'; params.push(usuario.id_usuario); }
    sql += " ORDER BY FIELD(r.estado, 'pendiente', 'revision', 'resuelto'), r.fecha_registro DESC";
    const [filas] = await pool.query(sql, params);
    res.json(C.filtrarReclamos(filas, req.query.estado).map(conEtiqueta));
  } catch (err) {
    responderError(res, err, 'Error al obtener los reclamos');
  }
});

// POST /api/reclamos  { asunto, tipo, prioridad, descripcion }
// HU-011 CA-001: estado inicial "pendiente"; autor y fecha los asigna el servidor (sesión y NOW()).
// CA-002: sin asunto o descripción no se registra.
router.post('/', requiereRol('alumno', 'docente'), async (req, res) => {
  try {
    const datos = Object.assign({ tipo: 'calificacion', prioridad: 'normal' }, req.body || {});
    const revision = C.revisarReclamo(datos);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const [r] = await pool.query(
      `INSERT INTO reclamo (id_usuario_autor, asunto, tipo, prioridad, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      [req.session.usuario.id_usuario, datos.asunto.trim(), datos.tipo, datos.prioridad, datos.descripcion.trim()]
    );
    const [[creado]] = await pool.query(SQL_RECLAMOS + ' WHERE r.id_reclamo = ?', [r.insertId]);
    res.status(201).json(conEtiqueta(creado));
  } catch (err) {
    responderError(res, err, 'Error al registrar el reclamo');
  }
});

// PATCH /api/reclamos/:id/estado
// HU-011 CA-003: SOLO el Jefe Académico avanza el reclamo: pendiente -> revisión -> resuelto.
router.patch('/:id/estado', requiereRol('jefe_academico'), async (req, res) => {
  try {
    if (!LD.esIdValido(req.params.id)) return res.status(400).json({ error: 'Reclamo inválido' });
    const id = await enTransaccion(async (conexion) => {
      const [[reclamo]] = await conexion.query('SELECT id_reclamo, estado FROM reclamo WHERE id_reclamo = ? FOR UPDATE', [req.params.id]);
      if (!reclamo) throw new ErrorDeNegocio(404, 'El reclamo indicado no existe');
      const siguiente = C.siguienteEstadoReclamo(reclamo.estado);
      if (!siguiente) throw new ErrorDeNegocio(409, 'El reclamo ya está resuelto');
      await conexion.query('UPDATE reclamo SET estado = ? WHERE id_reclamo = ?', [siguiente, reclamo.id_reclamo]);
      return reclamo.id_reclamo;
    });
    const [[actualizado]] = await pool.query(SQL_RECLAMOS + ' WHERE r.id_reclamo = ?', [id]);
    res.json(conEtiqueta(actualizado));
  } catch (err) {
    responderError(res, err, 'Error al actualizar el reclamo');
  }
});

module.exports = router;
