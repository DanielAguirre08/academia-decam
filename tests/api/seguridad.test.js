/**
 * Pruebas de API — controles transversales: autenticación de entregas, pertenencia a la sección
 * y respuestas de error uniformes (JSON, nunca HTML ni 500 por datos de la petición).
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let ajena;
before(async () => { ajena = await H.crearSeccionSoloDelDocente1(); });
after(H.cerrar);

test('POST entregas sin sesión responde 401', async () => {
  const res = await H.anonimo().post('/api/tareas/2/entregas').send({ id_alumno: 2 });
  assert.equal(res.status, 401);
});

test('POST entregas como alumno responde 403', async () => {
  const alumno = await H.loginComo('alumno');
  const res = await alumno.post('/api/tareas/2/entregas').send({ id_alumno: 7 });
  assert.equal(res.status, 403);
});

test('POST entregas de un docente que no dicta en la sección responde 403', async () => {
  const rosa = await H.loginComo('docente2');
  const res = await rosa.post('/api/tareas/' + ajena.id_tarea + '/entregas').send({ id_alumno: ajena.id_alumno });
  assert.equal(res.status, 403);
  const filas = await H.consultar('SELECT 1 FROM entrega_tarea WHERE id_tarea = ? AND id_alumno = ?', [ajena.id_tarea, ajena.id_alumno]);
  assert.equal(filas.length, 0, 'no debe quedar ninguna entrega guardada');
});

test('POST entregas del docente de la sección guarda la entrega (201)', async () => {
  const docente = await H.loginComo('docente');
  const res = await docente.post('/api/tareas/' + ajena.id_tarea + '/entregas').send({ id_alumno: ajena.id_alumno });
  assert.equal(res.status, 201);
  assert.equal(res.body.estado, 'entregada');
});

test('JSON mal formado responde 400 en JSON', async () => {
  const docente = await H.loginComo('docente');
  const res = await docente.post('/api/tareas').set('Content-Type', 'application/json').send('{"titulo": ');
  assert.equal(res.status, 400);
  assert.match(res.headers['content-type'], /json/);
});

test('una ruta de API inexistente responde 404 en JSON', async () => {
  const res = await H.anonimo().get('/api/no-existe');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /json/);
});
