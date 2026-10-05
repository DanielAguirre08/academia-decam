/**
 * Pruebas de API — HU-010 Gestión de tareas.
 *
 *   CA-001  Publicar una tarea con título, grupo, fecha límite y tipo.
 *   CA-002  El estado (pendiente/atrasada/entregada) se deriva de la fecha y de las entregas.
 *   CA-003  Marcar las entregas por alumno.
 *
 * Datos (database/seed.sql): tarea 1 (6-A) vencida; tarea 3 (6-A) vigente y sin entregas.
 * 6-A tiene 5 alumnos activos: 1, 2, 3, 4 y 7. El alumno 5 es del 5-A; el 9 está retirado.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const HOY = H.fechaRelativa(0);
const AYER = H.fechaRelativa(-1);
const EN_UNA_SEMANA = H.fechaRelativa(7);
const tarea = (cambios) => Object.assign({ titulo: 'Práctica nueva', id_seccion: 1, fecha_entrega: EN_UNA_SEMANA, tipo: 'Tarea' }, cambios);

let docente, rosa, jefe, alumno, ajena;

before(async () => {
  ajena = await H.crearSeccionSoloDelDocente1();
  docente = await H.loginComo('docente');
  rosa = await H.loginComo('docente2');
  jefe = await H.loginComo('jefe');
  alumno = await H.loginComo('alumno');
});
after(H.cerrar);

describe('GET /api/tareas — CA-002', () => {
  test('sin sesión -> 401; alumno -> 403', async () => {
    assert.equal((await H.anonimo().get('/api/tareas')).status, 401);
    assert.equal((await alumno.get('/api/tareas')).status, 403);
  });

  test('cada tarea trae materia (especialidad del autor), tipo, grupo y estado derivado', async () => {
    const res = await docente.get('/api/tareas').query({ id_seccion: 1 });
    assert.equal(res.status, 200);
    const t1 = res.body.find((t) => t.id_tarea === 1);
    assert.equal(t1.materia, 'Matemática');
    assert.equal(t1.tipo, 'Tarea');
    assert.equal(t1.grupo, '6-A');
    assert.equal(t1.estado, 'atrasada'); // venció hace 16 días y no la entregó todo el grupo
    assert.equal(res.body.find((t) => t.id_tarea === 3).estado, 'pendiente');
  });

  test('CA-002: filtra por estado', async () => {
    const res = await docente.get('/api/tareas').query({ estado: 'atrasada' });
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((t) => t.estado === 'atrasada'));
  });

  test('grupo inválido -> 400; grupo ajeno -> 403; el jefe ve todo', async () => {
    assert.equal((await docente.get('/api/tareas').query({ id_seccion: 'x' })).status, 400);
    assert.equal((await rosa.get('/api/tareas').query({ id_seccion: ajena.id_seccion })).status, 403);
    assert.ok(!(await rosa.get('/api/tareas')).body.some((t) => t.id_seccion === ajena.id_seccion));
    assert.ok((await jefe.get('/api/tareas')).body.some((t) => t.id_seccion === ajena.id_seccion));
  });
});

describe('POST /api/tareas — CA-001', () => {
  test('sin sesión -> 401; alumno y jefe -> 403', async () => {
    assert.equal((await H.anonimo().post('/api/tareas').send(tarea())).status, 401);
    assert.equal((await alumno.post('/api/tareas').send(tarea())).status, 403);
    assert.equal((await jefe.post('/api/tareas').send(tarea())).status, 403);
  });

  test('datos inválidos -> 400 con el detalle, sin insertar nada', async () => {
    const [{ n: antes }] = await H.consultar('SELECT COUNT(*) AS n FROM tarea');
    const casos = [
      ['sin título', { titulo: '' }],
      ['título de 101 caracteres', { titulo: 'x'.repeat(101) }],
      ['descripción de 301 caracteres', { descripcion: 'x'.repeat(301) }],
      ['sin grupo', { id_seccion: undefined }],
      ['grupo no numérico', { id_seccion: '6-A' }],
      ['fecha límite ayer', { fecha_entrega: AYER }],
      ['fecha inexistente', { fecha_entrega: '2026-11-31' }],
      ['tipo inválido', { tipo: 'Laboratorio' }]
    ];
    for (const [nombre, cambios] of casos) {
      const res = await docente.post('/api/tareas').send(tarea(cambios));
      assert.equal(res.status, 400, nombre);
      assert.ok(res.body.errores.length > 0, nombre);
    }
    const [{ n: despues }] = await H.consultar('SELECT COUNT(*) AS n FROM tarea');
    assert.equal(Number(despues), Number(antes));
  });

  test('grupo inexistente -> 404; grupo donde no dicta -> 403', async () => {
    assert.equal((await docente.post('/api/tareas').send(tarea({ id_seccion: 9999 }))).status, 404);
    assert.equal((await rosa.post('/api/tareas').send(tarea({ id_seccion: ajena.id_seccion }))).status, 403);
  });

  test('caso feliz: inserta con el docente de la sesión aunque el cuerpo diga otro', async () => {
    const res = await docente.post('/api/tareas').send(tarea({ titulo: '  Ficha de lectura  ', tipo: 'Proyecto', id_docente: 4 }));
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, 'pendiente');
    const [fila] = await H.consultar(
      "SELECT titulo, tipo, id_docente, DATE_FORMAT(fecha_asignacion, '%Y-%m-%d') AS asignada FROM tarea WHERE id_tarea = ?",
      [res.body.id_tarea]
    );
    assert.deepEqual(fila, { titulo: 'Ficha de lectura', tipo: 'Proyecto', id_docente: 1, asignada: HOY });
  });

  test('valor límite: fecha límite = hoy es válida; sin tipo usa "Tarea"', async () => {
    const res = await docente.post('/api/tareas').send(tarea({ fecha_entrega: HOY, tipo: undefined }));
    assert.equal(res.status, 201);
    assert.equal(res.body.tipo, 'Tarea');
  });
});

describe('Entregas por alumno — CA-003', () => {
  const entregar = (agente, idTarea, idAlumno) => agente.post('/api/tareas/' + idTarea + '/entregas').send({ id_alumno: idAlumno });

  test('GET lista a los 5 alumnos activos del grupo con su estado', async () => {
    const res = await docente.get('/api/tareas/1/entregas');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((f) => f.id_alumno).sort((a, b) => a - b), [1, 2, 3, 4, 7]);
    const porId = Object.fromEntries(res.body.map((f) => [f.id_alumno, f]));
    assert.equal(porId[1].estado, 'entregada');
    assert.ok(porId[1].fecha_entrega_real);
    assert.equal(porId[4].estado, 'atrasada'); // tarea vencida sin entrega
  });

  test('GET: alumno 403; tarea inexistente 404; id inválido 400; grupo ajeno 403', async () => {
    assert.equal((await alumno.get('/api/tareas/1/entregas')).status, 403);
    assert.equal((await docente.get('/api/tareas/999999/entregas')).status, 404);
    assert.equal((await docente.get('/api/tareas/abc/entregas')).status, 400);
    assert.equal((await rosa.get('/api/tareas/' + ajena.id_tarea + '/entregas')).status, 403);
  });

  test('POST: datos inválidos -> 400/404 y no se guarda nada', async () => {
    assert.equal((await entregar(docente, 3, undefined)).status, 400);
    assert.equal((await entregar(docente, 3, 'x')).status, 400);
    assert.equal((await entregar(docente, 3, 999999)).status, 404);
    assert.equal((await entregar(docente, 3, 5)).status, 400);       // alumno de otro grupo
    assert.equal((await entregar(docente, 999999, 1)).status, 404);  // tarea inexistente
    const filas = await H.consultar('SELECT 1 FROM entrega_tarea WHERE id_tarea = 3');
    assert.equal(filas.length, 0);
  });

  test('POST: el alumno retirado no puede entregar (tarea 5 del 5-A, alumno 9)', async () => {
    assert.equal((await entregar(docente, 5, 9)).status, 400);
  });

  test('marcar a los 5 alumnos cambia la tarea a "entregada" en la lista', async () => {
    for (const id of [1, 2, 3, 4, 7]) {
      assert.equal((await entregar(docente, 3, id)).status, 201);
    }
    assert.equal((await entregar(docente, 3, 1)).status, 201, 'reentregar actualiza, no duplica');
    const filas = await H.consultar('SELECT COUNT(*) AS n FROM entrega_tarea WHERE id_tarea = 3');
    assert.equal(Number(filas[0].n), 5);

    const lista = await docente.get('/api/tareas').query({ id_seccion: 1 });
    const t3 = lista.body.find((t) => t.id_tarea === 3);
    assert.equal(t3.entregas, 5);
    assert.equal(t3.estado, 'entregada');
  });

  test('DELETE desmarca: la tarea vuelve a "pendiente"; desmarcar dos veces -> 404', async () => {
    const res = await docente.delete('/api/tareas/3/entregas/7');
    assert.equal(res.status, 200);
    assert.equal(res.body.estado, 'pendiente');
    assert.equal((await docente.delete('/api/tareas/3/entregas/7')).status, 404);
    const t3 = (await docente.get('/api/tareas').query({ id_seccion: 1 })).body.find((t) => t.id_tarea === 3);
    assert.equal(t3.estado, 'pendiente');
  });

  test('DELETE: alumno 403; grupo ajeno 403', async () => {
    assert.equal((await alumno.delete('/api/tareas/3/entregas/1')).status, 403);
    assert.equal((await rosa.delete('/api/tareas/' + ajena.id_tarea + '/entregas/' + ajena.id_alumno)).status, 403);
  });

  test('la base sigue íntegra: ninguna entrega de un alumno ajeno a la sección de la tarea (control 07)', async () => {
    const [fila] = await H.consultar(
      `SELECT COUNT(*) AS n FROM entrega_tarea e
       JOIN tarea t ON t.id_tarea = e.id_tarea JOIN alumno a ON a.id_alumno = e.id_alumno
       WHERE a.id_seccion IS NULL OR a.id_seccion <> t.id_seccion`
    );
    assert.equal(Number(fila.n), 0);
  });
});
