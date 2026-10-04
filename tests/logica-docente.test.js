/**
 * Pruebas unitarias — Capa de Lógica de Negocio (HU-005, HU-008, HU-010)
 * Se ejecutan con Node, sin frameworks externos: `node tests/logica-docente.test.js`
 * Esto es posible SOLO porque logica-docente.js no toca el DOM (esa es la prueba real
 * de que "código fácilmente testeable" no es solo una frase del enunciado).
 */
const L = require('../js/logica-docente.js');

let pasadas = 0, fallidas = 0;

function test(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log('  \u2713 ' + nombre);
  } catch (e) {
    fallidas++;
    console.log('  \u2717 ' + nombre + '\n      ' + e.message);
  }
}

function assertEqual(actual, esperado, msg) {
  if (actual !== esperado) {
    throw new Error((msg || '') + ' — esperado: ' + JSON.stringify(esperado) + ', obtenido: ' + JSON.stringify(actual));
  }
}

// ---------------------------------------------------------------
console.log('\nHU-005 — calcularPromedio / determinarEstado');
// ---------------------------------------------------------------

test('promedio con las 4 notas completas', () => {
  assertEqual(L.calcularPromedio({ examen1: 10, examen2: 14, tareas: 16, proyecto: 18 }), 14.5);
});

test('promedio ignora notas aún no registradas (no las trata como 0)', () => {
  assertEqual(L.calcularPromedio({ examen1: 12, examen2: null, tareas: '', proyecto: undefined }), 12);
});

test('promedio con 2 decimales exactos (no redondea a entero)', () => {
  assertEqual(L.calcularPromedio({ examen1: 11, examen2: 12, tareas: 13 }), 12);
  assertEqual(L.calcularPromedio({ examen1: 10, examen2: 11 }), 10.5);
});

test('promedio null si no hay ninguna nota', () => {
  assertEqual(L.calcularPromedio({}), null);
});

test('CA-001: 11.00 exacto es Aprobado (no Desaprobado)', () => {
  assertEqual(L.determinarEstado(11.0), 'Aprobado');
});

test('CA-001: 10.99 es Desaprobado', () => {
  assertEqual(L.determinarEstado(10.99), 'Desaprobado');
});

test('CA-001: 20 es Aprobado, 0 es Desaprobado', () => {
  assertEqual(L.determinarEstado(20), 'Aprobado');
  assertEqual(L.determinarEstado(0), 'Desaprobado');
});

test('sin notas registradas -> "Sin calificar", no "Desaprobado"', () => {
  assertEqual(L.determinarEstado(null), 'Sin calificar');
});

test('validarNota rechaza fuera de rango 0-20', () => {
  assertEqual(L.validarNota(21), false);
  assertEqual(L.validarNota(-1), false);
  assertEqual(L.validarNota(20), true);
  assertEqual(L.validarNota(''), true); // aún no registrada, no es un error
});

test('CA-003: filtrarCalificaciones combina grupo + estado + nombre', () => {
  const datos = [
    { id_seccion: '6-A', promedio: 15, nombreAlumno: 'Ana Torres' },
    { id_seccion: '6-A', promedio: 8, nombreAlumno: 'Luis Perez' },
    { id_seccion: '6-B', promedio: 16, nombreAlumno: 'Ana Ramos' },
  ];
  assertEqual(L.filtrarCalificaciones(datos, { grupo: '6-A' }).length, 2);
  assertEqual(L.filtrarCalificaciones(datos, { estado: 'aprobado' }).length, 2);
  assertEqual(L.filtrarCalificaciones(datos, { busqueda: 'ana' }).length, 2);
  assertEqual(L.filtrarCalificaciones(datos, { grupo: '6-A', estado: 'desaprobado' }).length, 1);
});

// ---------------------------------------------------------------
console.log('\nHU-008 — Asistencia');
// ---------------------------------------------------------------

test('CA-002: no se valida un grupo vacío', () => {
  assertEqual(L.validarGrupoSeleccionado(''), false);
  assertEqual(L.validarGrupoSeleccionado('6-A'), true);
});

test('CA-002: valida formato de fecha', () => {
  assertEqual(L.validarFechaAsistencia('2026-09-18'), true);
  assertEqual(L.validarFechaAsistencia(''), false);
});

test('CA-003: marcarAsistenciaTodos marca a todos los ids recibidos', () => {
  const r = L.marcarAsistenciaTodos(['1', '2', '3'], 'presente');
  assertEqual(r.length, 3);
  assertEqual(r[0].estado, 'presente');
  assertEqual(r[1].id_alumno, '2');
});

test('validarEstadoAsistencia solo acepta los 3 valores del ENUM', () => {
  assertEqual(L.validarEstadoAsistencia('presente'), true);
  assertEqual(L.validarEstadoAsistencia('tarde'), false);
});

// ---------------------------------------------------------------
console.log('\nHU-010 — Tareas');
// ---------------------------------------------------------------

test('CA-001: una tarea sin grupo no es válida', () => {
  assertEqual(L.validarTarea({ titulo: 'Practica 1', fecha_entrega: '2026-12-01' }), false);
});

test('CA-001: tarea completa sí es válida', () => {
  assertEqual(L.validarTarea({ titulo: 'Practica 1', id_seccion: '6-A', fecha_entrega: '2026-12-01' }), true);
});

test('determinarEstadoEntrega: fecha límite futura -> pendiente', () => {
  const hoy = new Date('2026-09-18T10:00:00');
  assertEqual(L.determinarEstadoEntrega('2026-09-20', false, hoy), 'pendiente');
});

test('determinarEstadoEntrega: fecha límite pasada y sin entrega -> atrasada', () => {
  const hoy = new Date('2026-09-18T10:00:00');
  assertEqual(L.determinarEstadoEntrega('2026-09-10', false, hoy), 'atrasada');
});

test('determinarEstadoEntrega: si ya se entregó, siempre es "entregada" (aunque esté vencida)', () => {
  const hoy = new Date('2026-09-18T10:00:00');
  assertEqual(L.determinarEstadoEntrega('2026-09-10', true, hoy), 'entregada');
});

test('validarTipoTarea acepta los 4 tipos del selector y rechaza cualquier otro', () => {
  ['Tarea', 'Examen', 'Proyecto', 'Exposición'].forEach((t) => assertEqual(L.validarTipoTarea(t), true, t));
  assertEqual(L.validarTipoTarea('Laboratorio'), false);
  assertEqual(L.validarTipoTarea(undefined), false);
  assertEqual(L.validarTipoTarea(''), false);
});

test('CA-002: filtrarTareasPorEstado', () => {
  const tareas = [{ status: 'pending' }, { status: 'late' }, { status: 'done' }, { status: 'late' }];
  assertEqual(L.filtrarTareasPorEstado(tareas, 'late').length, 2);
  assertEqual(L.filtrarTareasPorEstado(tareas, 'all').length, 4);
});

// ---------------------------------------------------------------
console.log('\n' + pasadas + ' pruebas pasadas, ' + fallidas + ' fallidas.\n');
process.exit(fallidas > 0 ? 1 : 0);
