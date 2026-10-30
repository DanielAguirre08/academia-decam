/**
 * Pruebas de API — HU-013 Mensajes con buscador de destinatarios y contador de no leídos.
 *
 * Datos (database/seed.sql): los 4 docentes dictan en las 4 secciones. Usuarios: 1 Profesor Demo
 * (docente 1), 2 Jefe, 3 Registrador, 4 Rosa Quispe (docente 2, Comunicación), 101 Ana Torres
 * (6-A), 105 Sofía Vargas (5-A), 107 Alumno Demo (6-A), 109 Mateo Castro (alumno retirado).
 * Fixture: la sección 4-C (id 90) solo es del docente 1, con el alumno "Prueba Seccion Noventa" (190).
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let docente, docente2, alumno, jefe;
before(async () => {
  await H.crearSeccionSoloDelDocente1();
  docente = await H.loginComo('docente');
  docente2 = await H.loginComo('docente2');
  alumno = await H.loginComo('alumno');
  jefe = await H.loginComo('jefe');
});
after(H.cerrar);

async function buscar(agente, q) {
  const res = await agente.get('/api/mensajes/destinatarios').query({ q });
  assert.equal(res.status, 200, q);
  return res.body;
}

async function contarMensajes() {
  const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM mensaje');
  return Number(n);
}

describe('HU-013 — Buscador de destinatarios', () => {
  test('sin sesión 401', async () => {
    assert.equal((await H.anonimo().get('/api/mensajes/destinatarios').query({ q: 'ana' })).status, 401);
  });

  test('con menos de 2 letras (o sin texto) no busca: lista vacía', async () => {
    assert.deepEqual(await buscar(jefe, 'a'), []);
    assert.deepEqual(await buscar(jefe, '   '), []);
    assert.deepEqual((await jefe.get('/api/mensajes/destinatarios')).body, []);
  });

  test('sin distinguir mayúsculas ni tildes, con el detalle de cada uno', async () => {
    const r = await buscar(jefe, 'SOFIA');
    assert.deepEqual(r, [{ id_usuario: 105, nombre: 'Sofía Vargas Núñez', correo: 'sofia.vargas@acadecam.edu.pe', rol: 'alumno', detalle: 'Alumno · 5-A' }]);
    const rosa = await buscar(jefe, 'rosa quispe');
    assert.equal(rosa[0].detalle, 'Docente · Comunicación');
  });

  test('varias palabras en cualquier orden, y también por correo', async () => {
    assert.deepEqual((await buscar(jefe, 'torres ana')).map((u) => u.id_usuario), [101]);
    const reg = await buscar(jefe, 'registrador@');
    assert.deepEqual(reg.map((u) => [u.id_usuario, u.detalle]), [[3, 'Registrador']]);
  });

  test('"%" y "_" se buscan literalmente (no listan a todos)', async () => {
    assert.deepEqual(await buscar(jefe, '%%'), []);
    assert.deepEqual(await buscar(jefe, '__'), []);
  });

  test('nunca aparece uno mismo, y como máximo 8 resultados', async () => {
    assert.ok(!(await buscar(jefe, 'jefe')).some((u) => u.id_usuario === 2));
    assert.equal((await buscar(jefe, 'acadecam')).length, 8);
  });

  test('alumno: encuentra a los docentes de su sección y al personal, nunca a otros alumnos', async () => {
    const todos = await buscar(alumno, 'acadecam');
    assert.ok(todos.length > 0);
    assert.ok(todos.every((u) => u.rol !== 'alumno'));
    assert.deepEqual((await buscar(alumno, 'rosa')).map((u) => u.id_usuario), [4]);
    assert.deepEqual(await buscar(alumno, 'ana torres'), []);
  });

  test('docente: solo los alumnos de las secciones donde dicta o es tutor', async () => {
    const delDocente1 = await buscar(docente, 'noventa');
    assert.deepEqual(delDocente1.map((u) => [u.id_usuario, u.detalle]), [[190, 'Alumno · 4-C']]);
    assert.deepEqual(await buscar(docente2, 'noventa'), [], 'Rosa no dicta en el 4-C');
    assert.deepEqual((await buscar(docente2, 'profesor')).map((u) => u.id_usuario), [1], 'los docentes sí se ven entre sí');
  });

  test('docente: el alumno retirado ya no aparece', async () => {
    assert.deepEqual(await buscar(docente, 'mateo castro'), []);
  });
});

describe('HU-013 — Envío a varios destinatarios', () => {
  test('un mensaje por destinatario (sin repetir) y le llega a cada uno', async () => {
    const res = await docente.post('/api/mensajes').send({ para: [107, 4, 107, '101'], contenido: 'Reunión de aula el viernes.' });
    assert.equal(res.status, 201);
    assert.equal(res.body.enviados, 3);
    assert.equal(res.body.ids_mensaje.length, 3);
    assert.equal(res.body.id_mensaje, res.body.ids_mensaje[0]);
    const guardados = await H.consultar('SELECT id_remitente, id_destinatario FROM mensaje WHERE id_mensaje IN (?) ORDER BY id_mensaje', [res.body.ids_mensaje]);
    assert.deepEqual(guardados.map((m) => [m.id_remitente, m.id_destinatario]), [[1, 107], [1, 4], [1, 101]]);
    const recibidos = (await alumno.get('/api/mensajes')).body;
    assert.ok(recibidos.some((m) => m.id_mensaje === res.body.ids_mensaje[0] && m.otro === 'Profesor Demo'));
  });

  test('lista inválida -> 400 sin guardar nada', async () => {
    const antes = await contarMensajes();
    const casos = [
      [[], 'Elige al menos un destinatario'],
      [['abc'], 'Algún destinatario no es válido'],
      [[0], 'Algún destinatario no es válido'],
      [[2, 1], 'No puedes enviarte un mensaje a ti mismo'],
      [Array.from({ length: 21 }, (_, i) => 101 + i), 'Puedes escribir a 20 destinatarios como máximo']
    ];
    for (const [para, error] of casos) {
      const res = await jefe.post('/api/mensajes').send({ para, contenido: 'hola' });
      assert.equal(res.status, 400, JSON.stringify(para));
      assert.equal(res.body.error, error);
    }
    assert.equal(await contarMensajes(), antes);
  });

  test('fuera de su alcance o inexistente -> 404 con el mismo texto, y no se envía a NADIE de la lista', async () => {
    const antes = await contarMensajes();
    const casos = [
      [docente2, [190]],          // alumno de una sección donde Rosa no dicta
      [alumno, [1, 101]],         // el docente sí, pero Ana es otra alumna: no se envía ninguno
      [alumno, 'ana.torres@acadecam.edu.pe'],
      [jefe, [99999]]
    ];
    for (const [agente, para] of casos) {
      const res = await agente.post('/api/mensajes').send({ para, contenido: 'hola' });
      assert.equal(res.status, 404, JSON.stringify(para));
      assert.equal(res.body.error, 'El destinatario no existe o no puedes escribirle');
    }
    assert.equal(await contarMensajes(), antes);
  });

  test('la regla es simétrica: el alumno puede responderle a su docente', async () => {
    const res = await alumno.post('/api/mensajes').send({ para: [1], contenido: 'Gracias, profesor.' });
    assert.equal(res.status, 201);
  });

  test('la base sigue íntegra: nadie se envía mensajes a sí mismo (control 12)', async () => {
    const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM mensaje WHERE id_remitente = id_destinatario');
    assert.equal(Number(n), 0);
  });
});

describe('HU-013 — Contador de mensajes no leídos', () => {
  async function noLeidos(agente) {
    const res = await agente.get('/api/mensajes/no-leidos');
    assert.equal(res.status, 200);
    return res.body.no_leidos;
  }

  test('sin sesión 401', async () => {
    assert.equal((await H.anonimo().get('/api/mensajes/no-leidos')).status, 401);
  });

  test('cuenta solo los recibidos sin abrir del propio usuario', async () => {
    const [{ n }] = await H.consultar('SELECT COUNT(*) AS n FROM mensaje WHERE id_destinatario = 4 AND leido = FALSE');
    assert.equal(await noLeidos(docente2), Number(n));
  });

  test('sube cuando otro le escribe, no con lo que uno envía, y baja al marcarlo como leído', async () => {
    const antes = await noLeidos(docente2);
    const deJefe = await jefe.post('/api/mensajes').send({ para: [4], contenido: 'Revise el horario, por favor.' });
    assert.equal(deJefe.status, 201);
    assert.equal(await noLeidos(docente2), antes + 1);

    const propio = await docente2.post('/api/mensajes').send({ para: [2], contenido: 'Visto, lo reviso hoy.' });
    assert.equal(propio.status, 201);
    assert.equal(await noLeidos(docente2), antes + 1, 'lo que envía no le suma');

    assert.equal((await docente2.patch('/api/mensajes/' + deJefe.body.id_mensaje + '/leido')).status, 200);
    assert.equal(await noLeidos(docente2), antes);
  });

  test('un envío a varios suma 1 a cada destinatario', async () => {
    const antesAlumno = await noLeidos(alumno);
    const antesRosa = await noLeidos(docente2);
    assert.equal((await jefe.post('/api/mensajes').send({ para: [107, 4], contenido: 'Mañana no hay clases.' })).status, 201);
    assert.equal(await noLeidos(alumno), antesAlumno + 1);
    assert.equal(await noLeidos(docente2), antesRosa + 1);
  });
});
