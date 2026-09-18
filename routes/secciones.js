const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/secciones
// Los combos de grupo del dashboard ('6-A', '5-A', ...) eran una lista fija en CFG.groups.
// Ahora salen de la tabla SECCION, así que el valor que viaja a la API es el id_seccion real
// (la clave foránea que usan CALIFICACION, ASISTENCIA y TAREA) y no una etiqueta inventada.
router.get('/', async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT id_seccion, nivel, grado, letra, turno, aula, anio_lectivo,
              CONCAT(grado, '-', letra) AS grupo
       FROM seccion
       ORDER BY nivel, grado, letra`
    );
    res.json(filas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las secciones' });
  }
});

module.exports = router;
