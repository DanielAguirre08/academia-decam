/**
 * Pruebas unitarias — Capa de Lógica de Negocio (HU-005, HU-008, HU-010)
 * Se ejecutan con el runner nativo de Node (node:test): `node --test tests/logica-docente.test.js`
 * Esto es posible SOLO porque logica-docente.js no toca el DOM (esa es la prueba real
 * de que "código fácilmente testeable" no es solo una frase del enunciado).
 */
const L = require('../js/logica-docente.js');

const { describe, test } = require('node:test');

function assertEqual(actual, esperado, msg) {
  if (actual !== esperado) {
    throw new Error((msg || '') + ' — esperado: ' + JSON.stringify(esperado) + ', obtenido: ' + JSON.stringify(actual));
  }
}

describe('HU-005 — calcularPromedio / determinarEstado', () => {
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

  test('validarNota: valores límite del rango', () => {
    assertEqual(L.validarNota(0), true);
    assertEqual(L.validarNota(20), true);
    assertEqual(L.validarNota(20.01), false);
    assertEqual(L.validarNota(-0.01), false);
    assertEqual(L.validarNota('0'), true);
    assertEqual(L.validarNota('20.00'), true);
  });

  test('validarNota: máximo 2 decimales (DECIMAL(4,2))', () => {
    assertEqual(L.validarNota(15.5), true);
    assertEqual(L.validarNota(15.55), true);
    assertEqual(L.validarNota(15.555), false);
    assertEqual(L.validarNota('12.345'), false);
  });

  test('validarNota: rechaza tipos y textos que Number() aceptaría', () => {
    assertEqual(L.validarNota(true), false);   // Number(true) === 1
    assertEqual(L.validarNota(false), false);
    assertEqual(L.validarNota(' '), false);     // Number(' ') === 0
    assertEqual(L.validarNota(' 15'), false);
    assertEqual(L.validarNota('1e1'), false);   // Number('1e1') === 10
    assertEqual(L.validarNota('15,5'), false);
    assertEqual(L.validarNota([15]), false);    // Number([15]) === 15
    assertEqual(L.validarNota(NaN), false);
    assertEqual(L.validarNota(Infinity), false);
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
});

describe('HU-006 — Exportar CSV', () => {
  test('CA-001: el archivo empieza con BOM UTF-8 y trae las columnas exactas de la HU', () => {
    const csv = L.exportarCalificacionesCSV([]);
    assertEqual(csv.charCodeAt(0), 0xFEFF);
    assertEqual(csv, '\uFEFF' + 'Nombre,Grupo,Examen 1,Examen 2,Tareas,Proyecto,Promedio,Estado\r\n');
  });

  test('una fila: notas con 2 decimales, vacías si faltan, promedio y estado oficiales', () => {
    const csv = L.exportarCalificacionesCSV([
      { nombreAlumno: 'María Núñez', grupo: '6-A', examen1: '12.50', examen2: 14, tareas: null, proyecto: '' }
    ]);
    assertEqual(csv.split('\r\n')[1], 'María Núñez,6-A,12.50,14.00,,,13.25,Aprobado');
  });

  test('alumno sin notas: promedio vacío y "Sin calificar"', () => {
    const csv = L.exportarCalificacionesCSV([{ nombreAlumno: 'Ana', grupo: '6-A' }]);
    assertEqual(csv.split('\r\n')[1], 'Ana,6-A,,,,,,Sin calificar');
  });

  test('escaparCampoCSV: comas, comillas y saltos de línea van entre comillas (RFC 4180)', () => {
    assertEqual(L.escaparCampoCSV('Pérez, Luis'), '"Pérez, Luis"');
    assertEqual(L.escaparCampoCSV('Luis "Lucho"'), '"Luis ""Lucho"""');
    assertEqual(L.escaparCampoCSV('línea 1\nlínea 2'), '"línea 1\nlínea 2"');
    assertEqual(L.escaparCampoCSV('normal'), 'normal');
  });

  test('escaparCampoCSV: neutraliza fórmulas de Excel (=, +, -, @) solo en textos', () => {
    assertEqual(L.escaparCampoCSV('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assertEqual(L.escaparCampoCSV('@SUMA(A1)'), "'@SUMA(A1)");
    assertEqual(L.escaparCampoCSV(-5), '-5'); // un número negativo no es fórmula
  });

  test('escaparCampoCSV: null/undefined -> vacío; 0 -> "0"', () => {
    assertEqual(L.escaparCampoCSV(null), '');
    assertEqual(L.escaparCampoCSV(undefined), '');
    assertEqual(L.escaparCampoCSV(0), '0');
  });
});

describe('HU-008 — Asistencia', () => {
  test('CA-002: el grupo debe ser un id_seccion entero positivo (vacío, 0, texto o decimal no)', () => {
    assertEqual(L.validarGrupoSeleccionado('1'), true);   // value del <select>
    assertEqual(L.validarGrupoSeleccionado(4), true);     // número en el JSON
    assertEqual(L.validarGrupoSeleccionado(''), false);
    assertEqual(L.validarGrupoSeleccionado(undefined), false);
    assertEqual(L.validarGrupoSeleccionado('0'), false);
    assertEqual(L.validarGrupoSeleccionado(0), false);
    assertEqual(L.validarGrupoSeleccionado(-1), false);
    assertEqual(L.validarGrupoSeleccionado(1.5), false);
    assertEqual(L.validarGrupoSeleccionado('6-A'), false); // etiqueta, no id
    assertEqual(L.validarGrupoSeleccionado('1 OR 1=1'), false);
  });

  test('CA-002: fecha con formato exacto YYYY-MM-DD', () => {
    assertEqual(L.validarFechaAsistencia('2026-09-18'), true);
    assertEqual(L.validarFechaAsistencia(''), false);
    assertEqual(L.validarFechaAsistencia(undefined), false);
    assertEqual(L.validarFechaAsistencia('18/09/2026'), false);
    assertEqual(L.validarFechaAsistencia('2026-9-18'), false);
    assertEqual(L.validarFechaAsistencia('2026-09-18T00:00'), false);
  });

  test('CA-002: fecha que no existe en el calendario es inválida (valores límite)', () => {
    assertEqual(L.validarFechaAsistencia('2026-02-28'), true);
    assertEqual(L.validarFechaAsistencia('2026-02-29'), false); // 2026 no es bisiesto
    assertEqual(L.validarFechaAsistencia('2028-02-29'), true);  // 2028 sí
    assertEqual(L.validarFechaAsistencia('2026-02-31'), false);
    assertEqual(L.validarFechaAsistencia('2026-04-31'), false);
    assertEqual(L.validarFechaAsistencia('2026-13-01'), false);
    assertEqual(L.validarFechaAsistencia('2026-00-10'), false);
    assertEqual(L.validarFechaAsistencia('2026-12-31'), true);
  });

  test('esFechaFutura: hoy no es futuro; mañana sí (valor límite)', () => {
    const hoy = new Date('2026-10-04T23:59:00');
    assertEqual(L.esFechaFutura('2026-10-04', hoy), false);
    assertEqual(L.esFechaFutura('2026-10-03', hoy), false);
    assertEqual(L.esFechaFutura('2026-10-05', hoy), true);
    assertEqual(L.esFechaFutura('2027-01-01', hoy), true);
  });

  test('fechaLocalISO usa la fecha local (no UTC) y rellena con ceros', () => {
    assertEqual(L.fechaLocalISO(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  });

  test('CA-003: marcarAsistenciaTodos marca a todos los ids recibidos', () => {
    const r = L.marcarAsistenciaTodos(['1', '2', '3'], 'presente');
    assertEqual(r.length, 3);
    assertEqual(r[0].estado, 'presente');
    assertEqual(r[1].id_alumno, '2');
  });

  test('validarEstadoAsistencia solo acepta los 3 valores del ENUM', () => {
    assertEqual(L.validarEstadoAsistencia('presente'), true);
    assertEqual(L.validarEstadoAsistencia('ausente'), true);
    assertEqual(L.validarEstadoAsistencia('tardanza'), true);
    assertEqual(L.validarEstadoAsistencia('tarde'), false);
    assertEqual(L.validarEstadoAsistencia('Presente'), false);
    assertEqual(L.validarEstadoAsistencia(undefined), false);
  });

  const GRUPO = [1, 2, 3];

  test('CA-003: pase de lista completo y correcto es válido', () => {
    const r = L.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'presente' },
      { id_alumno: '2', estado: 'ausente' },
      { id_alumno: 3, estado: 'tardanza' }
    ], GRUPO);
    assertEqual(r.valido, true);
    assertEqual(r.errores.length, 0);
  });

  test('CA-003: lista vacía o que no es lista es inválida', () => {
    assertEqual(L.validarRegistrosAsistencia([], GRUPO).valido, false);
    assertEqual(L.validarRegistrosAsistencia(undefined, GRUPO).valido, false);
    assertEqual(L.validarRegistrosAsistencia({ id_alumno: 1 }, GRUPO).valido, false);
  });

  test('CA-003: rechaza al alumno que no pertenece al grupo', () => {
    const r = L.validarRegistrosAsistencia([{ id_alumno: 1, estado: 'presente' }, { id_alumno: 99, estado: 'presente' }], GRUPO);
    assertEqual(r.valido, false);
    assertEqual(r.errores.length, 1);
    assertEqual(r.errores[0], 'Fila 2: el alumno 99 no pertenece a este grupo');
  });

  test('CA-003: rechaza al alumno repetido (el último no puede pisar al primero en silencio)', () => {
    const r = L.validarRegistrosAsistencia([{ id_alumno: 1, estado: 'presente' }, { id_alumno: 1, estado: 'ausente' }], GRUPO);
    assertEqual(r.valido, false);
    assertEqual(r.errores[0], 'Fila 2: el alumno 1 está repetido');
  });

  test('CA-003: rechaza estado inválido e id de alumno inválido, y junta todos los errores', () => {
    const r = L.validarRegistrosAsistencia([
      { id_alumno: 1, estado: 'tarde' },
      { id_alumno: 'abc', estado: 'presente' },
      null
    ], GRUPO);
    assertEqual(r.valido, false);
    assertEqual(r.errores.length, 3);
  });

  test('calcularPorcentajeAsistencia: la tardanza cuenta como asistencia y redondea', () => {
    assertEqual(L.calcularPorcentajeAsistencia(18, 2, 20), 100);
    assertEqual(L.calcularPorcentajeAsistencia(15, 0, 20), 75);
    assertEqual(L.calcularPorcentajeAsistencia(2, 0, 3), 67);
    assertEqual(L.calcularPorcentajeAsistencia('10', '5', '20'), 75); // MySQL devuelve SUM() como texto
  });

  test('calcularPorcentajeAsistencia: sin días registrados es null (sin datos), no 100%', () => {
    assertEqual(L.calcularPorcentajeAsistencia(0, 0, 0), null);
    assertEqual(L.calcularPorcentajeAsistencia(null, null, null), null);
  });
});

describe('HU-010 — Tareas', () => {
  const HOY = new Date('2026-10-04T10:00:00');
  const TAREA = { titulo: 'Practica 1', id_seccion: '1', fecha_entrega: '2026-12-01', tipo: 'Tarea' };
  const con = (cambios) => Object.assign({}, TAREA, cambios);

  test('CA-001: tarea completa sí es válida', () => {
    const r = L.revisarTarea(TAREA, HOY);
    assertEqual(r.valido, true);
    assertEqual(r.errores.length, 0);
  });

  test('CA-001: una tarea sin grupo, sin título o sin fecha no es válida', () => {
    assertEqual(L.revisarTarea(con({ id_seccion: undefined }), HOY).valido, false);
    assertEqual(L.revisarTarea(con({ id_seccion: '6-A' }), HOY).valido, false); // etiqueta, no id
    assertEqual(L.revisarTarea(con({ titulo: '   ' }), HOY).valido, false);
    assertEqual(L.revisarTarea(con({ titulo: 123 }), HOY).valido, false);
    assertEqual(L.revisarTarea(con({ fecha_entrega: '' }), HOY).valido, false);
    assertEqual(L.revisarTarea(undefined, HOY).errores.length, 3);
  });

  test('CA-001: fecha límite — hoy sí, ayer no, inexistente no (valores límite)', () => {
    assertEqual(L.revisarTarea(con({ fecha_entrega: '2026-10-04' }), HOY).valido, true);
    assertEqual(L.revisarTarea(con({ fecha_entrega: '2026-10-03' }), HOY).errores[0], 'La fecha límite no puede ser anterior a hoy');
    assertEqual(L.revisarTarea(con({ fecha_entrega: '2026-11-31' }), HOY).valido, false);
  });

  test('CA-001: longitudes de TAREA (título 100, descripción 300) en el límite exacto', () => {
    assertEqual(L.revisarTarea(con({ titulo: 'x'.repeat(100) }), HOY).valido, true);
    assertEqual(L.revisarTarea(con({ titulo: 'x'.repeat(101) }), HOY).valido, false);
    assertEqual(L.revisarTarea(con({ descripcion: 'x'.repeat(300) }), HOY).valido, true);
    assertEqual(L.revisarTarea(con({ descripcion: 'x'.repeat(301) }), HOY).valido, false);
    assertEqual(L.revisarTarea(con({ descripcion: { a: 1 } }), HOY).valido, false);
  });

  test('CA-001: tipo opcional, pero si viene debe ser uno de los 4', () => {
    assertEqual(L.revisarTarea(con({ tipo: undefined }), HOY).valido, true);
    assertEqual(L.revisarTarea(con({ tipo: 'Laboratorio' }), HOY).valido, false);
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
});

describe('Inicio del docente — día del horario', () => {
  test('diaDeHorario: lunes a viernes como en HORARIO.dia_semana; fin de semana sin clases', () => {
    assertEqual(L.diaDeHorario(new Date(2026, 9, 5)), 'Lunes');
    assertEqual(L.diaDeHorario(new Date(2026, 9, 7)), 'Miercoles'); // sin tilde, como en la BD
    assertEqual(L.diaDeHorario(new Date(2026, 9, 9)), 'Viernes');
    assertEqual(L.diaDeHorario(new Date(2026, 9, 10)), null);       // sábado
    assertEqual(L.diaDeHorario(new Date(2026, 9, 11)), null);       // domingo
  });
});

describe('Consultas del docente — horario y desempeño', () => {
  test('organizarHorario: grilla día x hora ordenada', () => {
    const g = L.organizarHorario([
      { dia_semana: 'Martes', hora_inicio: '08:30', curso: 'Comunicación' },
      { dia_semana: 'Lunes', hora_inicio: '07:00', curso: 'Matemática' }
    ]);
    assertEqual(g.dias.join(','), 'Lunes,Martes,Miercoles,Jueves,Viernes');
    assertEqual(g.horas.join(','), '07:00,08:30');
    assertEqual(g.celdas['Lunes|07:00'].curso, 'Matemática');
    assertEqual(g.celdas['Lunes|08:30'], undefined);
  });

  test('etiquetaDesempeno: valores límite 18, 16 y 11', () => {
    assertEqual(L.etiquetaDesempeno(18), 'Excelente');
    assertEqual(L.etiquetaDesempeno(17.99), 'Bien');
    assertEqual(L.etiquetaDesempeno(16), 'Bien');
    assertEqual(L.etiquetaDesempeno(15.99), 'Regular');
    assertEqual(L.etiquetaDesempeno(11), 'Regular');
    assertEqual(L.etiquetaDesempeno(10.99), 'En riesgo');
    assertEqual(L.etiquetaDesempeno(null), 'Sin datos');
  });
});
