/**
 * Pruebas de API — HU-011 Reclamos y HU-012 Avisos.
 *
 * Datos (database/seed.sql): reclamo 1 es del Alumno Demo (usuario 107) y está en revisión;
 * el reclamo 3 está resuelto; el 2 es de Ana Torres (usuario 101). Avisos 1-5 del Jefe (usuario 2):
 * el 2 es para docentes y el 4 para alumnos.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let alumno, docente, jefe, registrador;

before(async () => {
  alumno = await H.loginComo('alumno');
  docente = await H.loginComo('docente');
  jefe = await H.loginComo('jefe');
  registrador = await H.loginComo('registrador');
});
after(H.cerrar);

const RECLAMO = { asunto: 'Nota de tareas incompleta', tipo: 'calificacion', prioridad: 'alta', descripcion: 'Entregué las 5 tareas pero figuran 3.' };

describe('HU-011 — Reclamos', () => {
  test('sin sesión -> 401; registrador -> 403 (no participa en reclamos)', async () => {
    assert.equal((await H.anonimo().get('/api/reclamos')).status, 401);
    assert.equal((await registrador.get('/api/reclamos')).status, 403);
    assert.equal((await registrador.post('/api/reclamos').send(RECLAMO)).status, 403);
  });

  test('CA-002: sin asunto o sin descripción no se registra (mensaje de la HU)', async () => {
    const [{ n: antes }] = await H.consultar('SELECT COUNT(*) AS n FROM reclamo');
    for (const cambios of [{ asunto: '' }, { descripcion: '  ' }]) {
      const res = await alumno.post('/api/reclamos').send(Object.assign({}, RECLAMO, cambios));
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Completa los campos obligatorios');
    }
    const [{ n: despues }] = await H.consultar('SELECT COUNT(*) AS n FROM reclamo');
    assert.equal(Number(despues), Number(antes));
  });

  test('tipo o prioridad fuera de la lista -> 400', async () => {
    assert.equal((await alumno.post('/api/reclamos').send(Object.assign({}, RECLAMO, { tipo: 'queja' }))).status, 400);
    assert.equal((await alumno.post('/api/reclamos').send(Object.assign({}, RECLAMO, { prioridad: 'baja' }))).status, 400);
  });

  let idNuevo;
  test('CA-001: estado inicial pendiente; autor y fecha los pone el servidor', async () => {
    const res = await alumno.post('/api/reclamos').send(Object.assign({}, RECLAMO, { id_usuario_autor: 1, estado: 'resuelto' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, 'pendiente');
    assert.equal(res.body.estadoEtiqueta, 'Pendiente');
    assert.equal(res.body.id_usuario_autor, 107); // el de la sesión, no el del cuerpo
    assert.equal(res.body.autor, 'Alumno Demo');
    assert.match(res.body.fecha_registro, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    idNuevo = res.body.id_reclamo;
  });

  test('cada autor ve solo sus reclamos; el jefe ve todos', async () => {
    const propios = (await alumno.get('/api/reclamos')).body;
    assert.ok(propios.length >= 2);
    assert.ok(propios.every((r) => r.id_usuario_autor === 107));
    const todos = (await jefe.get('/api/reclamos')).body;
    assert.ok(todos.some((r) => r.id_usuario_autor === 101));
  });

  test('el docente también puede registrar reclamos (los suyos)', async () => {
    const res = await docente.post('/api/reclamos').send(Object.assign({}, RECLAMO, { tipo: 'administrativo' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.rol_autor, 'docente');
  });

  test('CA-003: solo el jefe avanza el estado (alumno y docente -> 403)', async () => {
    assert.equal((await alumno.patch('/api/reclamos/' + idNuevo + '/estado')).status, 403);
    assert.equal((await docente.patch('/api/reclamos/' + idNuevo + '/estado')).status, 403);
  });

  test('CA-003: Pendiente -> En revisión -> Resuelto, y ahí se detiene (409)', async () => {
    const r1 = await jefe.patch('/api/reclamos/' + idNuevo + '/estado');
    assert.equal(r1.status, 200);
    assert.equal(r1.body.estadoEtiqueta, 'En revisión');
    const r2 = await jefe.patch('/api/reclamos/' + idNuevo + '/estado');
    assert.equal(r2.body.estado, 'resuelto');
    assert.equal((await jefe.patch('/api/reclamos/' + idNuevo + '/estado')).status, 409);
  });

  test('CA-003: el filtro por estado refleja el cambio', async () => {
    const resueltos = (await alumno.get('/api/reclamos').query({ estado: 'resuelto' })).body;
    assert.ok(resueltos.some((r) => r.id_reclamo === idNuevo));
    assert.ok(resueltos.every((r) => r.estado === 'resuelto'));
  });

  test('reclamo inexistente -> 404; id inválido -> 400', async () => {
    assert.equal((await jefe.patch('/api/reclamos/999999/estado')).status, 404);
    assert.equal((await jefe.patch('/api/reclamos/abc/estado')).status, 400);
  });
});

describe('HU-012 — Avisos', () => {
  test('sin sesión -> 401', async () => {
    assert.equal((await H.anonimo().get('/api/avisos')).status, 401);
  });

  test('CA-002: alumno, docente y registrador consultan pero no publican (403)', async () => {
    for (const agente of [alumno, docente, registrador]) {
      assert.equal((await agente.get('/api/avisos')).status, 200);
      assert.equal((await agente.post('/api/avisos').send({ titulo: 'x', contenido: 'y' })).status, 403);
    }
  });

  test('CA-001: cada rol ve los avisos dirigidos a él', async () => {
    const delAlumno = (await alumno.get('/api/avisos')).body.map((a) => a.id_aviso);
    const delDocente = (await docente.get('/api/avisos')).body.map((a) => a.id_aviso);
    assert.ok(delAlumno.includes(4) && !delAlumno.includes(2));
    assert.ok(delDocente.includes(2) && !delDocente.includes(4));
    assert.equal((await jefe.get('/api/avisos')).body.length, 5);
  });

  test('datos inválidos -> 400 y no se publica', async () => {
    for (const cuerpo of [{ titulo: '', contenido: 'y' }, { titulo: 'x', contenido: '' }, { titulo: 'x', contenido: 'y', destinatarios: 'apoderados' }]) {
      assert.equal((await jefe.post('/api/avisos').send(cuerpo)).status, 400);
    }
    assert.equal((await jefe.get('/api/avisos')).body.length, 5);
  });

  test('CA-001: el jefe publica con fecha del servidor y aparece primero en el listado', async () => {
    const res = await jefe.post('/api/avisos').send({ titulo: 'Feria de ciencias', contenido: 'El viernes en el patio.', destinatarios: 'alumnos' });
    assert.equal(res.status, 201);
    assert.equal(res.body.autor, 'Jefe Académico');
    const lista = (await alumno.get('/api/avisos')).body;
    assert.equal(lista[0].id_aviso, res.body.id_aviso);
    assert.ok(!(await docente.get('/api/avisos')).body.some((a) => a.id_aviso === res.body.id_aviso));
  });

  test('la base sigue íntegra: todo aviso lo publicó un Jefe Académico (control 11)', async () => {
    const [fila] = await H.consultar(
      "SELECT COUNT(*) AS n FROM aviso a JOIN usuario u ON u.id_usuario = a.id_usuario_autor WHERE u.rol <> 'jefe_academico'"
    );
    assert.equal(Number(fila.n), 0);
  });
});
