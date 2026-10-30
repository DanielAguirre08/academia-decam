/**
 * Pruebas de API — pantallas de consulta (Horario, Mi Sección, Mis Alumnos) y Mensajes.
 * Datos (database/seed.sql): el docente 1 (Matemática) es tutor del 6-A (Aula 14, Mañana) y dicta
 * 5 bloques por sección. El mensaje 2 es del Alumno Demo (107) al docente 1; el 3, del Jefe al docente 1.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let docente, alumno, jefe;
before(async () => {
  docente = await H.loginComo('docente');
  alumno = await H.loginComo('alumno');
  jefe = await H.loginComo('jefe');
});
after(H.cerrar);

describe('Horario', () => {
  test('sin sesión 401; jefe 403', async () => {
    assert.equal((await H.anonimo().get('/api/horario')).status, 401);
    assert.equal((await jefe.get('/api/horario')).status, 403);
  });

  test('docente: solo sus bloques, organizados por día y hora', async () => {
    const res = await docente.get('/api/horario');
    assert.equal(res.status, 200);
    const bloques = Object.values(res.body.celdas);
    const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM horario WHERE id_docente = 1');
    assert.equal(bloques.length, Number(n));
    assert.ok(bloques.every((b) => b.curso === 'Matemática'));
    assert.deepEqual(res.body.dias, ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']);
  });

  test('alumno: el horario de su sección con todos los cursos', async () => {
    const res = await alumno.get('/api/horario');
    const bloques = Object.values(res.body.celdas);
    assert.equal(bloques.length, 20); // 6-A: 4 bloques x 5 días
    assert.ok(bloques.every((b) => b.grupo === '6-A'));
  });
});

describe('Mi Sección', () => {
  test('docente: sus secciones como tutor y el detalle real de la elegida', async () => {
    // El docente 1 es tutor del 6-A (seed) y del 4-C de prueba (fixture de otras pruebas, id 90).
    const res = await docente.get('/api/seccion').query({ id_seccion: 1 });
    assert.equal(res.status, 200);
    assert.ok(res.body.opciones.some((o) => o.id_seccion === 1));
    assert.equal(res.body.grupo, '6-A');
    assert.equal(res.body.aula, 'Aula 14');
    assert.equal(res.body.turno, 'Mañana');
    assert.equal(res.body.tutor, 'Profesor Demo');
    assert.equal(res.body.alumnos.length, Number((await H.consultar(
      "SELECT COUNT(*) AS n FROM alumno WHERE id_seccion = 1 AND estado = 'activo'"))[0].n));
  });

  test('docente: sin parámetro, siempre la misma sección; una de la que no es tutor -> 403', async () => {
    const a = (await docente.get('/api/seccion')).body;
    const b = (await docente.get('/api/seccion')).body;
    assert.equal(a.id_seccion, b.id_seccion);
    assert.equal(a.id_seccion, a.opciones[0].id_seccion);
    assert.equal((await docente.get('/api/seccion').query({ id_seccion: 2 })).status, 403);
  });

  test('alumno: su propia sección; sin datos sensibles de los compañeros', async () => {
    const res = await alumno.get('/api/seccion');
    assert.equal(res.body.grupo, '6-A');
    assert.ok(res.body.alumnos.every((a) => Object.keys(a).join() === 'nombreAlumno'));
  });
});

describe('Mis Alumnos', () => {
  test('solo el docente (alumno 403)', async () => {
    assert.equal((await alumno.get('/api/alumnos')).status, 403);
  });

  test('directorio con promedio, asistencia, tareas pendientes y desempeño', async () => {
    const res = await docente.get('/api/alumnos');
    assert.equal(res.status, 200);
    const ana = res.body.find((a) => a.id_alumno === 1);
    assert.equal(ana.grupo, '6-A');
    assert.equal(ana.promedio, 16.5);
    assert.equal(ana.desempeno, 'Bien');
    assert.ok(ana.porcentajeAsistencia >= 0 && ana.porcentajeAsistencia <= 100);
    assert.ok(Number.isInteger(ana.tareasPendientes));
    // Andrés (6-B): 7, 9, 8, 10 -> 8.50. Se usa él porque calificaciones.test.js modifica las notas del alumno 2.
    assert.equal(res.body.find((a) => a.id_alumno === 11).desempeno, 'En riesgo');
    assert.ok(!res.body.some((a) => a.id_alumno === 9), 'el alumno retirado no aparece');
  });
});

describe('Mensajes', () => {
  test('sin sesión 401', async () => {
    assert.equal((await H.anonimo().get('/api/mensajes')).status, 401);
  });

  test('recibidos y enviados: solo los propios', async () => {
    const recibidos = (await docente.get('/api/mensajes')).body;
    assert.ok(recibidos.some((m) => m.id_mensaje === 2 && m.otro === 'Alumno Demo'));
    assert.ok(!recibidos.some((m) => m.id_mensaje === 1), 'el 1 lo ENVIÓ el docente');
    const enviados = (await docente.get('/api/mensajes').query({ bandeja: 'enviados' })).body;
    assert.ok(enviados.some((m) => m.id_mensaje === 1));
  });

  test('enviar: valida, rechaza correo inexistente y a uno mismo, y llega al destinatario', async () => {
    assert.equal((await alumno.post('/api/mensajes').send({ para: 'alumno@acadecam.edu.pe', contenido: 'hola' })).status, 400);
    assert.equal((await alumno.post('/api/mensajes').send({ para: 'nadie@acadecam.edu.pe', contenido: 'hola' })).status, 404);
    assert.equal((await alumno.post('/api/mensajes').send({ para: 'prof@acadecam.edu.pe', contenido: '' })).status, 400);
    const ok = await alumno.post('/api/mensajes').send({ para: 'prof@acadecam.edu.pe', contenido: 'Profesor, ya subí mi tarea.' });
    assert.equal(ok.status, 201);
    const recibidos = (await docente.get('/api/mensajes')).body;
    const nuevo = recibidos.find((m) => m.id_mensaje === ok.body.id_mensaje);
    assert.equal(nuevo.leido, false);
    assert.equal(nuevo.correoOtro, 'alumno@acadecam.edu.pe');
  });

  test('no se puede enviar a uno mismo ni con tildes o mayúsculas en el correo (intercalación de MySQL)', async () => {
    // utf8mb4_unicode_ci compara "próf@" igual que "prof@": el servidor compara por id_usuario.
    for (const para of ['PROF@acadecam.edu.pe', 'próf@acadecam.edu.pe']) {
      const res = await docente.post('/api/mensajes').send({ para, contenido: 'prueba' });
      assert.equal(res.status, 400, para);
    }
  });

  test('marcar como leído: solo el destinatario (ajeno -> 404)', async () => {
    assert.equal((await alumno.patch('/api/mensajes/3/leido')).status, 404); // el 3 es para el docente
    assert.equal((await docente.patch('/api/mensajes/2/leido')).status, 200);
    const [m] = await H.consultar('SELECT leido FROM mensaje WHERE id_mensaje = 2');
    assert.equal(m.leido, 1);
  });

  test('la base sigue íntegra: nadie se envía mensajes a sí mismo (control 12)', async () => {
    const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM mensaje WHERE id_remitente = id_destinatario');
    assert.equal(Number(n), 0);
  });
});
