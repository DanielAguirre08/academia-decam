/**
 * Pruebas unitarias — Capa de Lógica de Negocio de autenticación (HU-001, RNF-02)
 * Se ejecutan con Node, sin frameworks externos: `node tests/logica-auth.test.js`
 * La fecha "ahora" se fija en cada prueba (la lógica no lee el reloj), así el resultado
 * es siempre el mismo.
 */
const A = require('../logica-auth.js');

let pasadas = 0, fallidas = 0;

function test(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log('  ✓ ' + nombre);
  } catch (e) {
    fallidas++;
    console.log('  ✗ ' + nombre + '\n      ' + e.message);
  }
}

function assertEqual(actual, esperado, msg) {
  if (actual !== esperado) {
    throw new Error((msg || '') + ' — esperado: ' + JSON.stringify(esperado) + ', obtenido: ' + JSON.stringify(actual));
  }
}

const AHORA = new Date('2026-10-03T10:00:00');
const enMinutos = (m) => new Date(AHORA.getTime() + m * 60000);

// ---------------------------------------------------------------
console.log('\nHU-001 — credenciales y rol');
// ---------------------------------------------------------------

test('validarCredenciales exige correo y contraseña', () => {
  assertEqual(A.validarCredenciales('prof@acadecam.edu.pe', 'decam2024'), true);
  assertEqual(A.validarCredenciales('', 'decam2024'), false);
  assertEqual(A.validarCredenciales('prof@acadecam.edu.pe', ''), false);
  assertEqual(A.validarCredenciales('   ', '   '), false);
  assertEqual(A.validarCredenciales(undefined, null), false);
});

test('validarRol solo acepta los 4 valores del ENUM USUARIO.rol', () => {
  ['docente', 'alumno', 'jefe_academico', 'registrador'].forEach((r) => assertEqual(A.validarRol(r), true, r));
  assertEqual(A.validarRol('teacher'), false);
  assertEqual(A.validarRol('admin'), false);
  assertEqual(A.validarRol(undefined), false);
});

test('CA-002: rolCoincide rechaza si el rol elegido no es el del usuario', () => {
  assertEqual(A.rolCoincide('docente', 'docente'), true);
  assertEqual(A.rolCoincide('docente', 'alumno'), false);
  assertEqual(A.rolCoincide('alumno', 'jefe_academico'), false);
  assertEqual(A.rolCoincide('docente', undefined), false);
});

test('obtenerIniciales usa la primera letra de nombre y apellido', () => {
  assertEqual(A.obtenerIniciales('Profesor', 'Demo'), 'PD');
  assertEqual(A.obtenerIniciales('ana', 'torres'), 'AT');
  assertEqual(A.obtenerIniciales('', ''), '?');
});

test('CA-003: etiquetaRol; el alumno lleva su grupo', () => {
  assertEqual(A.etiquetaRol('docente'), 'Maestro');
  assertEqual(A.etiquetaRol('alumno', '6-A'), 'Alumno - 6-A');
  assertEqual(A.etiquetaRol('alumno'), 'Alumno');
  assertEqual(A.etiquetaRol('jefe_academico'), 'Jefe Académico');
  assertEqual(A.etiquetaRol('registrador'), 'Registrador');
});

// ---------------------------------------------------------------
console.log('\nRNF-02 — bloqueo tras 5 intentos fallidos');
// ---------------------------------------------------------------

test('debeBloquearCuenta: con 4 intentos no, con 5 sí', () => {
  assertEqual(A.debeBloquearCuenta(0), false);
  assertEqual(A.debeBloquearCuenta(4), false);
  assertEqual(A.debeBloquearCuenta(5), true);
  assertEqual(A.debeBloquearCuenta(null), false);
});

test('registrarIntentoFallido: los primeros 4 fallos suman y no bloquean', () => {
  let r = { intentosFallidos: 0 };
  for (let i = 1; i <= 4; i++) {
    r = A.registrarIntentoFallido(r.intentosFallidos, AHORA);
    assertEqual(r.intentosFallidos, i, 'intento ' + i);
    assertEqual(r.bloqueada, false, 'bloqueada en el intento ' + i);
    assertEqual(r.bloqueadoHasta, null);
  }
});

test('registrarIntentoFallido: el 5.º fallo bloquea 10 minutos y reinicia el contador', () => {
  const r = A.registrarIntentoFallido(4, AHORA);
  assertEqual(r.bloqueada, true);
  assertEqual(r.bloqueadoHasta.getTime(), enMinutos(10).getTime());
  assertEqual(r.intentosFallidos, 0, 'tras desbloquearse debe tener 5 intentos nuevos');
});

test('estaBloqueada: bloqueada antes del vencimiento, libre después y libre si es null', () => {
  assertEqual(A.estaBloqueada(enMinutos(10), AHORA), true);
  assertEqual(A.estaBloqueada(enMinutos(0.01), AHORA), true);
  assertEqual(A.estaBloqueada(AHORA, AHORA), false, 'justo en el límite ya está libre');
  assertEqual(A.estaBloqueada(enMinutos(-1), AHORA), false);
  assertEqual(A.estaBloqueada(null, AHORA), false);
});

test('minutosRestantes redondea hacia arriba y es 0 si no hay bloqueo', () => {
  assertEqual(A.minutosRestantes(enMinutos(10), AHORA), 10);
  assertEqual(A.minutosRestantes(enMinutos(9.2), AHORA), 10);
  assertEqual(A.minutosRestantes(enMinutos(0.5), AHORA), 1);
  assertEqual(A.minutosRestantes(enMinutos(-5), AHORA), 0);
  assertEqual(A.minutosRestantes(null, AHORA), 0);
});

// ---------------------------------------------------------------
console.log('\n' + pasadas + ' pruebas pasadas, ' + fallidas + ' fallidas.\n');
process.exit(fallidas > 0 ? 1 : 0);
