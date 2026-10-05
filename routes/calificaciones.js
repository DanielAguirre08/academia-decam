const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { responderError } = require('../middleware/errores');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual
const { requiereRol, puedeOperarEnSeccion, seccionesPermitidas } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

// POST /api/calificaciones  { nombreAlumno, id_seccion, examen1, examen2, tareas, proyecto, periodo }
// CA-002 (HU-005): da de alta a un alumno en el cuadro de notas. Toca 3 tablas (USUARIO, ALUMNO
// y CALIFICACION), así que va en una transacción: o entran las tres filas o no entra ninguna.
router.post('/', requiereRol('docente'), async (req, res) => {
  const conexion = await pool.getConnection();
  try {
    const { nombreAlumno, id_seccion, examen1, examen2, tareas, proyecto } = req.body;
    const periodo = req.body.periodo || 'Bimestre I';

    if (!nombreAlumno || !nombreAlumno.trim()) return res.status(400).json({ error: 'El nombre del alumno es obligatorio' });
    if (!id_seccion) return res.status(400).json({ error: 'Debes seleccionar un grupo' });

    const notas = { examen1, examen2, tareas, proyecto };
    const invalida = Object.keys(notas).find((k) => !L.validarNota(notas[k]));
    if (invalida) return res.status(400).json({ error: 'La nota de ' + invalida + ' debe estar entre 0 y 20' });

    const [[seccion]] = await conexion.query('SELECT nivel FROM seccion WHERE id_seccion = ?', [id_seccion]);
    if (!seccion) return res.status(400).json({ error: 'La sección indicada no existe' });

    // ALUMNO.id_apoderado es NOT NULL y el modal del dashboard no pide apoderado todavía,
    // así que se engancha al primero registrado (ver seed.sql).
    const [[apoderado]] = await conexion.query('SELECT MIN(id_apoderado) AS id_apoderado FROM apoderado');
    if (!apoderado || !apoderado.id_apoderado) {
      return res.status(400).json({ error: 'No hay ningún apoderado registrado al cual asociar al alumno' });
    }

    const partes = nombreAlumno.trim().split(/\s+/);
    const nombre = partes[0];
    const apellido = partes.slice(1).join(' ') || partes[0];

    await conexion.beginTransaction();

    // DNI correlativo a partir del último registrado (la columna es UNIQUE).
    const [[siguiente]] = await conexion.query(
      "SELECT LPAD(IFNULL(MAX(CAST(dni AS UNSIGNED)), 70000000) + 1, 8, '0') AS dni FROM alumno"
    );
    const dni = siguiente.dni;

    const [resUsuario] = await conexion.query(
      `INSERT INTO usuario (nombre, apellido, correo, contrasena_hash, rol)
       VALUES (?, ?, ?, ?, 'alumno')`,
      // Contraseña aleatoria que nadie conoce: la cuenta no puede iniciar sesión hasta que el
      // módulo de Registro le asigne una real (el hash falso de antes ya no sirve con bcrypt).
      [nombre, apellido, 'alumno.' + dni + '@acadecam.edu.pe', bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10)]
    );

    // fecha_nacimiento y sexo son NOT NULL en el diccionario de datos pero el modal
    // "Agregar alumno" no los pide; quedan con un valor provisional hasta que se amplíe el modal.
    const [resAlumno] = await conexion.query(
      `INSERT INTO alumno (id_usuario, dni, fecha_nacimiento, sexo, nivel, id_seccion, id_apoderado)
       VALUES (?, ?, '2015-01-01', 'M', ?, ?, ?)`,
      [resUsuario.insertId, dni, seccion.nivel, id_seccion, apoderado.id_apoderado]
    );

    // CA-001: el promedio lo calcula la capa de Lógica, no la base de datos
    const promedio = L.calcularPromedio(notas);
    const limpia = (v) => (v === '' || v === null || v === undefined ? null : v);
    const [resCalif] = await conexion.query(
      `INSERT INTO calificacion (id_alumno, id_seccion, examen1, examen2, tareas, proyecto, promedio, periodo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [resAlumno.insertId, id_seccion, limpia(examen1), limpia(examen2), limpia(tareas), limpia(proyecto), promedio, periodo]
    );

    await conexion.commit();

    res.status(201).json({
      id_calificacion: resCalif.insertId,
      id_alumno: resAlumno.insertId,
      nombreAlumno: nombre + ' ' + apellido,
      id_seccion: Number(id_seccion),
      promedio: promedio,
      estado: L.determinarEstado(promedio),
      periodo: periodo
    });
  } catch (err) {
    await conexion.rollback();
    responderError(res, err, 'Error al registrar al alumno');
  } finally {
    conexion.release();
  }
});

module.exports = router;
