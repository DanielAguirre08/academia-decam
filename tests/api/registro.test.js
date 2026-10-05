/**
 * Pruebas de API — Registrador: HU-002 Registro, HU-003 Matrícula, HU-004 Estado de matrículas.
 *
 * Datos (database/seed.sql): 15 matrículas MAT-0001..MAT-0015; la MAT-0009 (alumno 9, 5-A) está
 * inactiva. Secciones 2026: Primaria 6-A, 5-A, 6-B y Secundaria 3-A (turnos Mañana salvo 6-B Tarde).
 * Apoderado 1 = DNI 40000001.
 * Los alumnos nuevos van al 6-B y al 5-A: el 6-A lo usan las pruebas de asistencia y tareas.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ANIO = new Date().getFullYear();
let registrador, docente, jefe;

before(async () => {
  registrador = await H.loginComo('registrador');
  docente = await H.loginComo('docente');
  jefe = await H.loginComo('jefe');
});
after(H.cerrar);

/** Controles 01, 02 y 03 de database/verificar-integridad.sql: deben dar 0 en todo momento. */
async function controlesDeMatricula() {
  const [fila] = await H.consultar(`
    SELECT
      (SELECT COUNT(*) FROM alumno a JOIN seccion s ON s.id_seccion = a.id_seccion WHERE a.nivel <> s.nivel) AS c01,
      (SELECT COUNT(*) FROM alumno a WHERE a.estado = 'activo' AND a.id_seccion IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM matricula m WHERE m.id_alumno = a.id_alumno AND m.id_seccion = a.id_seccion AND m.estado = 'activa')) AS c02,
      (SELECT COUNT(*) FROM matricula m JOIN alumno a ON a.id_alumno = m.id_alumno
         WHERE m.estado = 'activa' AND a.estado <> 'activo') AS c03`);
  return { c01: Number(fila.c01), c02: Number(fila.c02), c03: Number(fila.c03) };
}
const SIN_ERRORES = { c01: 0, c02: 0, c03: 0 };

const contar = async (tabla) => Number((await H.consultar('SELECT COUNT(*) AS n FROM ' + tabla))[0].n);

describe('Permisos del Registrador', () => {
  test('sin sesión -> 401; docente y jefe -> 403 en registros y matrículas', async () => {
    assert.equal((await H.anonimo().get('/api/registros')).status, 401);
    assert.equal((await H.anonimo().get('/api/matriculas')).status, 401);
    for (const agente of [docente, jefe]) {
      assert.equal((await agente.get('/api/registros')).status, 403);
      assert.equal((await agente.post('/api/registros').send({ tipo: 'apoderado' })).status, 403);
      assert.equal((await agente.get('/api/matriculas')).status, 403);
      assert.equal((await agente.post('/api/matriculas').send({})).status, 403);
      assert.equal((await agente.patch('/api/matriculas/1/estado')).status, 403);
    }
  });

  test('el alta de alumno desde Calificaciones ya no existe (lo hace el Registrador)', async () => {
    assert.equal((await docente.post('/api/calificaciones').send({ nombreAlumno: 'X Y', id_seccion: 1 })).status, 404);
  });
});

