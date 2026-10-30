/**
 * Pruebas unitarias — Capa de Lógica del Alumno (HU-007, HU-009, HU-010 CA-003).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/logica-alumno.js');

// Octubre 2026: el 1 es jueves; el 3 y 4 son sábado y domingo. "Hoy" = lunes 5.
const HOY = new Date('2026-10-05T10:00:00');

describe('HU-009 — calendario mensual', () => {
  const REGISTROS = [
    { fecha: '2026-10-01', estado: 'presente' },
    { fecha: '2026-10-02', estado: 'ausente' },
    { fecha: '2026-10-05', estado: 'tardanza' }
  ];
  const cal = A.construirCalendarioAsistencia(2026, 9, REGISTROS, HOY);
  const dia = (d) => cal.dias[d - 1];

  test('CA-001: título con mes y año en curso y todos los días del mes', () => {
    assert.equal(cal.titulo, 'Octubre 2026');
    assert.equal(cal.dias.length, 31);
    assert.equal(cal.desfase, 4); // el 1 de octubre de 2026 es jueves
  });

  test('CA-001: días hábiles transcurridos con su estado registrado (incluido hoy)', () => {
    assert.equal(dia(1).tipo, 'presente');
    assert.equal(dia(2).tipo, 'ausente');
    assert.equal(dia(5).tipo, 'tardanza');
  });

  test('CA-002: sábados y domingos son no lectivos aunque tengan registro', () => {
    assert.equal(dia(3).tipo, 'no-lectivo');
    assert.equal(dia(4).tipo, 'no-lectivo');
    const conRegistroEnSabado = A.construirCalendarioAsistencia(2026, 9, [{ fecha: '2026-10-03', estado: 'presente' }], HOY);
    assert.equal(conRegistroEnSabado.dias[2].tipo, 'no-lectivo');
  });

  test('CA-002: el día siguiente a hoy ya es futuro (valor límite)', () => {
    assert.equal(dia(6).tipo, 'futuro');
    assert.equal(dia(30).tipo, 'futuro');
  });

  test('día hábil pasado sin pase de lista: "sin-registro", no un presente inventado', () => {
    const sinNada = A.construirCalendarioAsistencia(2026, 9, [], HOY);
    assert.equal(sinNada.dias[0].tipo, 'sin-registro');
  });

  test('febrero bisiesto y no bisiesto', () => {
    assert.equal(A.construirCalendarioAsistencia(2028, 1, [], HOY).dias.length, 29);
    assert.equal(A.construirCalendarioAsistencia(2026, 1, [], HOY).dias.length, 28);
  });
});

describe('HU-009 CA-003 — indicadores', () => {
  test('cuenta días, faltas y tardanzas; la tardanza cuenta como asistencia', () => {
    const r = A.resumirAsistencia([
      { estado: 'presente' }, { estado: 'presente' }, { estado: 'ausente' }, { estado: 'tardanza' }
    ]);
    assert.deepEqual(r, { diasRegistrados: 4, presentes: 2, faltas: 1, tardanzas: 1, porcentaje: 75 });
  });

  test('sin registros: porcentaje null (sin datos)', () => {
    assert.equal(A.resumirAsistencia([]).porcentaje, null);
  });

  test('ignora estados que no son del ENUM', () => {
    assert.equal(A.resumirAsistencia([{ estado: 'presente' }, { estado: 'otro' }]).diasRegistrados, 1);
  });
});

describe('HU-007 — mis calificaciones', () => {
  test('recalcula promedio y estado con las reglas oficiales', () => {
    const [fila] = A.prepararMisCalificaciones([{ examen1: '10.00', examen2: '12.00', tareas: null, proyecto: null, promedio: '99.00' }]);
    assert.equal(fila.promedio, 11);
    assert.equal(fila.estado, 'Aprobado');
  });

  test('sin notas: "Sin calificar"', () => {
    assert.equal(A.prepararMisCalificaciones([{}])[0].estado, 'Sin calificar');
  });
});

describe('HU-010 CA-003 — estado de mi tarea', () => {
  test('entregada, pendiente o atrasada según mi entrega y la fecha', () => {
    assert.equal(A.estadoDeMiTarea('2026-10-01', true, HOY), 'entregada');
    assert.equal(A.estadoDeMiTarea('2026-10-05', false, HOY), 'pendiente'); // vence hoy: aún a tiempo
    assert.equal(A.estadoDeMiTarea('2026-10-04', false, HOY), 'atrasada');
  });
});

describe('Inicio del alumno — promedio general y puesto en el grupo', () => {
  test('promedioGeneral: media de los periodos calificados, 2 decimales', () => {
    assert.equal(A.promedioGeneral(['14.50', 13, null]), 13.75);
    assert.equal(A.promedioGeneral([11.333, 12]), 11.67);
    assert.equal(A.promedioGeneral([null, '']), null);
  });

  test('lugarEnGrupo: 1 es el mejor; los empates comparten puesto', () => {
    const grupo = [18, 15, 15, 12, null];
    assert.deepEqual(A.lugarEnGrupo(grupo, 18), { puesto: 1, total: 4 });
    assert.deepEqual(A.lugarEnGrupo(grupo, 15), { puesto: 2, total: 4 });
    assert.deepEqual(A.lugarEnGrupo(grupo, 12), { puesto: 4, total: 4 });
  });

  test('lugarEnGrupo: sin promedio propio no hay puesto', () => {
    assert.equal(A.lugarEnGrupo([18, 15], null), null);
  });
});
