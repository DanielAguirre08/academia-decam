/**
 * Pruebas de API — Inicio (GET /api/resumen) y perfil (GET /api/perfil) de cada rol.
 * Cada cifra se contrasta con una consulta directa a la base de pruebas.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

after(H.cerrar);

const n = async (sql, params) => Number((await H.consultar(sql, params))[0].n);

test('sin sesión -> 401', async () => {
  assert.equal((await H.anonimo().get('/api/resumen')).status, 401);
  assert.equal((await H.anonimo().get('/api/perfil')).status, 401);
});

test('docente: tarjetas sin "?" y coherentes con la BD', async () => {
  const docente = await H.loginComo('docente');
  const r = (await docente.get('/api/resumen')).body;
  assert.equal(r.rol, 'docente');
  // El docente 1 dicta en todas las secciones del seed (y es tutor de las que creen otras pruebas).
  assert.equal(r.alumnosActivos, await n(
    `SELECT COUNT(*) AS n FROM alumno a WHERE a.estado = 'activo' AND a.id_seccion IN (
       SELECT id_seccion FROM horario WHERE id_docente = 1 UNION SELECT id_seccion FROM seccion WHERE id_docente_tutor = 1)`));
  assert.ok(r.asistenciaPromedio >= 0 && r.asistenciaPromedio <= 100);
  assert.ok(Number.isInteger(r.tareasAtrasadas));
  assert.equal(r.alumnosEnRiesgo, await n(
    "SELECT COUNT(*) AS n FROM calificacion c JOIN alumno a ON a.id_alumno = c.id_alumno WHERE a.estado = 'activo' AND c.promedio < 11"));
  assert.ok(Array.isArray(r.clasesHoy) && Array.isArray(r.ultimasEntregas));
  assert.ok(r.ultimasEntregas.length <= 5);
});

test('alumno: promedio, tareas pendientes, % asistencia y puesto en el grupo', async () => {
  const alumno = await H.loginComo('alumno');
  const r = (await alumno.get('/api/resumen')).body;
  assert.equal(r.rol, 'alumno');
  assert.equal(r.promedioGeneral, 14.5); // un solo periodo: 14, 13, 15, 16
  assert.ok(r.lugarEnGrupo.puesto >= 1 && r.lugarEnGrupo.puesto <= r.lugarEnGrupo.total);
  assert.ok(r.asistencia >= 0 && r.asistencia <= 100);
  assert.ok(Number.isInteger(r.tareasPendientes));
  assert.ok(r.proximasTareas.every((t) => t.estado === 'pendiente'));
  assert.ok(r.misCursos.length >= 4); // las 4 especialidades del horario del 6-A
});

test('jefe y registrador: contadores administrativos', async () => {
  const jefe = await H.loginComo('jefe');
  const rj = (await jefe.get('/api/resumen')).body;
  assert.equal(rj.reclamosPendientes, await n("SELECT COUNT(*) AS n FROM reclamo WHERE estado = 'pendiente'"));
  assert.equal(rj.alumnosActivos, await n("SELECT COUNT(*) AS n FROM alumno WHERE estado = 'activo'"));
  assert.ok(rj.reclamosPorAtender.length <= 5);

  const registrador = await H.loginComo('registrador');
  const rr = (await registrador.get('/api/resumen')).body;
  assert.equal(rr.matriculasInactivas, await n(
    "SELECT COUNT(*) AS n FROM matricula WHERE estado = 'inactiva' AND anio_lectivo = YEAR(CURDATE())"));
  assert.ok(rr.ultimasMatriculas.length <= 5);
});

test('perfil del docente: especialidad, DNI y grupos reales', async () => {
  const docente = await H.loginComo('docente');
  const p = (await docente.get('/api/perfil')).body;
  assert.equal(p.especialidad, 'Matemática');
  assert.equal(p.dni, '10000001');
  assert.ok(p.grupos.includes('6-A'));
  assert.equal(p.contrasena_hash, undefined);
});

test('perfil del alumno: matrícula, grupo, tutor y ciclo', async () => {
  const alumno = await H.loginComo('alumno');
  const p = (await alumno.get('/api/perfil')).body;
  assert.equal(p.matricula, 'MAT-0007');
  assert.equal(p.grupo, '6-A');
  assert.equal(p.tutor, 'Profesor Demo');
  assert.equal(p.ciclo, 2026);
});