describe('HU-002 — Registro de personas', () => {
  test('CA-003: sin nombre no registra y responde "El nombre es obligatorio"', async () => {
    const antes = await contar('apoderado');
    const res = await registrador.post('/api/registros').send({ tipo: 'apoderado', nombre: '  ', dni: '41000001', telefono: '999000111' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'El nombre es obligatorio');
    assert.equal(await contar('apoderado'), antes);
  });

  test('CA-001: registra un apoderado con fecha peruana y aparece en el listado', async () => {
    const res = await registrador.post('/api/registros').send({
      tipo: 'apoderado', nombre: 'Julia Vela Ramos', dni: '41000001', telefono: '+51 988 777 666', correo: 'julia.vela@correo.pe'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.tipo, 'apoderado');
    assert.match(res.body.fecha, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(res.body.telefono, '+51988777666'); // normalizado
    assert.equal(res.body.contrasenaInicial, undefined); // el apoderado no tiene cuenta

    const lista = await registrador.get('/api/registros').query({ tipo: 'apoderado', busqueda: '41000001' });
    assert.equal(lista.body.length, 1);
  });

  test('DNI repetido -> 409 y no se duplica', async () => {
    const res = await registrador.post('/api/registros').send({ tipo: 'apoderado', nombre: 'Otra Persona', dni: '41000001', telefono: '999000111' });
    assert.equal(res.status, 409);
  });

  test('docente: crea USUARIO + DOCENTE y puede iniciar sesión con la contraseña inicial', async () => {
    const res = await registrador.post('/api/registros').send({
      tipo: 'docente', nombre: 'Pedro Soto Vela', dni: '10000099', correo: 'pedro.soto@acadecam.edu.pe', especialidad: 'Inglés'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.especialidad, 'Inglés');
    assert.match(res.body.contrasenaInicial, /^[A-Za-z0-9]{10}$/);

    const [cuenta] = await H.consultar("SELECT nombre, apellido, rol, contrasena_hash FROM usuario WHERE correo = 'pedro.soto@acadecam.edu.pe'");
    assert.deepEqual([cuenta.nombre, cuenta.apellido, cuenta.rol], ['Pedro', 'Soto Vela', 'docente']);
    assert.notEqual(cuenta.contrasena_hash, res.body.contrasenaInicial); // solo el hash

    const login = await H.anonimo().post('/api/auth/login')
      .send({ correo: 'pedro.soto@acadecam.edu.pe', contrasena: res.body.contrasenaInicial, rol: 'docente' });
    assert.equal(login.status, 200);
    assert.ok(login.body.id_docente);
  });

  test('correo ya usado -> 409 y la transacción no deja un docente a medias', async () => {
    const antes = await contar('usuario');
    const res = await registrador.post('/api/registros').send({
      tipo: 'docente', nombre: 'Otro Docente', dni: '10000098', correo: 'prof@acadecam.edu.pe'
    });
    assert.equal(res.status, 409);
    assert.equal(await contar('usuario'), antes);
    assert.equal((await H.consultar("SELECT 1 FROM docente WHERE dni = '10000098'")).length, 0);
  });

  test('CA-002: alumno sin sus campos propios -> 400 con el detalle', async () => {
    const res = await registrador.post('/api/registros').send({ tipo: 'alumno', nombre: 'Rosa Lima Paz', dni: '71000001' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errores.includes('Selecciona el sexo'));
  });

  const ALUMNO = {
    tipo: 'alumno', nombre: 'Rosa Lima Paz', dni: '71000001', fecha_nacimiento: '2015-03-10', sexo: 'F',
    nivel: 'Primaria', apoderado_nombre: 'Marta Medina de Torres', apoderado_dni: '40000001'
  };

  test('alumno sin sección: queda registrado sin matrícula y con su apoderado existente', async () => {
    const res = await registrador.post('/api/registros').send(ALUMNO);
    assert.equal(res.status, 201);
    assert.equal(res.body.seccion, null);
    assert.equal(res.body.codigoMatricula, undefined);
    assert.equal(res.body.apoderado_nombre, 'Marta Medina de Torres'); // el existente, no uno nuevo
    assert.equal(res.body.correo, 'alumno.71000001@acadecam.edu.pe');
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('alumno con grado y sección: queda matriculado y con su fila en Calificaciones', async () => {
    const res = await registrador.post('/api/registros').send(Object.assign({}, ALUMNO, {
      nombre: 'Tomás Lima Paz', dni: '71000002', sexo: 'M', grado: '6', seccion: 'B'
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.seccion, '6-B');
    assert.match(res.body.codigoMatricula, /^MAT-\d{4}$/);
    const [calif] = await H.consultar(
      'SELECT c.periodo, c.promedio FROM calificacion c JOIN alumno a ON a.id_alumno = c.id_alumno WHERE a.dni = ?', ['71000002']
    );
    assert.deepEqual(calif, { periodo: 'Bimestre I', promedio: null });
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('sección inexistente -> 400 y NO queda el alumno creado (rollback)', async () => {
    const antes = await contar('alumno');
    const res = await registrador.post('/api/registros').send(Object.assign({}, ALUMNO, {
      nombre: 'Nadie Sin Seccion', dni: '71000003', grado: '1', seccion: 'Z'
    }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /No existe la sección 1-Z/);
    assert.equal(await contar('alumno'), antes);
  });

  test('apoderado nuevo sin teléfono -> 400 y no se crea nada', async () => {
    const antes = await contar('usuario');
    const res = await registrador.post('/api/registros').send(Object.assign({}, ALUMNO, {
      nombre: 'Sin Telefono Apoderado', dni: '71000004', apoderado_dni: '49999999', apoderado_nombre: 'Nuevo Apoderado'
    }));
    assert.equal(res.status, 400);
    assert.equal(await contar('usuario'), antes);
  });
});

describe('HU-003 — Registro de matrícula', () => {
  const MATRICULA = {
    nombre: 'Lucas Ramos Díaz', dni: '72000001', fecha_nacimiento: '2014-05-20', sexo: 'M', nivel: 'Primaria',
    grado: '6', seccion: 'B', anio_lectivo: String(ANIO), turno: 'Tarde', procedencia: 'traslado',
    apoderado_nombre: 'Elsa Díaz Ramos', apoderado_dni: '42000001', apoderado_telefono: '977 666 555',
    apoderado_correo: 'elsa.diaz@correo.pe', observaciones: 'Viene de Arequipa'
  };
  const mat = (cambios) => Object.assign({}, MATRICULA, cambios);

  test('CA-003: falta un campo (*) -> 400 con el mensaje exacto, sin insertar', async () => {
    const antes = await contar('matricula');
    for (const campo of ['nombre', 'nivel', 'grado', 'seccion', 'apoderado_nombre']) {
      const res = await registrador.post('/api/matriculas').send(mat({ [campo]: '' }));
      assert.equal(res.status, 400, campo);
      assert.equal(res.body.error, 'Los campos marcados con (*) son obligatorios', campo);
    }
    assert.equal(await contar('matricula'), antes);
  });

  test('CA-002: grado que no corresponde al nivel -> 400', async () => {
    const res = await registrador.post('/api/matriculas').send(mat({ nivel: 'Secundaria', grado: '6' }));
    assert.equal(res.status, 400);
  });

  test('turno distinto al de la sección -> 400', async () => {
    const res = await registrador.post('/api/matriculas').send(mat({ turno: 'Mañana' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /turno Tarde/);
  });

  test('alumno nuevo sin fecha de nacimiento -> 400 y no se crea nada', async () => {
    const antes = await contar('alumno');
    const res = await registrador.post('/api/matriculas').send(mat({ fecha_nacimiento: '' }));
    assert.equal(res.status, 400);
    assert.equal(await contar('alumno'), antes);
  });

  test('CA-001: alumno nuevo -> crea alumno, apoderado y matrícula activa con código correlativo', async () => {
    const [{ ultimo }] = await H.consultar("SELECT MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)) AS ultimo FROM matricula");
    const res = await registrador.post('/api/matriculas').send(MATRICULA);
    assert.equal(res.status, 201);
    assert.equal(res.body.codigo, 'MAT-' + String(Number(ultimo) + 1).padStart(4, '0'));
    assert.equal(res.body.estado, 'activa');
    assert.equal(res.body.procedencia, 'traslado');
    assert.equal(res.body.seccion, '6-B');
    assert.equal(res.body.apoderado_telefono, '977666555');
    assert.match(res.body.fecha, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.ok(res.body.contrasenaInicial, 'el alumno nuevo recibe su contraseña inicial');
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('el mismo alumno otra vez en el mismo año -> 409 (una matrícula por alumno y año)', async () => {
    const res = await registrador.post('/api/matriculas').send(MATRICULA);
    assert.equal(res.status, 409);
  });

  test('alumno ya registrado (sin sección) -> se le matricula sin pedir fecha ni sexo', async () => {
    // Rosa Lima (71000001) se registró sin sección en HU-002.
    const res = await registrador.post('/api/matriculas').send(mat({
      nombre: 'Rosa Lima Paz', dni: '71000001', fecha_nacimiento: '', sexo: '', grado: '5', seccion: 'A', turno: '',
      apoderado_nombre: 'Marta Medina de Torres', apoderado_dni: '40000001', procedencia: 'nuevo'
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.seccion, '5-A');
    assert.equal(res.body.contrasenaInicial, undefined); // ya tenía cuenta
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('concurrencia: 5 matrículas simultáneas reciben 5 códigos distintos y consecutivos', async () => {
    const pedidos = [1, 2, 3, 4, 5].map((i) => registrador.post('/api/matriculas').send(mat({
      nombre: 'Alumno Concurrente ' + i, dni: '7300000' + i, apoderado_dni: '4300000' + i, procedencia: 'nuevo'
    })));
    const respuestas = await Promise.all(pedidos);
    respuestas.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
    const numeros = respuestas.map((r) => Number(r.body.codigo.slice(4))).sort((a, b) => a - b);
    assert.equal(new Set(numeros).size, 5);
    assert.equal(numeros[4] - numeros[0], 4);
  });
});

describe('HU-004 — Consulta y estado de matrículas', () => {
  test('CA-001: filtra por estado', async () => {
    const res = await registrador.get('/api/matriculas').query({ estado: 'inactiva' });
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((m) => m.estado === 'inactiva'));
    assert.equal((await registrador.get('/api/matriculas').query({ estado: 'pendiente' })).status, 400);
  });

  test('busca por nombre o documento', async () => {
    assert.ok((await registrador.get('/api/matriculas').query({ busqueda: 'Mateo' })).body.some((m) => m.codigo === 'MAT-0009'));
    assert.equal((await registrador.get('/api/matriculas').query({ busqueda: '70000009' })).body.length, 1);
  });

  test('CA-003: búsqueda sin resultados -> lista vacía', async () => {
    const res = await registrador.get('/api/matriculas').query({ busqueda: 'no-existe-nadie' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('CA-002: activa -> inactiva conserva el código y deja al alumno inactivo', async () => {
    const res = await registrador.patch('/api/matriculas/1/estado');
    assert.equal(res.status, 200);
    assert.equal(res.body.estado, 'inactiva');
    assert.equal(res.body.codigo, 'MAT-0001');
    const [alumno] = await H.consultar('SELECT estado FROM alumno WHERE id_alumno = 1');
    assert.equal(alumno.estado, 'inactivo');
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('CA-002: inactiva -> activa reactiva al alumno en su sección', async () => {
    const res = await registrador.patch('/api/matriculas/1/estado');
    assert.equal(res.body.estado, 'activa');
    const [alumno] = await H.consultar('SELECT estado, id_seccion FROM alumno WHERE id_alumno = 1');
    assert.deepEqual(alumno, { estado: 'activo', id_seccion: 1 });
    assert.deepEqual(await controlesDeMatricula(), SIN_ERRORES);
  });

  test('matrícula inexistente -> 404; id inválido -> 400', async () => {
    assert.equal((await registrador.patch('/api/matriculas/999999/estado')).status, 404);
    assert.equal((await registrador.patch('/api/matriculas/abc/estado')).status, 400);
  });

  test('el alumno inactivo deja de aparecer en la asistencia del docente', async () => {
    await registrador.patch('/api/matriculas/2/estado'); // alumno 2 (6-A) -> inactivo
    const res = await docente.get('/api/asistencia').query({ id_seccion: 1, fecha: H.fechaRelativa(0) });
    assert.ok(!res.body.some((f) => f.id_alumno === 2));
    await registrador.patch('/api/matriculas/2/estado'); // se restaura
  });
});
