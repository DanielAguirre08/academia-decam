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
