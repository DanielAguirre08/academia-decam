const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { responderError } = require('../middleware/errores');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol, puedeOperarEnSeccion, seccionesPermitidas } = require('../middleware/auth');

// GET /api/calificaciones?id_seccion=1&estado=&busqueda=
// CA-003: filtros por grupo, estado y nombre
// RF-07: el cuadro completo es solo del docente y del jefe académico; un alumno NO entra aquí
// (sus propias notas las verá por un endpoint aparte que siempre filtra por su sesión).
// Un docente solo ve las secciones donde dicta; el jefe académico ve todas.
router.get('/', requiereRol('docente', 'jefe_academico'), async (req, res) => {
  try {
    const { id_seccion, estado, busqueda } = req.query;
    if (id_seccion !== undefined && id_seccion !== '' && !L.esIdValido(id_seccion)) {
      return res.status(400).json({ error: 'Grupo inválido' });
    }

    const permitidas = await seccionesPermitidas(req.session.usuario); // null = todas
    if (id_seccion && permitidas && !permitidas.includes(Number(id_seccion))) {
      return res.status(403).json({ error: 'No dictas en este grupo' });
    }

    let sql = `SELECT c.id_calificacion, c.id_alumno, c.id_seccion, c.examen1, c.examen2,
                      c.tareas, c.proyecto, c.promedio, c.periodo,
                      CONCAT(u.nombre,' ',u.apellido) AS nombreAlumno
               FROM calificacion c
               JOIN alumno a ON a.id_alumno = c.id_alumno
               JOIN usuario u ON u.id_usuario = a.id_usuario
               WHERE 1 = 1`;
    const params = [];
    if (id_seccion) { sql += ' AND c.id_seccion = ?'; params.push(id_seccion); }
    if (permitidas) {
      if (!permitidas.length) return res.json([]);
      sql += ' AND c.id_seccion IN (?)'; params.push(permitidas);
    }
    sql += ' ORDER BY u.apellido, u.nombre';

    const [filas] = await pool.query(sql, params);

    // CA-003: el filtro por estado/nombre se resuelve con la MISMA función pura del frontend
    const filtradas = L.filtrarCalificaciones(filas, { estado, busqueda });
    res.json(filtradas);
  } catch (err) {
    responderError(res, err, 'Error al obtener calificaciones');
  }
});

// PATCH /api/calificaciones/:id  { campo, valor }
// CA-001: recalcula promedio y estado inmediatamente tras modificar una nota.
// Nota y promedio se escriben en UNA sentencia, dentro de una transacción que bloquea la fila:
// nunca queda una nota nueva con el promedio viejo (control 04 de verificar-integridad.sql).
router.patch('/:id', requiereRol('docente'), async (req, res) => {
  const { id } = req.params;
  const { campo, valor } = req.body || {}; // campo: examen1 | examen2 | tareas | proyecto
  if (!L.esIdValido(id)) return res.status(400).json({ error: 'Calificación inválida' });
  const columnasValidas = ['examen1', 'examen2', 'tareas', 'proyecto'];
  if (!columnasValidas.includes(campo)) return res.status(400).json({ error: 'Campo inválido' });
  if (!L.validarNota(valor)) return res.status(400).json({ error: 'La nota debe estar entre 0 y 20, con máximo 2 decimales' });

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [[fila]] = await conexion.query(
      'SELECT id_seccion, examen1, examen2, tareas, proyecto FROM calificacion WHERE id_calificacion = ? FOR UPDATE', [id]
    );
    if (!fila) { await conexion.rollback(); return res.status(404).json({ error: 'La calificación indicada no existe' }); }
    if (!(await puedeOperarEnSeccion(req.session.usuario, fila.id_seccion))) {
      await conexion.rollback();
      return res.status(403).json({ error: 'No dictas en el grupo de este alumno' });
    }

    // OJO: no se puede usar `valor || null` porque la nota 0 es falsy y se guardaría como NULL
    const nota = (valor === '' || valor === null || valor === undefined) ? null : Number(valor);
    const notas = { examen1: fila.examen1, examen2: fila.examen2, tareas: fila.tareas, proyecto: fila.proyecto };
    notas[campo] = nota;
    const promedio = L.calcularPromedio(notas);

    // ${campo} es seguro: solo puede ser uno de los 4 nombres de columnasValidas.
    await conexion.query(`UPDATE calificacion SET ${campo} = ?, promedio = ? WHERE id_calificacion = ?`, [nota, promedio, id]);
    await conexion.commit();

    res.json({ id_calificacion: Number(id), promedio, estado: L.determinarEstado(promedio) });
  } catch (err) {
    await conexion.rollback();
    responderError(res, err, 'Error al actualizar la calificación');
  } finally {
    conexion.release();
  }
});

module.exports = router;
