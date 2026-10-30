/**
 * Pruebas unitarias — Capa de Lógica de comunicación (HU-011 Reclamos, HU-012 Avisos).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/logica-comunicacion.js');

describe('HU-011 — Reclamos', () => {
  const OK = { asunto: 'Error en mi nota', descripcion: 'Mi examen 2 figura con 13.', tipo: 'calificacion', prioridad: 'alta' };
  const con = (cambios) => Object.assign({}, OK, cambios);

  test('reclamo completo es válido; tipo y prioridad son opcionales', () => {
    assert.deepEqual(C.revisarReclamo(OK), { valido: true, errores: [] });
    assert.equal(C.revisarReclamo({ asunto: 'A', descripcion: 'B' }).valido, true);
  });

  test('CA-002: sin asunto o sin descripción -> el mensaje de la HU', () => {
    for (const cambios of [{ asunto: '' }, { asunto: '   ' }, { descripcion: '' }, { asunto: undefined }]) {
      assert.deepEqual(C.revisarReclamo(con(cambios)).errores, ['Completa los campos obligatorios']);
    }
  });

  test('longitudes del esquema en el límite exacto (asunto 120, descripción 500)', () => {
    assert.equal(C.revisarReclamo(con({ asunto: 'x'.repeat(120) })).valido, true);
    assert.equal(C.revisarReclamo(con({ asunto: 'x'.repeat(121) })).valido, false);
    assert.equal(C.revisarReclamo(con({ descripcion: 'x'.repeat(500) })).valido, true);
    assert.equal(C.revisarReclamo(con({ descripcion: 'x'.repeat(501) })).valido, false);
  });

  test('tipo y prioridad fuera de la lista son inválidos', () => {
    assert.equal(C.revisarReclamo(con({ tipo: 'queja' })).valido, false);
    assert.equal(C.revisarReclamo(con({ prioridad: 'baja' })).valido, false);
  });

  test('CA-003: secuencia Pendiente -> En revisión -> Resuelto, sin volver a empezar', () => {
    assert.equal(C.siguienteEstadoReclamo('pendiente'), 'revision');
    assert.equal(C.siguienteEstadoReclamo('revision'), 'resuelto');
    assert.equal(C.siguienteEstadoReclamo('resuelto'), null);
    assert.equal(C.siguienteEstadoReclamo('otro'), null);
  });

  test('CA-003: etiquetas y filtro por estado', () => {
    assert.equal(C.etiquetaEstadoReclamo('revision'), 'En revisión');
    const lista = [{ estado: 'pendiente' }, { estado: 'resuelto' }, { estado: 'pendiente' }];
    assert.equal(C.filtrarReclamos(lista, 'pendiente').length, 2);
    assert.equal(C.filtrarReclamos(lista, 'all').length, 3);
  });
});

describe('HU-012 — Avisos', () => {
  test('CA-001: título y contenido obligatorios', () => {
    assert.equal(C.revisarAviso({ titulo: 'Simulacro', contenido: 'Mañana a las 10.' }).valido, true);
    assert.deepEqual(C.revisarAviso({}).errores, ['El título del aviso es obligatorio', 'El contenido del aviso es obligatorio']);
  });

  test('longitudes (120 / 500) y destinatarios de la lista', () => {
    assert.equal(C.revisarAviso({ titulo: 'x'.repeat(121), contenido: 'y' }).valido, false);
    assert.equal(C.revisarAviso({ titulo: 'x', contenido: 'y'.repeat(501) }).valido, false);
    assert.equal(C.revisarAviso({ titulo: 'x', contenido: 'y', destinatarios: 'apoderados' }).valido, false);
    assert.equal(C.revisarAviso({ titulo: 'x', contenido: 'y', destinatarios: 'docentes' }).valido, true);
  });

  test('CA-001: cada rol ve los avisos que le corresponden', () => {
    assert.deepEqual(C.destinatariosVisibles('alumno'), ['todos', 'alumnos']);
    assert.deepEqual(C.destinatariosVisibles('docente'), ['todos', 'docentes']);
    assert.deepEqual(C.destinatariosVisibles('jefe_academico'), ['todos', 'docentes', 'alumnos']);
    assert.deepEqual(C.destinatariosVisibles('registrador'), ['todos', 'docentes', 'alumnos']);
  });
});

describe('Mensajes', () => {
  test('mensaje válido', () => {
    assert.equal(C.revisarMensaje({ para: 'jefe@acadecam.edu.pe', contenido: 'Hola' }, 'prof@acadecam.edu.pe').valido, true);
  });

  test('destinatario obligatorio, con formato y distinto de uno mismo', () => {
    assert.equal(C.revisarMensaje({ contenido: 'Hola' }).errores[0], 'Elige al menos un destinatario');
    assert.equal(C.revisarMensaje({ para: 'jefe', contenido: 'Hola' }).errores[0], 'El correo del destinatario no es válido');
    assert.equal(C.revisarMensaje({ para: 'PROF@acadecam.edu.pe', contenido: 'Hola' }, 'prof@acadecam.edu.pe').errores[0], 'No puedes enviarte un mensaje a ti mismo');
  });

  test('HU-013: lista de id_usuario de 1 a 20, enteros positivos y sin uno mismo', () => {
    assert.equal(C.revisarMensaje({ para: [1, '4'], contenido: 'Hola' }, 'jefe@acadecam.edu.pe', 2).valido, true);
    assert.equal(C.revisarMensaje({ para: [], contenido: 'Hola' }).errores[0], 'Elige al menos un destinatario');
    for (const malo of [0, -1, 1.5, 'abc', '', null, {}, 2147483648]) {
      assert.equal(C.revisarMensaje({ para: [malo], contenido: 'Hola' }).errores[0], 'Algún destinatario no es válido', String(malo));
    }
    assert.equal(C.revisarMensaje({ para: [4, '2'], contenido: 'Hola' }, null, 2).errores[0], 'No puedes enviarte un mensaje a ti mismo');
  });

  test('HU-013: máximo 20 destinatarios DISTINTOS (valores límite)', () => {
    const veinte = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(C.revisarMensaje({ para: veinte, contenido: 'Hola' }).valido, true);
    assert.equal(C.revisarMensaje({ para: veinte.concat(1, 2), contenido: 'Hola' }).valido, true, 'los repetidos no cuentan');
    assert.equal(C.revisarMensaje({ para: veinte.concat(21), contenido: 'Hola' }).errores[0], 'Puedes escribir a 20 destinatarios como máximo');
  });

  test('HU-013: destinatariosUnicos quita repetidos y conserva el orden', () => {
    assert.deepEqual(C.destinatariosUnicos([107, '4', 107, 4, 101]), [107, 4, 101]);
    assert.deepEqual(C.destinatariosUnicos(undefined), []);
  });

  test('contenido de 1 a 1000 caracteres (valores límite)', () => {
    assert.equal(C.revisarMensaje({ para: 'a@b.pe', contenido: '   ' }).valido, false);
    assert.equal(C.revisarMensaje({ para: 'a@b.pe', contenido: 'x'.repeat(1000) }).valido, true);
    assert.equal(C.revisarMensaje({ para: 'a@b.pe', contenido: 'x'.repeat(1001) }).valido, false);
  });
});

describe('HU-013 — Buscador de destinatarios', () => {
  test('palabrasDeBusqueda: sin espacios de más; [] con menos de 2 caracteres', () => {
    assert.deepEqual(C.palabrasDeBusqueda('  ana   TOR '), ['ana', 'TOR']);
    assert.deepEqual(C.palabrasDeBusqueda('an'), ['an']);
    assert.deepEqual(C.palabrasDeBusqueda(' a '), []);
    assert.deepEqual(C.palabrasDeBusqueda(undefined), []);
    assert.deepEqual(C.palabrasDeBusqueda(['ana']), [], 'un ?q= repetido llega como arreglo');
  });

  test('palabrasDeBusqueda: como máximo 4 palabras y 60 caracteres', () => {
    assert.deepEqual(C.palabrasDeBusqueda('a b c d e f'), ['a', 'b', 'c', 'd']);
    assert.equal(C.palabrasDeBusqueda('x'.repeat(100))[0].length, 60);
    assert.equal(Array.from(C.palabrasDeBusqueda('😀'.repeat(100))[0]).length, 60, 'no parte un emoji por la mitad');
  });

  test('detalleDestinatario: rol y, si corresponde, especialidad o grupo', () => {
    assert.equal(C.detalleDestinatario({ rol: 'docente', especialidad: 'Matemática' }), 'Docente · Matemática');
    assert.equal(C.detalleDestinatario({ rol: 'alumno', grupo: '6-A' }), 'Alumno · 6-A');
    assert.equal(C.detalleDestinatario({ rol: 'alumno', grupo: null }), 'Alumno');
    assert.equal(C.detalleDestinatario({ rol: 'jefe_academico' }), 'Jefe Académico');
    assert.equal(C.detalleDestinatario({ rol: 'registrador', especialidad: 'x' }), 'Registrador');
  });
});

describe('Largo en caracteres (como VARCHAR de MySQL), no en unidades UTF-16', () => {
  test('1000 emoji caben en MENSAJE.contenido VARCHAR(1000); 1001 no', () => {
    assert.equal(C.revisarMensaje({ para: 'a@b.pe', contenido: '😀'.repeat(1000) }).valido, true);
    assert.equal(C.revisarMensaje({ para: 'a@b.pe', contenido: '😀'.repeat(1001) }).valido, false);
  });

  test('120 emoji caben en el asunto del reclamo', () => {
    assert.equal(C.revisarReclamo({ asunto: '📚'.repeat(120), descripcion: 'x' }).valido, true);
  });
});
