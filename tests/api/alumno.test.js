/**
 * Pruebas de API — Alumno: HU-007 Mis calificaciones, HU-009 Mi asistencia, HU-010 CA-003 Mis tareas.
 *
 * Datos (database/seed.sql): "Alumno Demo" = id_alumno 7, sección 1 (6-A), calificación 5:
 * 14, 13, 15, 16 -> 14.50 Aprobado. La tarea 4 es del 5-A (otra sección). Mateo Castro
 * (id_alumno 9) está retirado.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let alumno, docente;

before(async () => {
  alumno = await H.loginComo('alumno');
  docente = await H.loginComo('docente');
});
after(H.cerrar);

describe('Permisos de /api/mi', () => {
  test('sin sesión -> 401; docente, jefe y registrador -> 403', async () => {
    assert.equal((await H.anonimo().get('/api/mi/calificaciones')).status, 401);
    for (const clave of ['docente', 'jefe', 'registrador']) {
      const agente = await H.loginComo(clave);
      for (const ruta of ['/api/mi/calificaciones', '/api/mi/asistencia', '/api/mi/tareas']) {
        assert.equal((await agente.get(ruta)).status, 403, clave + ' ' + ruta);
      }
    }
  });
});

describe('HU-007 — Mis calificaciones', () => {
  test('CA-001: solo sus notas, con promedio y estado oficiales', async () => {
    const res = await alumno.get('/api/mi/calificaciones');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    const [c] = res.body;
    assert.equal(c.id_calificacion, 5);
    assert.equal(c.promedio, 14.5);
    assert.equal(c.estado, 'Aprobado');
    assert.equal(c.grupo, '6-A');
    assert.equal(c.tutor, 'Profesor Demo');
  });

  test('CA-001: no expone otras notas aunque se pida otro alumno por parámetro (IDOR)', async () => {
    const res = await alumno.get('/api/mi/calificaciones').query({ id_alumno: 1, id_seccion: 2 });
    assert.deepEqual(res.body.map((c) => c.id_calificacion), [5]);
  });

  test('CA-002: el alumno no puede editar notas ni ver el cuadro del grupo', async () => {
    assert.equal((await alumno.patch('/api/calificaciones/5').send({ campo: 'examen1', valor: 20 })).status, 403);
    assert.equal((await alumno.get('/api/calificaciones')).status, 403);
  });
});

describe('HU-009 — Mi asistencia', () => {
  test('devuelve solo sus registros, sin días futuros, y los indicadores coinciden con la BD', async () => {
    const res = await alumno.get('/api/mi/asistencia');
    assert.equal(res.status, 200);
    const [bd] = await H.consultar(
      `SELECT COUNT(*) AS dias, SUM(estado = 'ausente') AS faltas, SUM(estado = 'tardanza') AS tardanzas,
              SUM(estado = 'presente') AS presentes
       FROM asistencia WHERE id_alumno = 7`
    );
    assert.equal(res.body.registros.length, Number(bd.dias));
    assert.ok(res.body.registros.every((r) => r.fecha <= H.fechaRelativa(0)));
    const r = res.body.resumen;
    assert.equal(r.diasRegistrados, Number(bd.dias));
    assert.equal(r.faltas, Number(bd.faltas));
    assert.equal(r.tardanzas, Number(bd.tardanzas));
    assert.equal(r.porcentaje, Math.round(((Number(bd.presentes) + Number(bd.tardanzas)) / Number(bd.dias)) * 100));
  });
});

describe('HU-010 CA-003 — Mis tareas', () => {
  test('solo las tareas de su sección, con el estado de SU entrega', async () => {
    const res = await alumno.get('/api/mi/tareas');
    assert.equal(res.status, 200);
    const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM tarea WHERE id_seccion = 1');
    assert.equal(res.body.length, Number(n));
    assert.ok(!res.body.some((t) => t.id_tarea === 4), 'la tarea 4 es de otra sección');
    const t1 = res.body.find((t) => t.id_tarea === 1);
    assert.equal(t1.entregue, true);       // entrega 3 del seed (alumno 7)
    assert.equal(t1.estado, 'entregada');
  });

  test('filtra por estado', async () => {
    const res = await alumno.get('/api/mi/tareas').query({ estado: 'pendiente' });
    assert.ok(res.body.every((t) => t.estado === 'pendiente'));
  });

  test('marca y desmarca SU entrega; la segunda vez que desmarca -> 404', async () => {
    const marcar = await alumno.post('/api/mi/tareas/3/entrega');
    assert.equal(marcar.status, 201);
    const [fila] = await H.consultar('SELECT estado FROM entrega_tarea WHERE id_tarea = 3 AND id_alumno = 7');
    assert.equal(fila.estado, 'entregada');
    assert.equal((await alumno.get('/api/mi/tareas')).body.find((t) => t.id_tarea === 3).estado, 'entregada');

    const desmarcar = await alumno.delete('/api/mi/tareas/3/entrega');
    assert.equal(desmarcar.status, 200);
    assert.equal(desmarcar.body.estado, 'pendiente');
    assert.equal((await alumno.delete('/api/mi/tareas/3/entrega')).status, 404);
  });

  test('no puede marcar tareas de otra sección ni inexistentes (404) ni con id inválido (400)', async () => {
    assert.equal((await alumno.post('/api/mi/tareas/4/entrega')).status, 404);
    assert.equal((await alumno.post('/api/mi/tareas/999999/entrega')).status, 404);
    assert.equal((await alumno.post('/api/mi/tareas/abc/entrega')).status, 400);
    const filas = await H.consultar('SELECT 1 FROM entrega_tarea WHERE id_tarea = 4 AND id_alumno = 7');
    assert.equal(filas.length, 0);
  });

  test('no puede crear tareas ni marcar entregas de otros alumnos', async () => {
    assert.equal((await alumno.post('/api/tareas').send({ titulo: 'x', id_seccion: 1, fecha_entrega: H.fechaRelativa(3) })).status, 403);
    assert.equal((await alumno.post('/api/tareas/3/entregas').send({ id_alumno: 1 })).status, 403);
  });

  test('un alumno retirado no puede marcar entregas (403)', async () => {
    const retirado = await H.loginComo('alumnoRetirado');
    assert.equal((await retirado.post('/api/mi/tareas/5/entrega')).status, 403);
  });

  test('la entrega que marca el alumno la ve el docente en la lista del grupo', async () => {
    await alumno.post('/api/mi/tareas/2/entrega');
    const res = await docente.get('/api/tareas/2/entregas');
    assert.equal(res.body.find((f) => f.id_alumno === 7).estado, 'entregada');
  });
});
