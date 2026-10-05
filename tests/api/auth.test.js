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
