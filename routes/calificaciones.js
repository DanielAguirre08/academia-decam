const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const L = require('../logica-docente'); // la MISMA capa de lógica pura del frontend, reusada tal cual

// GET /api/calificaciones?id_seccion=1&grupo=&estado=&busqueda=
// CA-003: filtros por grupo, estado y nombre
router.get('/', async (req, res) => {
  try {
    const { id_seccion, estado, busqueda } = req.query;
    let sql = `SELECT c.id_calificacion, c.id_alumno, c.id_seccion, c.examen1, c.examen2,
                      c.tareas, c.proyecto, c.promedio, c.periodo,
                      CONCAT(u.nombre,' ',u.apellido) AS nombreAlumno
               FROM calificacion c
               JOIN alumno a ON a.id_alumno = c.id_alumno
               JOIN usuario u ON u.id_usuario = a.id_usuario`;
    const params = [];
    if (id_seccion) { sql += ' WHERE c.id_seccion = ?'; params.push(id_seccion); }

    const [filas] = await pool.query(sql, params);

    // CA-003: el filtro por estado/nombre se resuelve con la MISMA función pura del frontend
    const filtradas = L.filtrarCalificaciones(filas, { estado, busqueda });
    res.json(filtradas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener calificaciones' });
  }
});

// PATCH /api/calificaciones/:id  { campo, valor }
// CA-001: recalcula promedio y estado inmediatamente tras modificar una nota
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { campo, valor } = req.body; // campo: examen1 | examen2 | tareas | proyecto
    const columnasValidas = ['examen1', 'examen2', 'tareas', 'proyecto'];
    if (!columnasValidas.includes(campo)) return res.status(400).json({ error: 'Campo inválido' });
    if (!L.validarNota(valor)) return res.status(400).json({ error: 'La nota debe estar entre 0 y 20' });

    // OJO: no se puede usar `valor || null` porque la nota 0 es falsy y se guardaría como NULL
    const nota = (valor === '' || valor === null || valor === undefined) ? null : valor;
    await pool.query(`UPDATE calificacion SET ${campo} = ? WHERE id_calificacion = ?`, [nota, id]);

    const [[fila]] = await pool.query('SELECT examen1, examen2, tareas, proyecto FROM calificacion WHERE id_calificacion = ?', [id]);
    const promedio = L.calcularPromedio(fila);
    await pool.query('UPDATE calificacion SET promedio = ? WHERE id_calificacion = ?', [promedio, id]);

    res.json({ id_calificacion: id, promedio, estado: L.determinarEstado(promedio) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la calificación' });
  }
});


// POST /api/calificaciones  { nombreAlumno, id_seccion, examen1, examen2, tareas, proyecto, periodo }
// CA-002 (HU-005): da de alta a un alumno en el cuadro de notas. Toca 3 tablas (USUARIO, ALUMNO
// y CALIFICACION), así que va en una transacción: o entran las tres filas o no entra ninguna.
router.post('/', async (req, res) => {
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
      [nombre, apellido, 'alumno.' + dni + '@acadecam.edu.pe', '$2b$10$placeholder_hash_reemplazar']
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
    console.error(err);
    res.status(500).json({ error: 'Error al registrar al alumno' });
  } finally {
    conexion.release();
  }
});

module.exports = router;
