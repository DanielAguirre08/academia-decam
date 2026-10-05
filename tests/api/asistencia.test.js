/**
 * Pruebas de API — HU-008 Control de asistencia (caso de uso final del curso).
 *
 *   CA-001  Al elegir grupo y fecha se ve la lista del grupo con lo ya guardado.
 *   CA-002  Sin grupo o sin fecha válida no se carga ni se guarda nada.
 *   CA-003  "Guardar" registra el pase de lista completo (presente/ausente/tardanza).
 *
 * Datos (database/seed.sql): sección 1 = 6-A con los alumnos activos 1, 2, 3, 4 y 7.
 * Sección 2 = 5-A (alumnos 5, 6, 8 activos y 9 inactivo). El seed deja HOY sin asistencia.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const HOY = H.fechaRelativa(0);
const MANANA = H.fechaRelativa(1);
const GRUPO_6A = [1, 2, 3, 4, 7];
const listaCompleta = (estado) => GRUPO_6A.map((id) => ({ id_alumno: id, estado: estado || 'presente' }));

let docente, rosa, jefe, alumno, ajena;

before(async () => {
  ajena = await H.crearSeccionSoloDelDocente1();
  docente = await H.loginComo('docente');
  rosa = await H.loginComo('docente2');
  jefe = await H.loginComo('jefe');
  alumno = await H.loginComo('alumno');
});
after(H.cerrar);

const filasDeHoy = (idSeccion) => H.consultar(
  "SELECT id_alumno, estado, id_docente_registra FROM asistencia WHERE id_seccion = ? AND fecha = ? ORDER BY id_alumno",
  [idSeccion, HOY]
);

describe('Permisos por rol', () => {
  test('GET sin sesión -> 401', async () => {
    const res = await H.anonimo().get('/api/asistencia').query({ id_seccion: 1, fecha: HOY });
    assert.equal(res.status, 401);
  });

  test('POST sin sesión -> 401', async () => {
    const res = await H.anonimo().post('/api/asistencia').send({ id_seccion: 1, fecha: HOY, registros: listaCompleta() });
    assert.equal(res.status, 401);
  });

  test('GET como alumno -> 403 (RF-07: la lista del grupo no es del alumno)', async () => {
    const res = await alumno.get('/api/asistencia').query({ id_seccion: 1, fecha: HOY });
    assert.equal(res.status, 403);
  });

  test('POST como jefe académico -> 403 (solo consulta, no pasa lista)', async () => {
    const res = await jefe.post('/api/asistencia').send({ id_seccion: 1, fecha: HOY, registros: listaCompleta() });
    assert.equal(res.status, 403);
  });

  test('GET como jefe académico -> 200 (puede consultar cualquier grupo)', async () => {
    const res = await jefe.get('/api/asistencia').query({ id_seccion: ajena.id_seccion, fecha: HOY });
    assert.equal(res.status, 200);
  });

  test('docente que no dicta en el grupo: GET y POST -> 403 y no se guarda nada', async () => {
    const get = await rosa.get('/api/asistencia').query({ id_seccion: ajena.id_seccion, fecha: HOY });
    assert.equal(get.status, 403);
    const post = await rosa.post('/api/asistencia').send({
      id_seccion: ajena.id_seccion, fecha: HOY, registros: [{ id_alumno: ajena.id_alumno, estado: 'ausente' }]
    });
    assert.equal(post.status, 403);
    assert.equal((await filasDeHoy(ajena.id_seccion)).length, 0);
  });
});

describe('CA-001: lista del grupo para una fecha', () => {
  test('sin nada guardado, devuelve a los 5 alumnos activos en "presente" por defecto', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: 1, fecha: HOY });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((f) => f.id_alumno).sort((a, b) => a - b), GRUPO_6A);
    assert.ok(res.body.every((f) => f.estado === 'presente' && f.guardado === false));
  });

  test('no incluye alumnos inactivos (5-A: el alumno 9 está retirado)', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: 2, fecha: HOY });
    assert.equal(res.status, 200);
    assert.ok(!res.body.some((f) => f.id_alumno === 9));
  });

  test('trae el % histórico calculado por la capa de Lógica (0-100)', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: 1, fecha: HOY });
    for (const f of res.body) {
      assert.ok(f.diasRegistrados > 0, 'el seed carga 30 días hábiles');
      assert.ok(f.porcentajeAsistencia >= 0 && f.porcentajeAsistencia <= 100);
    }
  });

  test('alumno sin días registrados: porcentaje null (sin datos), no 100%', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: ajena.id_seccion, fecha: HOY });
    assert.equal(res.status, 200);
    const fila = res.body.find((f) => f.id_alumno === ajena.id_alumno);
    assert.equal(fila.porcentajeAsistencia, null);
  });
});

describe('CA-002: grupo y fecha obligatorios y válidos', () => {
  const casos = [
    ['sin grupo', { fecha: HOY }],
    ['grupo vacío', { id_seccion: '', fecha: HOY }],
    ['grupo no numérico', { id_seccion: 'abc', fecha: HOY }],
    ['grupo 0', { id_seccion: '0', fecha: HOY }],
    ['sin fecha', { id_seccion: 1 }],
    ['fecha con otro formato', { id_seccion: 1, fecha: '18/09/2026' }],
    ['fecha inexistente 2026-02-31', { id_seccion: 1, fecha: '2026-02-31' }],
    ['fecha futura (mañana)', { id_seccion: 1, fecha: MANANA }]
  ];
  for (const [nombre, query] of casos) {
    test('GET ' + nombre + ' -> 400', async () => {
      const res = await docente.get('/api/asistencia').query(query);
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });
    test('POST ' + nombre + ' -> 400 y no se guarda nada', async () => {
      const res = await docente.post('/api/asistencia').send(Object.assign({ registros: listaCompleta('ausente') }, query));
      assert.equal(res.status, 400);
    });
  }

  test('grupo que no existe -> 404', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: 9999, fecha: HOY });
    assert.equal(res.status, 404);
  });

  test('ninguno de los POST inválidos dejó filas para hoy en el 6-A', async () => {
    assert.equal((await filasDeHoy(1)).length, 0);
  });
});

describe('CA-003: guardar el pase de lista', () => {
  test('registros inválidos -> 400 con la lista de errores, sin guardar nada', async () => {
    const casos = [
      ['lista vacía', []],
      ['sin lista', undefined],
      ['estado fuera del ENUM', [{ id_alumno: 1, estado: 'tarde' }]],
      ['alumno de otra sección (5 es del 5-A)', [{ id_alumno: 1, estado: 'presente' }, { id_alumno: 5, estado: 'presente' }]],
      ['alumno que no existe', [{ id_alumno: 999999, estado: 'presente' }]],
      ['alumno repetido', [{ id_alumno: 1, estado: 'presente' }, { id_alumno: 1, estado: 'ausente' }]],
      ['id de alumno no numérico', [{ id_alumno: 'x', estado: 'presente' }]]
    ];
    for (const [nombre, registros] of casos) {
      const res = await docente.post('/api/asistencia').send({ id_seccion: 1, fecha: HOY, registros });
      assert.equal(res.status, 400, nombre);
      assert.ok(Array.isArray(res.body.errores) && res.body.errores.length > 0, nombre + ': debe explicar el error');
    }
    assert.equal((await filasDeHoy(1)).length, 0);
  });

  test('alumno inactivo de la sección -> 400 (5-A, alumno 9 retirado)', async () => {
    const res = await docente.post('/api/asistencia').send({ id_seccion: 2, fecha: HOY, registros: [{ id_alumno: 9, estado: 'presente' }] });
    assert.equal(res.status, 400);
  });

  test('caso feliz: guarda los 5 registros en MySQL firmados por el docente de la sesión', async () => {
    const registros = [
      { id_alumno: 1, estado: 'presente' },
      { id_alumno: 2, estado: 'ausente' },
      { id_alumno: 3, estado: 'tardanza' },
      { id_alumno: 4, estado: 'presente' },
      { id_alumno: 7, estado: 'presente' }
    ];
    // Se intenta suplantar al firmante: el servidor debe ignorarlo y usar la sesión (id_docente 1).
    const res = await docente.post('/api/asistencia').send({ id_seccion: '1', fecha: HOY, registros, id_docente_registra: 4 });
    assert.equal(res.status, 200);
    assert.equal(res.body.guardados, 5);

    const filas = await filasDeHoy(1);
    assert.deepEqual(filas.map((f) => [f.id_alumno, f.estado]), registros.map((r) => [r.id_alumno, r.estado]));
    assert.ok(filas.every((f) => f.id_docente_registra === 1));
  });

  test('CA-001 tras guardar: el GET devuelve lo guardado y marca guardado=true', async () => {
    const res = await docente.get('/api/asistencia').query({ id_seccion: 1, fecha: HOY });
    const porId = Object.fromEntries(res.body.map((f) => [f.id_alumno, f]));
    assert.equal(porId[2].estado, 'ausente');
    assert.equal(porId[3].estado, 'tardanza');
    assert.ok(res.body.every((f) => f.guardado === true));
  });

  test('guardar otra vez el mismo día actualiza, no duplica (UNIQUE alumno/sección/fecha)', async () => {
    const res = await docente.post('/api/asistencia').send({ id_seccion: 1, fecha: HOY, registros: listaCompleta('ausente') });
    assert.equal(res.status, 200);
    const filas = await filasDeHoy(1);
    assert.equal(filas.length, 5);
    assert.ok(filas.every((f) => f.estado === 'ausente'));
  });

  test('la base sigue íntegra: ninguna asistencia en una sección distinta a la del alumno', async () => {
    const [fila] = await H.consultar(
      `SELECT COUNT(*) AS n FROM asistencia x JOIN alumno a ON a.id_alumno = x.id_alumno
       WHERE a.id_seccion IS NULL OR a.id_seccion <> x.id_seccion`
    );
    assert.equal(Number(fila.n), 0);
  });
});
