/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (rol Registrador)
 * -------------------------------------------------------------
 * HU-002 Registro de alumnos, docentes y apoderados · HU-003 Registro de matrícula ·
 * HU-004 Consulta y control del estado de las matrículas
 *
 * Mismas reglas que logica-docente.js: funciones puras, sin DOM ni SQL, la fecha "hoy" llega por
 * parámetro. Se ejecuta en el navegador (js/logica-registro.js) y en el servidor (routes/).
 * Las longitudes y formatos salen de database/schema.sql, para que la base nunca tenga que
 * rechazar algo que esta capa dejó pasar.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logica-docente'));
  } else {
    root.LogicaRegistro = factory(root.LogicaDocente);
  }
})(typeof self !== 'undefined' ? self : this, function (LD) {
  'use strict';

  // HU-002: los tres tipos de persona que registra el Registrador.
  var TIPOS_PERSONA = ['alumno', 'docente', 'apoderado'];
  var NIVELES = ['Primaria', 'Secundaria'];
  var SEXOS = ['M', 'F'];
  var PROCEDENCIAS = ['nuevo', 'traslado', 'promocion'];
  var TURNOS = ['Mañana', 'Tarde'];
  var ESTADOS_MATRICULA = ['activa', 'inactiva'];

  // Edad razonable de un alumno de Primaria/Secundaria al registrarlo.
  var EDAD_MINIMA = 3;
  var EDAD_MAXIMA = 20;

  // Mensajes exactos de los criterios de aceptación.
  var MSJ_NOMBRE_OBLIGATORIO = 'El nombre es obligatorio';                                   // HU-002 CA-003
  var MSJ_CAMPOS_OBLIGATORIOS = 'Los campos marcados con (*) son obligatorios';              // HU-003 CA-003

  function texto(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
  }

  /** DNI peruano: exactamente 8 dígitos (CHECK de ALUMNO, DOCENTE y APODERADO). */
  function validarDni(dni) {
    return typeof dni === 'string' && /^[0-9]{8}$/.test(dni);
  }

  /** Mismo patrón que el CHECK chk_usuario_correo, y como máximo 100 caracteres. */
  function validarCorreo(correo) {
    return typeof correo === 'string' && correo.length <= 100 && /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(correo);
  }

  /**
   * Teléfono: se aceptan espacios y guiones al escribir ("+51 999 999 999"), pero se guarda
   * normalizado ("+51999999999"). Devuelve el teléfono normalizado o null si no es válido.
   */
  function normalizarTelefono(telefono) {
    if (typeof telefono !== 'string') return null;
    var limpio = telefono.replace(/[\s-]/g, '');
    return /^\+?[0-9]{6,14}$/.test(limpio) ? limpio : null;
  }

  /**
   * El formulario pide un solo campo "Nombres y apellidos", pero USUARIO guarda nombre y apellido
   * por separado. Regla (nombres peruanos con dos apellidos): con 2 palabras, 1 nombre + 1 apellido;
   * con 3, 1 nombre + 2 apellidos; con 4 o más, 2 nombres y el resto apellidos.
   * Devuelve null si hay una sola palabra (falta el apellido).
   */
  function separarNombreCompleto(nombreCompleto) {
    var partes = texto(nombreCompleto).split(/\s+/).filter(Boolean);
    if (partes.length < 2) return null;
    var cantidadNombres = partes.length >= 4 ? 2 : 1;
    return {
      nombres: partes.slice(0, cantidadNombres).join(' '),
      apellidos: partes.slice(cantidadNombres).join(' ')
    };
  }

  /** HU-003 CA-002: grados habilitados según el nivel (Primaria 1-6, Secundaria 1-5, sin nivel ninguno). */
  function gradosPorNivel(nivel) {
    var maximo = nivel === 'Primaria' ? 6 : nivel === 'Secundaria' ? 5 : 0;
    var grados = [];
    for (var g = 1; g <= maximo; g++) grados.push(g);
    return grados;
  }

  function validarGradoDeNivel(nivel, grado) {
    var n = typeof grado === 'number' ? grado : (typeof grado === 'string' && /^[0-9]$/.test(grado) ? Number(grado) : NaN);
    return gradosPorNivel(nivel).indexOf(n) !== -1;
  }

  /** Letra de sección: una mayúscula de la A a la Z (CHECK chk_seccion_letra). */
  function validarLetraSeccion(letra) {
    return typeof letra === 'string' && /^[A-Z]$/.test(letra);
  }

  /** Edad cumplida en `hoy` de alguien nacido en `fechaNacimiento` (YYYY-MM-DD). */
  function edadEn(fechaNacimiento, hoy) {
    var p = fechaNacimiento.split('-').map(Number);
    var edad = hoy.getFullYear() - p[0];
    var aunNoCumple = (hoy.getMonth() + 1) < p[1] || ((hoy.getMonth() + 1) === p[1] && hoy.getDate() < p[2]);
    return aunNoCumple ? edad - 1 : edad;
  }

  function revisarFechaNacimiento(fecha, hoy, errores) {
    if (!LD.validarFechaISO(fecha)) { errores.push('La fecha de nacimiento no es válida'); return; }
    var edad = edadEn(fecha, hoy);
    if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
      errores.push('La edad del alumno debe estar entre ' + EDAD_MINIMA + ' y ' + EDAD_MAXIMA + ' años');
    }
  }

  function revisarLargo(valor, maximo, etiqueta, errores) {
    if (texto(valor).length > maximo) errores.push(etiqueta + ' admite como máximo ' + maximo + ' caracteres');
  }

  /** Grado y sección van juntos: los dos o ninguno; si vienen, deben calzar con el nivel. */
  function revisarUbicacion(datos, obligatoria, errores) {
    var tieneGrado = datos.grado !== undefined && datos.grado !== null && datos.grado !== '';
    var tieneLetra = texto(datos.seccion) !== '';
    if (!obligatoria && !tieneGrado && !tieneLetra) return;
    if (NIVELES.indexOf(datos.nivel) === -1) { errores.push('Selecciona el nivel'); return; }
    if (!validarGradoDeNivel(datos.nivel, datos.grado)) errores.push('El grado no corresponde al nivel ' + datos.nivel);
    if (!validarLetraSeccion(datos.seccion)) errores.push('Selecciona la sección');
  }

  function revisarApoderadoDelAlumno(datos, errores) {
    if (!texto(datos.apoderado_nombre)) errores.push('El nombre del apoderado es obligatorio');
    revisarLargo(datos.apoderado_nombre, 120, 'El nombre del apoderado', errores);
    if (!validarDni(datos.apoderado_dni)) errores.push('El DNI del apoderado debe tener 8 dígitos');
    if (texto(datos.apoderado_telefono) && !normalizarTelefono(datos.apoderado_telefono)) {
      errores.push('El teléfono del apoderado no es válido');
    }
    if (texto(datos.apoderado_correo) && !validarCorreo(texto(datos.apoderado_correo))) {
      errores.push('El correo del apoderado no es válido');
    }
  }

  /**
   * HU-002: revisa el formulario de Registro según el tipo de persona.
   * CA-003: sin nombre, el primer (y único relevante) error es "El nombre es obligatorio".
   * CA-002: los campos de alumno solo se exigen cuando el tipo es "alumno".
   * Devuelve { valido, errores[] }.
   */
  function revisarRegistro(datos, hoy) {
    datos = datos || {};
    hoy = hoy || new Date();
    var errores = [];
    var nombre = texto(datos.nombre);

    if (!nombre) return { valido: false, errores: [MSJ_NOMBRE_OBLIGATORIO] };
    if (TIPOS_PERSONA.indexOf(datos.tipo) === -1) errores.push('Selecciona el tipo de persona');

    if (datos.tipo === 'apoderado') {
      revisarLargo(nombre, 120, 'El nombre', errores);
    } else {
      var partes = separarNombreCompleto(nombre);
      if (!partes) errores.push('Ingresa nombres y apellidos');
      else {
        revisarLargo(partes.nombres, 60, 'Los nombres', errores);
        revisarLargo(partes.apellidos, 60, 'Los apellidos', errores);
      }
    }

    if (!validarDni(datos.dni)) errores.push('El DNI debe tener 8 dígitos');
    if (texto(datos.correo) && !validarCorreo(texto(datos.correo))) errores.push('El correo no es válido');
    if (texto(datos.telefono) && !normalizarTelefono(datos.telefono)) errores.push('El teléfono no es válido');
    revisarLargo(datos.direccion, 150, 'La dirección', errores);

    if (datos.tipo === 'alumno') {
      revisarFechaNacimiento(datos.fecha_nacimiento, hoy, errores);
      if (SEXOS.indexOf(datos.sexo) === -1) errores.push('Selecciona el sexo');
      if (NIVELES.indexOf(datos.nivel) === -1) errores.push('Selecciona el nivel');
      else revisarUbicacion(datos, false, errores);
      revisarApoderadoDelAlumno(datos, errores);
    }
    if (datos.tipo === 'docente') {
      // El docente siempre tiene cuenta (DOCENTE.id_usuario es NOT NULL): necesita su correo.
      if (!texto(datos.correo)) errores.push('El correo institucional del docente es obligatorio');
      revisarLargo(datos.especialidad, 80, 'La especialidad', errores);
    }
    if (datos.tipo === 'apoderado') {
      if (!texto(datos.telefono)) errores.push('El teléfono del apoderado es obligatorio');
    }

    return { valido: errores.length === 0, errores: errores };
  }

  /**
   * HU-003: revisa el formulario de matrícula.
   * CA-003: nombre del alumno, nivel, grado, sección y apoderado son (*); si falta alguno, el
   * mensaje es el de la HU. El DNI del alumno y el del apoderado también llevan (*): sin ellos no
   * se puede identificar a la persona (ALUMNO.dni y APODERADO.dni son NOT NULL y únicos).
   * Fecha de nacimiento y sexo solo se exigen si el alumno es nuevo (eso lo decide el servidor).
   */
  function revisarMatricula(datos, hoy) {
    datos = datos || {};
    hoy = hoy || new Date();
    var obligatorios = [datos.nombre, datos.dni, datos.nivel, datos.grado, datos.seccion, datos.apoderado_nombre, datos.apoderado_dni];
    var falta = obligatorios.some(function (v) { return v === undefined || v === null || texto(String(v)) === ''; });
    if (falta) return { valido: false, errores: [MSJ_CAMPOS_OBLIGATORIOS] };

    var errores = [];
    if (!separarNombreCompleto(datos.nombre)) errores.push('Ingresa nombres y apellidos del alumno');
    if (!validarDni(datos.dni)) errores.push('El DNI del alumno debe tener 8 dígitos');
    if (texto(datos.fecha_nacimiento)) revisarFechaNacimiento(datos.fecha_nacimiento, hoy, errores);
    if (texto(datos.sexo) && SEXOS.indexOf(datos.sexo) === -1) errores.push('Sexo inválido');
    revisarUbicacion(datos, true, errores);
    revisarApoderadoDelAlumno(datos, errores);
    revisarLargo(datos.direccion, 150, 'La dirección', errores);
    revisarLargo(datos.observaciones, 200, 'Las observaciones', errores);
    if (datos.procedencia !== undefined && PROCEDENCIAS.indexOf(datos.procedencia) === -1) errores.push('Procedencia inválida');
    if (datos.turno !== undefined && datos.turno !== '' && TURNOS.indexOf(datos.turno) === -1) errores.push('Turno inválido');

    // Año lectivo: el actual, el anterior (regularizaciones) o el siguiente (matrícula adelantada).
    var anio = Number(datos.anio_lectivo);
    var actual = hoy.getFullYear();
    if (!/^[0-9]{4}$/.test(String(datos.anio_lectivo)) || anio < actual - 1 || anio > actual + 1) {
      errores.push('El año lectivo debe estar entre ' + (actual - 1) + ' y ' + (actual + 1));
    }
    return { valido: errores.length === 0, errores: errores };
  }

  /** HU-003 CA-001: código con formato MAT-0001 (4 dígitos como mínimo; el CHECK admite hasta 6). */
  function formatearCodigoMatricula(numero) {
    if (!Number.isInteger(numero) || numero < 1 || numero > 999999) return null;
    var digitos = String(numero);
    while (digitos.length < 4) digitos = '0' + digitos;
    return 'MAT-' + digitos;
  }

  /** Número correlativo de un código ("MAT-0042" -> 42) o null si no tiene el formato. */
  function numeroDeCodigo(codigo) {
    var m = /^MAT-([0-9]{4,6})$/.exec(codigo || '');
    return m ? Number(m[1]) : null;
  }

  /** HU-003 CA-001: el siguiente código después del mayor ya usado (sin códigos -> MAT-0001). */
  function siguienteCodigoMatricula(codigosExistentes) {
    var mayor = 0;
    (codigosExistentes || []).forEach(function (c) {
      var n = numeroDeCodigo(c);
      if (n !== null && n > mayor) mayor = n;
    });
    return formatearCodigoMatricula(mayor + 1);
  }

  /** HU-004 CA-002: alterna activa <-> inactiva (el código de matrícula no cambia). */
  function alternarEstadoMatricula(estado) {
    if (estado === 'activa') return 'inactiva';
    if (estado === 'inactiva') return 'activa';
    return null;
  }

  /** HU-002 CA-001: fecha en formato peruano dd/mm/aaaa a partir de 'YYYY-MM-DD...' . */
  function fechaPeruana(valor) {
    var m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(valor || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function contiene(campo, busqueda) {
    return String(campo || '').toLowerCase().indexOf(busqueda) !== -1;
  }

  /**
   * HU-004 CA-001 / CA-003: filtra por estado ('all' = todos) y busca por nombre, DNI, código o
   * sección. Una búsqueda sin resultados devuelve [] (la Presentación muestra el mensaje y 0).
   */
  function filtrarMatriculas(lista, filtros) {
    filtros = filtros || {};
    var estado = filtros.estado || 'all';
    var busqueda = texto(filtros.busqueda).toLowerCase();
    return (lista || []).filter(function (m) {
      var coincideEstado = estado === 'all' || m.estado === estado;
      var coincideBusqueda = !busqueda || contiene(m.nombreAlumno, busqueda) || contiene(m.dni, busqueda) ||
        contiene(m.codigo, busqueda) || contiene(m.seccion, busqueda);
      return coincideEstado && coincideBusqueda;
    });
  }

  /** HU-002: filtra el listado de Registro por tipo ('all' = todos) y por nombre, DNI o correo. */
  function filtrarRegistros(lista, filtros) {
    filtros = filtros || {};
    var tipo = filtros.tipo || 'all';
    var busqueda = texto(filtros.busqueda).toLowerCase();
    return (lista || []).filter(function (r) {
      var coincideTipo = tipo === 'all' || r.tipo === tipo;
      var coincideBusqueda = !busqueda || contiene(r.nombre, busqueda) || contiene(r.dni, busqueda) || contiene(r.correo, busqueda);
      return coincideTipo && coincideBusqueda;
    });
  }

  return {
    TIPOS_PERSONA: TIPOS_PERSONA,
    MSJ_NOMBRE_OBLIGATORIO: MSJ_NOMBRE_OBLIGATORIO,
    MSJ_CAMPOS_OBLIGATORIOS: MSJ_CAMPOS_OBLIGATORIOS,
    ESTADOS_MATRICULA: ESTADOS_MATRICULA,
    validarDni: validarDni,
    validarCorreo: validarCorreo,
    normalizarTelefono: normalizarTelefono,
    separarNombreCompleto: separarNombreCompleto,
    gradosPorNivel: gradosPorNivel,
    validarGradoDeNivel: validarGradoDeNivel,
    edadEn: edadEn,
    revisarRegistro: revisarRegistro,
    revisarMatricula: revisarMatricula,
    formatearCodigoMatricula: formatearCodigoMatricula,
    numeroDeCodigo: numeroDeCodigo,
    siguienteCodigoMatricula: siguienteCodigoMatricula,
    alternarEstadoMatricula: alternarEstadoMatricula,
    fechaPeruana: fechaPeruana,
    filtrarMatriculas: filtrarMatriculas,
    filtrarRegistros: filtrarRegistros
  };
});
