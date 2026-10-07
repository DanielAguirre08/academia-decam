// Capa de Datos — altas compartidas por Registro (HU-002) y Matrícula (HU-003).
// Cada función recibe la CONEXIÓN de una transacción ya abierta: quien llama decide cuándo
// confirmar, así un alumno nunca queda creado sin su apoderado o sin su matrícula.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const R = require('../logica-registro');
const { ErrorDeNegocio } = require('../middleware/errores');

// Periodo en que arranca el cuadro de notas de un alumno recién matriculado (HU-005).
const PERIODO_INICIAL = 'Bimestre I';

/**
 * Contraseña inicial aleatoria (10 caracteres sin ambiguos como 0/O o 1/l). Se devuelve UNA vez
 * al registrador para que se la entregue a la persona; en la BD solo queda el hash bcrypt.
 */
function generarContrasenaInicial() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let clave = '';
  for (let i = 0; i < bytes.length; i++) clave += alfabeto[bytes[i] % alfabeto.length];
  return clave;
}

/** Crea la cuenta USUARIO. Devuelve { id_usuario, correo, contrasenaInicial }. */
async function crearUsuario(conexion, { nombreCompleto, correo, rol }) {
  const partes = R.separarNombreCompleto(nombreCompleto);
  const [[existe]] = await conexion.query('SELECT 1 AS si FROM usuario WHERE correo = ?', [correo]);
  if (existe) throw new ErrorDeNegocio(409, 'Ya existe un usuario con el correo ' + correo);

  const contrasenaInicial = generarContrasenaInicial();
  const [res] = await conexion.query(
    'INSERT INTO usuario (nombre, apellido, correo, contrasena_hash, rol) VALUES (?, ?, ?, ?, ?)',
    [partes.nombres, partes.apellidos, correo, await bcrypt.hash(contrasenaInicial, 10), rol]
  );
  return { id_usuario: res.insertId, correo, contrasenaInicial };
}

/**
 * Devuelve el id del apoderado con ese DNI; si no existe, lo crea (para crearlo el teléfono es
 * obligatorio: APODERADO.telefono es NOT NULL). Un apoderado existente no se sobrescribe.
 */
async function buscarOCrearApoderado(conexion, { dni, nombre, telefono, correo, direccion }) {
  const [[existente]] = await conexion.query('SELECT id_apoderado FROM apoderado WHERE dni = ?', [dni]);
  if (existente) return existente.id_apoderado;

  const telefonoNormalizado = R.normalizarTelefono(telefono || '');
  if (!telefonoNormalizado) {
    throw new ErrorDeNegocio(400, 'El apoderado con DNI ' + dni + ' no está registrado: indica su teléfono para registrarlo');
  }
  const [res] = await conexion.query(
    'INSERT INTO apoderado (dni, nombre_completo, telefono, correo, direccion) VALUES (?, ?, ?, ?, ?)',
    [dni, nombre.trim(), telefonoNormalizado, (correo || '').trim() || null, (direccion || '').trim() || null]
  );
  return res.insertId;
}

/** Busca la sección por nivel, grado, letra y año. Devuelve la fila o lanza 400 si no existe. */
async function buscarSeccion(conexion, { nivel, grado, letra, anio }) {
  const [[seccion]] = await conexion.query(
    `SELECT id_seccion, nivel, grado, letra, turno, CONCAT(grado, '-', letra) AS grupo
     FROM seccion WHERE nivel = ? AND grado = ? AND letra = ? AND anio_lectivo = ?`,
    [nivel, Number(grado), letra, Number(anio)]
  );
  if (!seccion) {
    throw new ErrorDeNegocio(400, 'No existe la sección ' + grado + '-' + letra + ' de ' + nivel + ' para el año ' + anio);
  }
  return seccion;
}

/** Crea USUARIO + ALUMNO (sin sección: la sección se asigna al matricular). */
async function crearAlumno(conexion, datos) {
  const [[mismoDni]] = await conexion.query('SELECT 1 AS si FROM alumno WHERE dni = ?', [datos.dni]);
  if (mismoDni) throw new ErrorDeNegocio(409, 'Ya existe un alumno con el DNI ' + datos.dni);

  const idApoderado = await buscarOCrearApoderado(conexion, {
    dni: datos.apoderado_dni, nombre: datos.apoderado_nombre, telefono: datos.apoderado_telefono,
    correo: datos.apoderado_correo, direccion: datos.direccion
  });
  // Sin correo propio, el alumno recibe uno institucional derivado de su DNI (USUARIO.correo es NOT NULL).
  const correo = (datos.correo || '').trim() || 'alumno.' + datos.dni + '@acadecam.edu.pe';
  const cuenta = await crearUsuario(conexion, { nombreCompleto: datos.nombre, correo, rol: 'alumno' });

  const [res] = await conexion.query(
    `INSERT INTO alumno (id_usuario, dni, fecha_nacimiento, sexo, direccion, nivel, id_seccion, id_apoderado)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [cuenta.id_usuario, datos.dni, datos.fecha_nacimiento, datos.sexo, (datos.direccion || '').trim() || null,
      datos.nivel, idApoderado]
  );
  return { id_alumno: res.insertId, cuenta };
}

/**
 * HU-003: matricula al alumno en la sección. Genera el código correlativo (CA-001), deja al alumno
 * activo en esa sección (controles 01-03 de verificar-integridad.sql) y le abre su fila vacía en
 * el cuadro de notas para que el docente lo vea en Calificaciones (HU-005).
 *
 * El correlativo se calcula bloqueando la tabla (SELECT ... FOR UPDATE): dos matrículas
 * simultáneas esperan su turno y nunca reciben el mismo código. UNIQUE(codigo) es la red final.
 */
async function matricular(conexion, { id_alumno, seccion, anio, procedencia, observaciones }) {
  const [[yaTiene]] = await conexion.query(
    'SELECT codigo FROM matricula WHERE id_alumno = ? AND anio_lectivo = ?', [id_alumno, Number(anio)]
  );
  if (yaTiene) throw new ErrorDeNegocio(409, 'El alumno ya tiene matrícula en ' + anio + ' (' + yaTiene.codigo + ')');

  const [codigos] = await conexion.query('SELECT codigo FROM matricula FOR UPDATE');
  const codigo = R.siguienteCodigoMatricula(codigos.map((c) => c.codigo));

  const [res] = await conexion.query(
    `INSERT INTO matricula (codigo, id_alumno, id_seccion, anio_lectivo, fecha_matricula, estado, procedencia, observaciones)
     VALUES (?, ?, ?, ?, CURDATE(), 'activa', ?, ?)`,
    [codigo, id_alumno, seccion.id_seccion, Number(anio), procedencia || 'nuevo', (observaciones || '').trim() || null]
  );
  await conexion.query(
    "UPDATE alumno SET id_seccion = ?, nivel = ?, estado = 'activo' WHERE id_alumno = ?",
    [seccion.id_seccion, seccion.nivel, id_alumno]
  );
  // Si ya tenía su fila (p. ej. una matrícula reactivada) se deja como está; cualquier otro error sí sube.
  await conexion.query(
    `INSERT INTO calificacion (id_alumno, id_seccion, periodo) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id_calificacion = id_calificacion`,
    [id_alumno, seccion.id_seccion, PERIODO_INICIAL]
  );
  return { id_matricula: res.insertId, codigo };
}

module.exports = { crearUsuario, buscarOCrearApoderado, buscarSeccion, crearAlumno, matricular };
