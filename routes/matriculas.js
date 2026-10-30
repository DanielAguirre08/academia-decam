const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const R = require('../logica-registro'); // la MISMA capa de lógica pura que usa el navegador
const LD = require('../logica-docente');
const { requiereRol } = require('../middleware/auth');
const { responderError, ErrorDeNegocio } = require('../middleware/errores');
const { enTransaccion } = require('../datos/transaccion');
const D = require('../datos/registro');

const SQL_MATRICULAS = `
  SELECT m.id_matricula, m.codigo, m.id_alumno, m.id_seccion, m.anio_lectivo, m.estado, m.procedencia, m.observaciones,
         DATE_FORMAT(m.fecha_matricula, '%Y-%m-%d') AS fecha_matricula,
         CONCAT(u.nombre, ' ', u.apellido) AS nombreAlumno, a.dni,
         DATE_FORMAT(a.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento, a.sexo, a.direccion,
         s.nivel, s.grado, s.letra, s.turno, CONCAT(s.grado, '-', s.letra) AS seccion,
         ap.nombre_completo AS apoderado_nombre, ap.dni AS apoderado_dni,
         ap.telefono AS apoderado_telefono, ap.correo AS apoderado_correo
  FROM matricula m
  JOIN alumno a    ON a.id_alumno = m.id_alumno
  JOIN usuario u   ON u.id_usuario = a.id_usuario
  JOIN seccion s   ON s.id_seccion = m.id_seccion
  JOIN apoderado ap ON ap.id_apoderado = a.id_apoderado`;

function conFechaPeruana(m) {
  return Object.assign({}, m, { fecha: R.fechaPeruana(m.fecha_matricula) });
}

async function leerMatricula(conexion, idMatricula) {
  const [[m]] = await conexion.query(SQL_MATRICULAS + ' WHERE m.id_matricula = ?', [idMatricula]);
  return conFechaPeruana(m);
}

// GET /api/matriculas?estado=all|activa|inactiva&busqueda=
// HU-004 CA-001 (filtro por estado) y CA-003 (búsqueda por nombre o documento; sin resultados -> []).
router.get('/', requiereRol('registrador'), async (req, res) => {
  try {
    const { estado } = req.query;
    if (estado && estado !== 'all' && R.ESTADOS_MATRICULA.indexOf(estado) === -1) {
      return res.status(400).json({ error: 'Estado de matrícula inválido' });
    }
    const [filas] = await pool.query(SQL_MATRICULAS + ' ORDER BY m.id_matricula DESC');
    res.json(R.filtrarMatriculas(filas, { estado, busqueda: req.query.busqueda }).map(conFechaPeruana));
  } catch (err) {
    responderError(res, err, 'Error al obtener las matrículas');
  }
});

// POST /api/matriculas
// HU-003: registra la matrícula (CA-001 código correlativo, fecha del día, estado activa) tras
// validar los campos (*) (CA-003) y el grado del nivel (CA-002). Si el DNI ya es de un alumno
// registrado, se le matricula; si no, se registra al alumno (y a su apoderado) en la misma
// transacción. Todo o nada.
router.post('/', requiereRol('registrador'), async (req, res) => {
  try {
    const datos = req.body || {};
    const hoy = new Date();
    const revision = R.revisarMatricula(datos, hoy);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const resultado = await enTransaccion(async (conexion) => {
      const seccion = await D.buscarSeccion(conexion, {
        nivel: datos.nivel, grado: datos.grado, letra: datos.seccion, anio: datos.anio_lectivo
      });
      if (datos.turno && datos.turno !== seccion.turno) {
        throw new ErrorDeNegocio(400, 'La sección ' + seccion.grupo + ' es del turno ' + seccion.turno);
      }

      const [[alumno]] = await conexion.query('SELECT id_alumno FROM alumno WHERE dni = ?', [datos.dni]);
      let idAlumno;
      let cuenta = null;
      if (alumno) {
        idAlumno = alumno.id_alumno;
      } else {
        // Alumno nuevo: ALUMNO.fecha_nacimiento y ALUMNO.sexo son NOT NULL.
        if (!LD.validarFechaISO(datos.fecha_nacimiento) || ['M', 'F'].indexOf(datos.sexo) === -1) {
          throw new ErrorDeNegocio(400, 'El alumno con DNI ' + datos.dni + ' es nuevo: indica su fecha de nacimiento y sexo');
        }
        const creado = await D.crearAlumno(conexion, Object.assign({}, datos, { nivel: seccion.nivel }));
        idAlumno = creado.id_alumno;
        cuenta = creado.cuenta;
      }

      const matricula = await D.matricular(conexion, {
        id_alumno: idAlumno, seccion, anio: datos.anio_lectivo,
        procedencia: datos.procedencia, observaciones: datos.observaciones
      });
      return { id_matricula: matricula.id_matricula, cuenta };
    });

    const matricula = await leerMatricula(pool, resultado.id_matricula);
    if (resultado.cuenta) matricula.contrasenaInicial = resultado.cuenta.contrasenaInicial;
    res.status(201).json(matricula);
  } catch (err) {
    responderError(res, err, 'Error al registrar la matrícula');
  }
});

// PATCH /api/matriculas/:id/estado
// HU-004 CA-002: alterna activa <-> inactiva conservando el código. El alumno acompaña a su
// matrícula (inactiva -> alumno inactivo; reactivada -> alumno activo en esa sección), para que
// se cumplan los controles 02 y 03 de verificar-integridad.sql.
router.patch('/:id/estado', requiereRol('registrador'), async (req, res) => {
  try {
    if (!LD.esIdValido(req.params.id)) return res.status(400).json({ error: 'Matrícula inválida' });

    const idMatricula = await enTransaccion(async (conexion) => {
      const [[m]] = await conexion.query(
        `SELECT m.id_matricula, m.id_alumno, m.id_seccion, m.estado, s.nivel
         FROM matricula m JOIN seccion s ON s.id_seccion = m.id_seccion
         WHERE m.id_matricula = ? FOR UPDATE`, [req.params.id]
      );
      if (!m) throw new ErrorDeNegocio(404, 'La matrícula indicada no existe');

      const nuevoEstado = R.alternarEstadoMatricula(m.estado);
      const [[otraActiva]] = await conexion.query(
        "SELECT codigo FROM matricula WHERE id_alumno = ? AND id_matricula <> ? AND estado = 'activa'",
        [m.id_alumno, m.id_matricula]
      );

      if (nuevoEstado === 'activa') {
        if (otraActiva) throw new ErrorDeNegocio(409, 'El alumno ya tiene otra matrícula activa (' + otraActiva.codigo + ')');
        await conexion.query(
          "UPDATE alumno SET estado = 'activo', id_seccion = ?, nivel = ? WHERE id_alumno = ?",
          [m.id_seccion, m.nivel, m.id_alumno]
        );
      } else if (!otraActiva) {
        await conexion.query("UPDATE alumno SET estado = 'inactivo' WHERE id_alumno = ?", [m.id_alumno]);
      }
      await conexion.query('UPDATE matricula SET estado = ? WHERE id_matricula = ?', [nuevoEstado, m.id_matricula]);
      return m.id_matricula;
    });

    res.json(await leerMatricula(pool, idMatricula));
  } catch (err) {
    responderError(res, err, 'Error al cambiar el estado de la matrícula');
  }
});

module.exports = router;
