/**
 * Pruebas de API — HU-005 Registro de calificaciones.
 *
 *   CA-001  Al modificar una nota se recalcula el promedio y el estado (Aprobado >= 11.00).
 *   CA-003  Filtros por grupo, estado y nombre.
 *
 * Datos (database/seed.sql): calificación 1 = Ana Torres (6-A): 15, 16, 18, 17 -> 16.50.
 * Calificación 2 = Luis Pérez (6-A): 8, 9, 10, 7 -> 8.50 (Desaprobado).
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let docente, rosa, jefe, alumno, ajena;

before(async () => {
  ajena = await H.crearSeccionSoloDelDocente1();
  docente = await H.loginComo('docente');
  rosa = await H.loginComo('docente2');
  jefe = await H.loginComo('jefe');
  alumno = await H.loginComo('alumno');
});
after(H.cerrar);

const filaDe = async (id) => (await H.consultar('SELECT * FROM calificacion WHERE id_calificacion = ?', [id]))[0];

describe('GET /api/calificaciones', () => {
  test('sin sesión -> 401; alumno -> 403', async () => {
    assert.equal((await H.anonimo().get('/api/calificaciones')).status, 401);
    assert.equal((await alumno.get('/api/calificaciones')).status, 403);
  });

  test('CA-003: filtra por grupo', async () => {
    const res = await docente.get('/api/calificaciones').query({ id_seccion: 1 });
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((c) => c.id_seccion === 1));
  });

  test('CA-003: filtra por estado (Desaprobado = promedio < 11.00)', async () => {
    const res = await docente.get('/api/calificaciones').query({ id_seccion: 1, estado: 'Desaprobado' });
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((c) => c.promedio !== null && Number(c.promedio) < 11));
  });

  test('CA-003: filtra por nombre sin distinguir mayúsculas', async () => {
    const res = await docente.get('/api/calificaciones').query({ busqueda: 'ANA' });
    assert.ok(res.body.some((c) => c.nombreAlumno === 'Ana Torres Medina'));
    assert.ok(res.body.every((c) => c.nombreAlumno.toLowerCase().includes('ana')));
  });

  test('grupo no numérico -> 400', async () => {
    assert.equal((await docente.get('/api/calificaciones').query({ id_seccion: 'abc' })).status, 400);
  });

  test('docente que no dicta en el grupo -> 403; sin filtro, no ve ese grupo', async () => {
    assert.equal((await rosa.get('/api/calificaciones').query({ id_seccion: ajena.id_seccion })).status, 403);
    const todas = await rosa.get('/api/calificaciones');
    assert.equal(todas.status, 200);
    assert.ok(!todas.body.some((c) => c.id_seccion === ajena.id_seccion));
  });

  test('el jefe académico ve todos los grupos', async () => {
    const res = await jefe.get('/api/calificaciones');
    assert.equal(res.status, 200);
    assert.ok(res.body.some((c) => c.id_seccion === ajena.id_seccion));
  });
});

describe('PATCH /api/calificaciones/:id — CA-001', () => {
  test('sin sesión -> 401; alumno y jefe -> 403', async () => {
    const cuerpo = { campo: 'examen1', valor: 20 };
    assert.equal((await H.anonimo().patch('/api/calificaciones/1').send(cuerpo)).status, 401);
    assert.equal((await alumno.patch('/api/calificaciones/1').send(cuerpo)).status, 403);
    assert.equal((await jefe.patch('/api/calificaciones/1').send(cuerpo)).status, 403);
  });

  test('datos inválidos -> 400 y la nota no cambia', async () => {
    const antes = await filaDe(1);
    const casos = [
      ['id no numérico', 'abc', { campo: 'examen1', valor: 15 }],
      ['campo inexistente', 1, { campo: 'promedio', valor: 15 }],
      ['nota 21', 1, { campo: 'examen1', valor: 21 }],
      ['nota negativa', 1, { campo: 'examen1', valor: -1 }],
      ['booleano', 1, { campo: 'examen1', valor: true }],
      ['coma decimal', 1, { campo: 'examen1', valor: '15,5' }],
      ['3 decimales', 1, { campo: 'examen1', valor: 15.555 }]
    ];
    for (const [nombre, id, cuerpo] of casos) {
      const res = await docente.patch('/api/calificaciones/' + id).send(cuerpo);
      assert.equal(res.status, 400, nombre);
    }
    assert.deepEqual(await filaDe(1), antes);
  });

  test('calificación inexistente -> 404 (no 500)', async () => {
    const res = await docente.patch('/api/calificaciones/999999').send({ campo: 'examen1', valor: 15 });
    assert.equal(res.status, 404);
  });

  test('docente que no dicta en el grupo -> 403 y la nota no cambia', async () => {
    const res = await rosa.patch('/api/calificaciones/' + ajena.id_calificacion).send({ campo: 'examen1', valor: 5 });
    assert.equal(res.status, 403);
    assert.equal(Number((await filaDe(ajena.id_calificacion)).examen1), 12);
  });

  test('caso feliz: cambia la nota y persiste el promedio recalculado', async () => {
    // Luis: 8, 9, 10, 7 -> examen1 = 20 -> (20 + 9 + 10 + 7) / 4 = 11.50 -> Aprobado
    const res = await docente.patch('/api/calificaciones/2').send({ campo: 'examen1', valor: 20 });
    assert.equal(res.status, 200);
    assert.equal(res.body.promedio, 11.5);
    assert.equal(res.body.estado, 'Aprobado');
    const fila = await filaDe(2);
    assert.equal(Number(fila.examen1), 20);
    assert.equal(Number(fila.promedio), 11.5);
  });

  test('valor límite: la nota 0 se guarda como 0, no como NULL', async () => {
    const res = await docente.patch('/api/calificaciones/2').send({ campo: 'proyecto', valor: 0 });
    assert.equal(res.status, 200);
    const fila = await filaDe(2);
    assert.equal(Number(fila.proyecto), 0);
    assert.equal(Number(fila.promedio), 9.75); // (20 + 9 + 10 + 0) / 4
    assert.equal(res.body.estado, 'Desaprobado');
  });

  test('borrar una nota (null) la deja sin registrar y el promedio la ignora', async () => {
    const res = await docente.patch('/api/calificaciones/2').send({ campo: 'proyecto', valor: null });
    assert.equal(res.status, 200);
    const fila = await filaDe(2);
    assert.equal(fila.proyecto, null);
    assert.equal(Number(fila.promedio), 13); // (20 + 9 + 10) / 3
  });

  test('la base sigue íntegra: todo promedio coincide con sus notas (control 04)', async () => {
    const [fila] = await H.consultar(`
      SELECT COUNT(*) AS n FROM calificacion c
      WHERE NOT (c.promedio <=> ROUND(
        (COALESCE(c.examen1,0) + COALESCE(c.examen2,0) + COALESCE(c.tareas,0) + COALESCE(c.proyecto,0))
        / NULLIF((c.examen1 IS NOT NULL) + (c.examen2 IS NOT NULL) + (c.tareas IS NOT NULL) + (c.proyecto IS NOT NULL), 0), 2))`);
    assert.equal(Number(fila.n), 0);
  });
});
