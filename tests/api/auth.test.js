/**
 * Pruebas de API — HU-001 (login con acceso por rol) y control de sesión.
 */
const H = require('./helpers'); // primero: fija la base de pruebas
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

after(H.cerrar);

test('sin sesión, una ruta protegida responde 401', async () => {
  const res = await H.anonimo().get('/api/secciones');
  assert.equal(res.status, 401);
});

test('CA-001: login correcto devuelve el usuario sin el hash y abre sesión', async () => {
  const agente = await H.loginComo('docente');
  const yo = await agente.get('/api/auth/me');
  assert.equal(yo.status, 200);
  assert.equal(yo.body.rol, 'docente');
  assert.equal(yo.body.id_docente, 1);
  assert.equal(yo.body.contrasena_hash, undefined);

  const secciones = await agente.get('/api/secciones');
  assert.equal(secciones.status, 200);
  assert.ok(secciones.body.length >= 4);
});

test('CA-002: correo inexistente y rol equivocado dan el mismo mensaje genérico', async () => {
  const inexistente = await H.anonimo().post('/api/auth/login')
    .send({ correo: 'nadie@acadecam.edu.pe', contrasena: 'x', rol: 'docente' });
  assert.equal(inexistente.status, 401);

  const rolEquivocado = await H.anonimo().post('/api/auth/login')
    .send({ correo: H.CUENTAS.jefe.correo, contrasena: H.CUENTAS.jefe.contrasena, rol: 'docente' });
  assert.equal(rolEquivocado.status, 401);
  assert.equal(rolEquivocado.body.error, inexistente.body.error);
});

test('datos incompletos responden 400', async () => {
  const res = await H.anonimo().post('/api/auth/login').send({ correo: '', contrasena: '' });
  assert.equal(res.status, 400);
});

test('RNF-02: el 5.º intento fallido bloquea la cuenta (423) y ni la contraseña correcta entra', async () => {
  const cuenta = { correo: 'jorge.mendoza@acadecam.edu.pe', rol: 'docente' };
  for (let i = 1; i <= 4; i++) {
    const r = await H.anonimo().post('/api/auth/login').send(Object.assign({ contrasena: 'mala' }, cuenta));
    assert.equal(r.status, 401, 'intento ' + i);
  }
  const quinto = await H.anonimo().post('/api/auth/login').send(Object.assign({ contrasena: 'mala' }, cuenta));
  assert.equal(quinto.status, 423);

  const correcta = await H.anonimo().post('/api/auth/login').send(Object.assign({ contrasena: 'decam2024' }, cuenta));
  assert.equal(correcta.status, 423);
});

test('logout cierra la sesión', async () => {
  const agente = await H.loginComo('alumno');
  assert.equal((await agente.post('/api/auth/logout')).status, 200);
  assert.equal((await agente.get('/api/auth/me')).status, 401);
});

test('cambio de contraseña: exige sesión, la actual correcta y una nueva válida', async () => {
  assert.equal((await H.anonimo().post('/api/auth/contrasena').send({})).status, 401);

  const cuenta = { correo: 'carmen.vilca@acadecam.edu.pe', rol: 'docente' };
  // Agente propio con otra docente, para no cambiar la contraseña de las cuentas que usan las demás pruebas.
  const carmen = require('supertest').agent(H.app);
  assert.equal((await carmen.post('/api/auth/login').send(Object.assign({ contrasena: 'decam2024' }, cuenta))).status, 200);

  const mala = await carmen.post('/api/auth/contrasena').send({ actual: 'incorrecta', nueva: 'nueva2026', confirmacion: 'nueva2026' });
  assert.equal(mala.status, 400);
  assert.equal(mala.body.error, 'La contraseña actual no es correcta');

  const debil = await carmen.post('/api/auth/contrasena').send({ actual: 'decam2024', nueva: 'corta1', confirmacion: 'corta1' });
  assert.equal(debil.status, 400);

  const ok = await carmen.post('/api/auth/contrasena').send({ actual: 'decam2024', nueva: 'nueva2026', confirmacion: 'nueva2026' });
  assert.equal(ok.status, 200);

  // La anterior ya no sirve y la nueva sí.
  assert.equal((await H.anonimo().post('/api/auth/login').send(Object.assign({ contrasena: 'decam2024' }, cuenta))).status, 401);
  assert.equal((await H.anonimo().post('/api/auth/login').send(Object.assign({ contrasena: 'nueva2026' }, cuenta))).status, 200);
});
