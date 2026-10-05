/**
 * Utilidades compartidas por las pruebas de API (node:test + supertest).
 *
 * IMPORTANTE: este archivo debe ser el PRIMER require de cada prueba de API. Fija DB_NAME a la
 * base de pruebas antes de que config/db.js cree el pool, así las pruebas nunca escriben en la
 * base de desarrollo (dotenv no pisa una variable que ya existe).
 * La base se recrea con `npm run db:reset:test` (lo hace solo `npm run test:api`).
 */
process.env.DB_NAME = process.env.DB_NAME_TEST || 'academia_decam_test';

const request = require('supertest');
const app = require('../../server');
const pool = require('../../config/db');

// Cuentas de database/seed.sql. Solo existen en la base de pruebas/desarrollo.
const CUENTAS = {
  docente:        { correo: 'prof@acadecam.edu.pe',        contrasena: 'decam2024',  rol: 'docente' },        // id_docente 1
  docente2:       { correo: 'rosa.quispe@acadecam.edu.pe', contrasena: 'decam2024',  rol: 'docente' },        // id_docente 2
  alumno:         { correo: 'alumno@acadecam.edu.pe',      contrasena: 'alumno2024', rol: 'alumno' },         // id_alumno 7, sección 1
  jefe:           { correo: 'jefe@acadecam.edu.pe',        contrasena: 'jefe2024',   rol: 'jefe_academico' },
  registrador:    { correo: 'registrador@acadecam.edu.pe', contrasena: 'reg2024',    rol: 'registrador' }
};

/** Agente HTTP SIN sesión (para probar el 401). */
function anonimo() {
  return request(app);
}

/** Agente HTTP con la cookie de sesión de la cuenta indicada (clave de CUENTAS). */
async function loginComo(clave) {
  const cuenta = CUENTAS[clave];
  if (!cuenta) throw new Error('Cuenta de prueba desconocida: ' + clave);
  const agente = request.agent(app);
  const res = await agente.post('/api/auth/login').send(cuenta);
  if (res.status !== 200) {
    throw new Error('No se pudo iniciar sesión como ' + clave + ': ' + res.status + ' ' + JSON.stringify(res.body));
  }
  return agente;
}

/** Consulta directa a la base de pruebas, para comprobar lo que la API dejó guardado. */
async function consultar(sql, params) {
  const [filas] = await pool.query(sql, params);
  return filas;
}

/** Cierra el pool al terminar el archivo de pruebas (si no, node no termina). */
function cerrar() {
  return pool.end();
}

/**
 * Fixture: sección 4-C (id 90) cuyo único docente es el tutor (docente 1) y SIN horario, con un
 * alumno activo (id 90), una tarea (id 90) y su calificación (id 90). Sirve para probar que el
 * docente 2 (Rosa), que no
 * dicta ahí, recibe 403. Es idempotente: se puede llamar desde varios archivos de prueba.
 */
async function crearSeccionSoloDelDocente1() {
  await pool.query(`INSERT IGNORE INTO seccion (id_seccion, nivel, grado, letra, turno, aula, id_docente_tutor, anio_lectivo)
                    VALUES (90, 'Primaria', 4, 'C', 'Tarde', 'Aula 90', 1, 2026)`);
  await pool.query(`INSERT IGNORE INTO usuario (id_usuario, nombre, apellido, correo, contrasena_hash, rol)
                    VALUES (190, 'Prueba', 'Seccion Noventa', 'prueba.90@acadecam.edu.pe', 'sin-acceso', 'alumno')`);
  await pool.query(`INSERT IGNORE INTO alumno (id_alumno, id_usuario, dni, fecha_nacimiento, sexo, nivel, id_seccion, id_apoderado, estado)
                    VALUES (90, 190, '79000090', '2016-04-04', 'F', 'Primaria', 90, 1, 'activo')`);
  await pool.query(`INSERT IGNORE INTO tarea (id_tarea, titulo, tipo, id_seccion, id_docente, fecha_asignacion, fecha_entrega)
                    VALUES (90, 'Tarea de la sección 90', 'Tarea', 90, 1, CURDATE(), CURDATE() + INTERVAL 7 DAY)`);
  await pool.query(`INSERT IGNORE INTO calificacion (id_calificacion, id_alumno, id_seccion, examen1, examen2, tareas, proyecto, promedio, periodo)
                    VALUES (90, 90, 90, 12.00, NULL, NULL, NULL, 12.00, 'Bimestre I')`);
  return { id_seccion: 90, id_alumno: 90, id_tarea: 90, id_calificacion: 90 };
}

/** Fecha local en formato YYYY-MM-DD desplazada `dias` respecto de hoy. */
function fechaRelativa(dias) {
  const d = new Date();
  d.setDate(d.getDate() + (dias || 0));
  const dos = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

module.exports = { app, CUENTAS, anonimo, loginComo, consultar, cerrar, fechaRelativa, crearSeccionSoloDelDocente1 };
