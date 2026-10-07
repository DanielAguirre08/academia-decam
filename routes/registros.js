const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const R = require('../logica-registro'); // la MISMA capa de lógica pura que usa el navegador
const { requiereRol } = require('../middleware/auth');
const { responderError, ErrorDeNegocio } = require('../middleware/errores');
const { enTransaccion } = require('../datos/transaccion');
const D = require('../datos/registro');

// Listado único de personas registradas (HU-002 CA-001): alumnos y docentes con su cuenta, y
// apoderados. La fecha de creación sale de USUARIO.fecha_registro o APODERADO.fecha_registro.
const SQL_REGISTROS = `
  SELECT 'alumno' AS tipo, a.id_alumno AS id, CONCAT(u.nombre, ' ', u.apellido) AS nombre, a.dni, u.correo,
         NULL AS telefono, a.direccion, DATE_FORMAT(u.fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_registro,
         DATE_FORMAT(a.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento, a.sexo, a.nivel,
         CONCAT(s.grado, '-', s.letra) AS seccion, NULL AS especialidad,
         ap.nombre_completo AS apoderado_nombre, ap.telefono AS apoderado_telefono
  FROM alumno a
  JOIN usuario u ON u.id_usuario = a.id_usuario
  JOIN apoderado ap ON ap.id_apoderado = a.id_apoderado
  LEFT JOIN seccion s ON s.id_seccion = a.id_seccion
  UNION ALL
  SELECT 'docente', d.id_docente, CONCAT(u.nombre, ' ', u.apellido), d.dni, u.correo,
         d.telefono, NULL, DATE_FORMAT(u.fecha_registro, '%Y-%m-%d %H:%i:%s'),
         NULL, NULL, NULL, NULL, d.especialidad, NULL, NULL
  FROM docente d JOIN usuario u ON u.id_usuario = d.id_usuario
  UNION ALL
  SELECT 'apoderado', ap.id_apoderado, ap.nombre_completo, ap.dni, ap.correo,
         ap.telefono, ap.direccion, DATE_FORMAT(ap.fecha_registro, '%Y-%m-%d %H:%i:%s'),
         NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM apoderado ap`;

/** Completa la fila con la fecha en formato peruano (HU-002 CA-001). */
function conFechaPeruana(fila) {
  return Object.assign({}, fila, { fecha: R.fechaPeruana(fila.fecha_registro) });
}

async function leerRegistro(conexion, tipo, id) {
  const [[fila]] = await conexion.query(
    'SELECT * FROM (' + SQL_REGISTROS + ') r WHERE r.tipo = ? AND r.id = ?', [tipo, id]
  );
  return conFechaPeruana(fila);
}

// GET /api/registros?tipo=all|alumno|docente|apoderado&busqueda=
// HU-002 CA-001: el listado con su contador. El filtro lo aplica la capa de Lógica.
router.get('/', requiereRol('registrador'), async (req, res) => {
  try {
    const [filas] = await pool.query(SQL_REGISTROS + ' ORDER BY fecha_registro DESC, nombre');
    const filtradas = R.filtrarRegistros(filas, { tipo: req.query.tipo, busqueda: req.query.busqueda });
    res.json(filtradas.map(conFechaPeruana));
  } catch (err) {
    responderError(res, err, 'Error al obtener los registros');
  }
});

// POST /api/registros  { tipo, nombre, dni, correo, telefono, direccion, ... }
// HU-002: registra un alumno, un docente o un apoderado (CA-001), con los campos de alumno solo
// cuando corresponde (CA-002) y sin nombre no registra nada (CA-003). Si el alumno trae grado y
// sección, en la misma transacción queda matriculado en el año en curso (HU-003).
// Alumnos y docentes reciben una contraseña inicial que se devuelve UNA sola vez.
router.post('/', requiereRol('registrador'), async (req, res) => {
  try {
    const datos = req.body || {};
    const hoy = new Date();
    const revision = R.revisarRegistro(datos, hoy);
    if (!revision.valido) return res.status(400).json({ error: revision.errores[0], errores: revision.errores });

    const resultado = await enTransaccion(async (conexion) => {
      if (datos.tipo === 'alumno') {
        // La sección se valida ANTES de crear nada: si no existe, no queda un alumno a medias.
        const seccion = datos.grado
          ? await D.buscarSeccion(conexion, { nivel: datos.nivel, grado: datos.grado, letra: datos.seccion, anio: hoy.getFullYear() })
          : null;
        const alumno = await D.crearAlumno(conexion, datos);
        const matricula = seccion
          ? await D.matricular(conexion, { id_alumno: alumno.id_alumno, seccion, anio: hoy.getFullYear() })
          : null;
        return { tipo: 'alumno', id: alumno.id_alumno, cuenta: alumno.cuenta, matricula };
      }

      if (datos.tipo === 'docente') {
        const [[mismoDni]] = await conexion.query('SELECT 1 AS si FROM docente WHERE dni = ?', [datos.dni]);
        if (mismoDni) throw new ErrorDeNegocio(409, 'Ya existe un docente con el DNI ' + datos.dni);
        const cuenta = await D.crearUsuario(conexion, { nombreCompleto: datos.nombre, correo: datos.correo.trim(), rol: 'docente' });
        const [r] = await conexion.query(
          'INSERT INTO docente (id_usuario, dni, especialidad, telefono) VALUES (?, ?, ?, ?)',
          [cuenta.id_usuario, datos.dni, (datos.especialidad || '').trim() || null, R.normalizarTelefono(datos.telefono || '')]
        );
        return { tipo: 'docente', id: r.insertId, cuenta };
      }

      // apoderado
      const [[mismoDni]] = await conexion.query('SELECT 1 AS si FROM apoderado WHERE dni = ?', [datos.dni]);
      if (mismoDni) throw new ErrorDeNegocio(409, 'Ya existe un apoderado con el DNI ' + datos.dni);
      const id = await D.buscarOCrearApoderado(conexion, {
        dni: datos.dni, nombre: datos.nombre, telefono: datos.telefono, correo: datos.correo, direccion: datos.direccion
      });
      return { tipo: 'apoderado', id };
    });

    const registro = await leerRegistro(pool, resultado.tipo, resultado.id);
    if (resultado.cuenta) registro.contrasenaInicial = resultado.cuenta.contrasenaInicial;
    if (resultado.matricula) registro.codigoMatricula = resultado.matricula.codigo;
    res.status(201).json(registro);
  } catch (err) {
    responderError(res, err, 'Error al guardar el registro');
  }
});

module.exports = router;
