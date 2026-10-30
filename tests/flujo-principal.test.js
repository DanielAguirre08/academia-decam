/**
 * Pruebas unitarias del FLUJO PRINCIPAL — Academia Decam (Calidad y Pruebas de Software)
 *
 * Flujo: el docente entra al sistema y toma la asistencia diaria de su grupo (HU-001 + HU-008).
 *
 *   Paso 1  Iniciar sesión como docente ........ logica-auth.js
 *   Paso 2  Elegir grupo y fecha ............... logica-docente.js
 *   Paso 3  Marcar a todos presentes y cambiar .. logica-docente.js
 *           a alguien a ausente / tardanza
 *   Paso 4  Validar el pase de lista y guardar .. logica-docente.js
 *   Paso 5  Ver el porcentaje de asistencia ..... logica-docente.js
 *
 * Cómo correrlo:  node --test tests/flujo-principal.test.js
 * No usa navegador ni base de datos: la capa de Lógica son funciones puras.
 */
const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const Auth = require('../logica-auth.js');
const Docente = require('../logica-docente.js');

// La fecha "hoy" se fija a mano: la lógica no lee el reloj, así el resultado nunca cambia.
const HOY = new Date('2026-10-07T10:00:00');
const IDS_DEL_GRUPO = [1, 2, 3, 4];

describe('Paso 1 — Iniciar sesión como docente (HU-001)', () => {
  test('con correo y contraseña completos se puede intentar el ingreso', () => {
    assert.equal(Auth.validarCredenciales('prof@acadecam.edu.pe', 'decam2024'), true);
  });

  test('sin contraseña, o solo con espacios, no se permite', () => {
    assert.equal(Auth.validarCredenciales('prof@acadecam.edu.pe', ''), false);
    assert.equal(Auth.validarCredenciales('   ', '   '), false);
  });

  test('el rol elegido debe ser válido y coincidir con el del usuario', () => {
    assert.equal(Auth.validarRol('docente'), true);
    assert.equal(Auth.validarRol('admin'), false);
    assert.equal(Auth.rolCoincide('docente', 'docente'), true);
    assert.equal(Auth.rolCoincide('docente', 'alumno'), false);
  });
});

describe('Paso 2 — Elegir grupo y fecha (HU-008 CA-001 / CA-002)', () => {
  test('grupo válido: id entero positivo (viene como texto del <select>)', () => {
    assert.equal(Docente.validarGrupoSeleccionado('1'), true);
    assert.equal(Docente.validarGrupoSeleccionado(4), true);
  });

  test('grupo inválido: vacío, cero, negativo, decimal o texto', () => {
    for (const malo of ['', undefined, '0', -1, 1.5, '6-A', '1 OR 1=1']) {
      assert.equal(Docente.validarGrupoSeleccionado(malo), false, 'debía rechazar ' + JSON.stringify(malo));
    }
  });

  test('fecha válida con formato AAAA-MM-DD', () => {
    assert.equal(Docente.validarFechaAsistencia('2026-10-07'), true);
  });

  test('fecha inválida por formato', () => {
    for (const mala of ['', undefined, '07/10/2026', '2026-9-18', '2026-10-07T00:00']) {
      assert.equal(Docente.validarFechaAsistencia(mala), false, 'debía rechazar ' + JSON.stringify(mala));
    }
  });

  test('valores límite del calendario: 29 de febrero y días 31 inexistentes', () => {
    assert.equal(Docente.validarFechaAsistencia('2026-02-28'), true);
    assert.equal(Docente.validarFechaAsistencia('2026-02-29'), false); // 2026 no es bisiesto
    assert.equal(Docente.validarFechaAsistencia('2028-02-29'), true);  // 2028 sí
    assert.equal(Docente.validarFechaAsistencia('2026-04-31'), false);
    assert.equal(Docente.validarFechaAsistencia('2026-13-01'), false);
  });

  test('valor límite: hoy no es futuro, mañana sí', () => {
    assert.equal(Docente.esFechaFutura('2026-10-06', HOY), false);
    assert.equal(Docente.esFechaFutura('2026-10-07', HOY), false);
    assert.equal(Docente.esFechaFutura('2026-10-08', HOY), true);
  });
});

