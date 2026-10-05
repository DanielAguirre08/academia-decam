/**
 * Pruebas unitarias — Capa de Lógica del Registrador (HU-002, HU-003, HU-004).
 * La fecha "hoy" se fija en cada prueba (la lógica no lee el reloj).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/logica-registro.js');

const HOY = new Date('2026-10-05T10:00:00');

describe('Validaciones de datos personales', () => {
  test('validarDni: exactamente 8 dígitos (valores límite)', () => {
    assert.equal(R.validarDni('70000001'), true);
    assert.equal(R.validarDni('7000000'), false);    // 7
    assert.equal(R.validarDni('700000011'), false);  // 9
    assert.equal(R.validarDni('7000000a'), false);
    assert.equal(R.validarDni(70000001), false);     // número, no texto
    assert.equal(R.validarDni(''), false);
  });

  test('validarCorreo: mismo patrón que el CHECK y máximo 100 caracteres', () => {
    assert.equal(R.validarCorreo('ana.torres@acadecam.edu.pe'), true);
    assert.equal(R.validarCorreo('sin-arroba.pe'), false);
    assert.equal(R.validarCorreo('a b@x.pe'), false);
    assert.equal(R.validarCorreo('a@sinpunto'), false);
    assert.equal(R.validarCorreo('a'.repeat(95) + '@x.pe'), true);   // 100
    assert.equal(R.validarCorreo('a'.repeat(96) + '@x.pe'), false);  // 101
  });

  test('normalizarTelefono: acepta espacios y guiones, guarda solo dígitos y +', () => {
    assert.equal(R.normalizarTelefono('+51 999 999 999'), '+51999999999');
    assert.equal(R.normalizarTelefono('999-000-111'), '999000111');
    assert.equal(R.normalizarTelefono('12345'), null);       // muy corto
    assert.equal(R.normalizarTelefono('99900011a'), null);
    assert.equal(R.normalizarTelefono(undefined), null);
  });

  test('separarNombreCompleto: 2, 3 y 4 palabras; 1 palabra no alcanza', () => {
    assert.deepEqual(R.separarNombreCompleto('Ana Torres'), { nombres: 'Ana', apellidos: 'Torres' });
    assert.deepEqual(R.separarNombreCompleto('Luis Pérez Cárdenas'), { nombres: 'Luis', apellidos: 'Pérez Cárdenas' });
    assert.deepEqual(R.separarNombreCompleto('  Ana   María Torres  Medina '), { nombres: 'Ana María', apellidos: 'Torres Medina' });
    assert.equal(R.separarNombreCompleto('Ana'), null);
    assert.equal(R.separarNombreCompleto(''), null);
  });

  test('edadEn: cumple años el mismo día, no un día antes', () => {
    assert.equal(R.edadEn('2016-10-05', HOY), 10);
    assert.equal(R.edadEn('2016-10-06', HOY), 9);
  });
});

describe('HU-003 CA-002 — grados según el nivel', () => {
  test('Primaria 1-6, Secundaria 1-5, sin nivel ninguno', () => {
    assert.deepEqual(R.gradosPorNivel('Primaria'), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(R.gradosPorNivel('Secundaria'), [1, 2, 3, 4, 5]);
    assert.deepEqual(R.gradosPorNivel(''), []);
  });

  test('validarGradoDeNivel: 6.° de Secundaria no existe (valor límite)', () => {
    assert.equal(R.validarGradoDeNivel('Primaria', '6'), true);
    assert.equal(R.validarGradoDeNivel('Secundaria', 5), true);
    assert.equal(R.validarGradoDeNivel('Secundaria', '6'), false);
    assert.equal(R.validarGradoDeNivel('Primaria', '0'), false);
    assert.equal(R.validarGradoDeNivel('Primaria', '1.5'), false);
  });
});

describe('HU-002 — revisarRegistro', () => {
  const ALUMNO = {
    tipo: 'alumno', nombre: 'Rosa Lima Paz', dni: '71000001', fecha_nacimiento: '2015-03-10', sexo: 'F',
    nivel: 'Primaria', grado: '5', seccion: 'A', apoderado_nombre: 'Carmen Paz Ríos', apoderado_dni: '41000001'
  };
  const con = (base, cambios) => Object.assign({}, base, cambios);

  test('CA-003: sin nombre el único error es "El nombre es obligatorio"', () => {
    assert.deepEqual(R.revisarRegistro({ tipo: 'alumno', nombre: '   ' }, HOY), { valido: false, errores: ['El nombre es obligatorio'] });
  });

  test('CA-001: alumno completo es válido; grado y sección son opcionales pero van juntos', () => {
    assert.equal(R.revisarRegistro(ALUMNO, HOY).valido, true);
    assert.equal(R.revisarRegistro(con(ALUMNO, { grado: '', seccion: '' }), HOY).valido, true);
    assert.equal(R.revisarRegistro(con(ALUMNO, { seccion: '' }), HOY).valido, false);
    assert.equal(R.revisarRegistro(con(ALUMNO, { nivel: 'Secundaria', grado: '6' }), HOY).valido, false);
  });

  test('CA-002: los campos de alumno solo se exigen para el tipo alumno', () => {
    const docente = { tipo: 'docente', nombre: 'Pedro Soto Vela', dni: '10000099', correo: 'pedro.soto@acadecam.edu.pe' };
    assert.equal(R.revisarRegistro(docente, HOY).valido, true);
    const apoderado = { tipo: 'apoderado', nombre: 'Julia Vela', dni: '41000099', telefono: '999111222' };
    assert.equal(R.revisarRegistro(apoderado, HOY).valido, true);
  });

  test('alumno: fecha de nacimiento, sexo, nivel y apoderado son obligatorios', () => {
    const r = R.revisarRegistro({ tipo: 'alumno', nombre: 'Rosa Lima', dni: '71000001' }, HOY);
    assert.equal(r.valido, false);
    for (const esperado of ['La fecha de nacimiento no es válida', 'Selecciona el sexo', 'Selecciona el nivel',
      'El nombre del apoderado es obligatorio', 'El DNI del apoderado debe tener 8 dígitos']) {
      assert.ok(r.errores.includes(esperado), esperado);
    }
  });

  test('alumno: edad entre 3 y 20 años (valores límite)', () => {
    assert.equal(R.revisarRegistro(con(ALUMNO, { fecha_nacimiento: '2023-10-05' }), HOY).valido, true);  // 3 justos
    assert.equal(R.revisarRegistro(con(ALUMNO, { fecha_nacimiento: '2023-10-06' }), HOY).valido, false); // 2
    assert.equal(R.revisarRegistro(con(ALUMNO, { fecha_nacimiento: '2006-10-06' }), HOY).valido, true);  // 19 años, 364 días
    assert.equal(R.revisarRegistro(con(ALUMNO, { fecha_nacimiento: '2005-10-05' }), HOY).valido, false); // 21
    assert.equal(R.revisarRegistro(con(ALUMNO, { fecha_nacimiento: '2015-02-30' }), HOY).valido, false); // no existe
  });

  test('docente: el correo es obligatorio (necesita cuenta para entrar)', () => {
    const r = R.revisarRegistro({ tipo: 'docente', nombre: 'Pedro Soto', dni: '10000099' }, HOY);
    assert.deepEqual(r.errores, ['El correo institucional del docente es obligatorio']);
  });

  test('apoderado: teléfono obligatorio; admite un solo nombre largo de hasta 120', () => {
    assert.ok(R.revisarRegistro({ tipo: 'apoderado', nombre: 'Julia Vela', dni: '41000099' }, HOY)
      .errores.includes('El teléfono del apoderado es obligatorio'));
    assert.equal(R.revisarRegistro({ tipo: 'apoderado', nombre: 'x'.repeat(121), dni: '41000099', telefono: '999111222' }, HOY).valido, false);
  });

  test('tipo inválido, nombre de una palabra y nombres de más de 60 caracteres', () => {
    assert.ok(R.revisarRegistro(con(ALUMNO, { tipo: 'administrativo' }), HOY).errores.includes('Selecciona el tipo de persona'));
    assert.ok(R.revisarRegistro(con(ALUMNO, { nombre: 'Rosa' }), HOY).errores.includes('Ingresa nombres y apellidos'));
    assert.equal(R.revisarRegistro(con(ALUMNO, { nombre: 'Rosa ' + 'x'.repeat(61) }), HOY).valido, false);
  });
});

describe('HU-003 — revisarMatricula', () => {
  const MAT = {
    nombre: 'Rosa Lima Paz', dni: '71000001', nivel: 'Primaria', grado: '6', seccion: 'A', anio_lectivo: '2026',
    apoderado_nombre: 'Carmen Paz', apoderado_dni: '41000001', procedencia: 'nuevo'
  };
  const con = (cambios) => Object.assign({}, MAT, cambios);

  test('matrícula completa es válida', () => {
    assert.deepEqual(R.revisarMatricula(MAT, HOY), { valido: true, errores: [] });
  });

  test('CA-003: falta cualquier campo (*) -> el mensaje exacto de la HU', () => {
    for (const campo of ['nombre', 'dni', 'nivel', 'grado', 'seccion', 'apoderado_nombre', 'apoderado_dni']) {
      assert.deepEqual(R.revisarMatricula(con({ [campo]: '' }), HOY).errores, ['Los campos marcados con (*) son obligatorios'], campo);
    }
  });

  test('CA-002: el grado debe corresponder al nivel', () => {
    assert.equal(R.revisarMatricula(con({ nivel: 'Secundaria', grado: '6' }), HOY).valido, false);
  });

  test('año lectivo: actual-1 a actual+1 (valores límite)', () => {
    assert.equal(R.revisarMatricula(con({ anio_lectivo: '2025' }), HOY).valido, true);
    assert.equal(R.revisarMatricula(con({ anio_lectivo: '2027' }), HOY).valido, true);
    assert.equal(R.revisarMatricula(con({ anio_lectivo: '2024' }), HOY).valido, false);
    assert.equal(R.revisarMatricula(con({ anio_lectivo: '2028' }), HOY).valido, false);
    assert.equal(R.revisarMatricula(con({ anio_lectivo: '26' }), HOY).valido, false);
  });

  test('procedencia, turno, observaciones y fecha de nacimiento opcionales pero válidos si vienen', () => {
    assert.equal(R.revisarMatricula(con({ procedencia: 'otro' }), HOY).valido, false);
    assert.equal(R.revisarMatricula(con({ turno: 'Noche' }), HOY).valido, false); // SECCION.turno no tiene Noche
    assert.equal(R.revisarMatricula(con({ observaciones: 'x'.repeat(201) }), HOY).valido, false);
    assert.equal(R.revisarMatricula(con({ fecha_nacimiento: '2030-01-01' }), HOY).valido, false);
  });
});

describe('HU-003 CA-001 — código correlativo MAT-0001', () => {
  test('formatearCodigoMatricula: relleno a 4 dígitos y límites del CHECK', () => {
    assert.equal(R.formatearCodigoMatricula(1), 'MAT-0001');
    assert.equal(R.formatearCodigoMatricula(9999), 'MAT-9999');
    assert.equal(R.formatearCodigoMatricula(10000), 'MAT-10000');
    assert.equal(R.formatearCodigoMatricula(999999), 'MAT-999999');
    assert.equal(R.formatearCodigoMatricula(1000000), null);
    assert.equal(R.formatearCodigoMatricula(0), null);
  });

  test('siguienteCodigoMatricula: sigue al mayor, ignora códigos mal formados', () => {
    assert.equal(R.siguienteCodigoMatricula([]), 'MAT-0001');
    assert.equal(R.siguienteCodigoMatricula(['MAT-0003', 'MAT-0015', 'MAT-0009']), 'MAT-0016');
    assert.equal(R.siguienteCodigoMatricula(['MAT-0015', 'basura', null]), 'MAT-0016');
  });

  test('numeroDeCodigo', () => {
    assert.equal(R.numeroDeCodigo('MAT-0042'), 42);
    assert.equal(R.numeroDeCodigo('MAT-42'), null);
  });
});

describe('HU-004 — estado, búsqueda y filtro de matrículas', () => {
  const LISTA = [
    { codigo: 'MAT-0001', nombreAlumno: 'Ana Torres', dni: '70000001', seccion: '6-A', estado: 'activa' },
    { codigo: 'MAT-0009', nombreAlumno: 'Mateo Castro', dni: '70000009', seccion: '5-A', estado: 'inactiva' }
  ];

  test('CA-002: alterna activa <-> inactiva', () => {
    assert.equal(R.alternarEstadoMatricula('activa'), 'inactiva');
    assert.equal(R.alternarEstadoMatricula('inactiva'), 'activa');
    assert.equal(R.alternarEstadoMatricula('pendiente'), null);
  });

  test('CA-001: filtra por estado', () => {
    assert.deepEqual(R.filtrarMatriculas(LISTA, { estado: 'activa' }).map((m) => m.codigo), ['MAT-0001']);
    assert.equal(R.filtrarMatriculas(LISTA, { estado: 'all' }).length, 2);
  });

  test('busca por nombre, DNI, código o sección', () => {
    assert.equal(R.filtrarMatriculas(LISTA, { busqueda: 'mateo' }).length, 1);
    assert.equal(R.filtrarMatriculas(LISTA, { busqueda: '70000001' }).length, 1);
    assert.equal(R.filtrarMatriculas(LISTA, { busqueda: 'MAT-0009' }).length, 1);
    assert.equal(R.filtrarMatriculas(LISTA, { busqueda: '5-a' }).length, 1);
  });

  test('CA-003: una búsqueda sin resultados devuelve lista vacía', () => {
    assert.deepEqual(R.filtrarMatriculas(LISTA, { busqueda: 'zzz' }), []);
  });

  test('fechaPeruana: dd/mm/aaaa', () => {
    assert.equal(R.fechaPeruana('2026-02-16'), '16/02/2026');
    assert.equal(R.fechaPeruana('2026-02-16 09:30:00'), '16/02/2026');
    assert.equal(R.fechaPeruana(null), '');
  });

  test('filtrarRegistros por tipo y por nombre/DNI/correo', () => {
    const regs = [{ tipo: 'alumno', nombre: 'Ana Torres', dni: '70000001' }, { tipo: 'docente', nombre: 'Rosa Quispe', correo: 'rosa@x.pe' }];
    assert.equal(R.filtrarRegistros(regs, { tipo: 'docente' }).length, 1);
    assert.equal(R.filtrarRegistros(regs, { busqueda: 'rosa@' }).length, 1);
    assert.equal(R.filtrarRegistros(regs, { tipo: 'apoderado' }).length, 0);
  });
});