describe('Paso 3 — Marcar a todos presentes y cambiar a alguien (HU-008 CA-003)', () => {
  test('"Marcar a todos" deja a cada alumno del grupo como presente', () => {
    const lista = Docente.marcarAsistenciaTodos(IDS_DEL_GRUPO, 'presente');
    assert.equal(lista.length, 4);
    assert.ok(lista.every((r) => r.estado === 'presente'));
  });

  test('solo existen 3 estados: presente, ausente y tardanza', () => {
    for (const ok of ['presente', 'ausente', 'tardanza']) {
      assert.equal(Docente.validarEstadoAsistencia(ok), true);
    }
    for (const malo of ['tarde', 'Presente', '', undefined]) {
      assert.equal(Docente.validarEstadoAsistencia(malo), false);
    }
  });
});

describe('Paso 4 — Validar el pase de lista antes de guardar (HU-008)', () => {
  test('camino feliz: pase completo con los tres estados es válido', () => {
    const r = Docente.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'presente' },
      { id_alumno: 2, estado: 'ausente' },
      { id_alumno: 3, estado: 'tardanza' },
      { id_alumno: '4', estado: 'presente' }
    ], IDS_DEL_GRUPO);
    assert.equal(r.valido, true);
    assert.deepEqual(r.errores, []);
  });

  test('lista vacía o que no es lista: inválida', () => {
    assert.equal(Docente.validarRegistrosAsistencia([], IDS_DEL_GRUPO).valido, false);
    assert.equal(Docente.validarRegistrosAsistencia(undefined, IDS_DEL_GRUPO).valido, false);
  });

  test('alumno que no pertenece al grupo: se rechaza y el mensaje dice cuál', () => {
    const r = Docente.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'presente' },
      { id_alumno: 99, estado: 'presente' }
    ], IDS_DEL_GRUPO);
    assert.equal(r.valido, false);
    assert.deepEqual(r.errores, ['Fila 2: el alumno 99 no pertenece a este grupo']);
  });

  test('alumno repetido: se rechaza (el segundo no pisa al primero en silencio)', () => {
    const r = Docente.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'presente' },
      { id_alumno: 1, estado: 'ausente' }
    ], IDS_DEL_GRUPO);
    assert.equal(r.valido, false);
    assert.deepEqual(r.errores, ['Fila 2: el alumno 1 está repetido']);
  });

  test('varios errores a la vez: los junta todos en vez de parar en el primero', () => {
    const r = Docente.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'tarde' },
      { id_alumno: 'abc', estado: 'presente' },
      null
    ], IDS_DEL_GRUPO);
    assert.equal(r.valido, false);
    assert.equal(r.errores.length, 3);
  });
});

describe('Paso 5 — Porcentaje de asistencia (HU-008)', () => {
  test('la tardanza cuenta como asistencia', () => {
    assert.equal(Docente.calcularPorcentajeAsistencia(18, 2, 20), 100);
    assert.equal(Docente.calcularPorcentajeAsistencia(15, 0, 20), 75);
  });

  test('redondea al entero más cercano (2 de 3 = 67)', () => {
    assert.equal(Docente.calcularPorcentajeAsistencia(2, 0, 3), 67);
  });

  test('MySQL devuelve SUM() como texto y aun así calcula bien', () => {
    assert.equal(Docente.calcularPorcentajeAsistencia('10', '5', '20'), 75);
  });

  test('sin días registrados devuelve null (sin datos), no 100 %', () => {
    assert.equal(Docente.calcularPorcentajeAsistencia(0, 0, 0), null);
    assert.equal(Docente.calcularPorcentajeAsistencia(null, null, null), null);
  });
});
