/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (comunicación)
 * ----------------------------------------------------------
 * HU-011 Registro y seguimiento de reclamos · HU-012 Publicación de avisos institucionales
 * HU-013 Mensajes con buscador de destinatarios
 *
 * Funciones puras, sin DOM ni SQL. Se ejecuta en el navegador (js/logica-comunicacion.js) y en
 * el servidor. Longitudes y valores permitidos tomados de database/schema.sql.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LogicaComunicacion = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIPOS_RECLAMO = ['calificacion', 'asistencia', 'trato', 'administrativo', 'otro']; // chk_reclamo_tipo
  var PRIORIDADES = ['normal', 'alta', 'urgente'];
  // HU-011 CA-003: la secuencia de atención. "resuelto" es el estado final.
  var SECUENCIA_RECLAMO = ['pendiente', 'revision', 'resuelto'];
  var ETIQUETA_ESTADO = { pendiente: 'Pendiente', revision: 'En revisión', resuelto: 'Resuelto' };
  var DESTINATARIOS = ['todos', 'docentes', 'alumnos'];

  var MSJ_CAMPOS_OBLIGATORIOS = 'Completa los campos obligatorios'; // HU-011 CA-002

  function texto(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
  }

  /**
   * Largo en CARACTERES, como cuenta MySQL un VARCHAR(n) en utf8mb4. String.length cuenta unidades
   * UTF-16 y un emoji vale 2: un texto válido para la base se rechazaría.
   */
  function largo(t) {
    return Array.from(t).length;
  }

  /**
   * HU-011: revisa el formulario de reclamo. CA-002: sin asunto o sin descripción, el único error
   * es el mensaje de la HU. Tipo y prioridad son opcionales (tienen valor por defecto) pero, si
   * vienen, deben ser de la lista. Devuelve { valido, errores[] }.
   */
  function revisarReclamo(datos) {
    datos = datos || {};
    if (!texto(datos.asunto) || !texto(datos.descripcion)) return { valido: false, errores: [MSJ_CAMPOS_OBLIGATORIOS] };
    var errores = [];
    if (largo(texto(datos.asunto)) > 120) errores.push('El asunto admite como máximo 120 caracteres');
    if (largo(texto(datos.descripcion)) > 500) errores.push('La descripción admite como máximo 500 caracteres');
    if (datos.tipo !== undefined && TIPOS_RECLAMO.indexOf(datos.tipo) === -1) errores.push('Tipo de reclamo inválido');
    if (datos.prioridad !== undefined && PRIORIDADES.indexOf(datos.prioridad) === -1) errores.push('Prioridad inválida');
    return { valido: errores.length === 0, errores: errores };
  }

  /** HU-011 CA-003: el siguiente estado de la secuencia, o null si ya está resuelto (o es inválido). */
  function siguienteEstadoReclamo(estado) {
    var i = SECUENCIA_RECLAMO.indexOf(estado);
    return i === -1 || i === SECUENCIA_RECLAMO.length - 1 ? null : SECUENCIA_RECLAMO[i + 1];
  }

  /** Texto de la etiqueta del listado ("revision" -> "En revisión"). */
  function etiquetaEstadoReclamo(estado) {
    return ETIQUETA_ESTADO[estado] || '';
  }

  /** HU-011 CA-003: filtro por estado del listado ('all' = todos). */
  function filtrarReclamos(lista, estado) {
    if (!estado || estado === 'all') return lista || [];
    return (lista || []).filter(function (r) { return r.estado === estado; });
  }

  /** HU-012 CA-001: título (120) y contenido (500) obligatorios; destinatarios de la lista. */
  function revisarAviso(datos) {
    datos = datos || {};
    var errores = [];
    if (!texto(datos.titulo)) errores.push('El título del aviso es obligatorio');
    else if (largo(texto(datos.titulo)) > 120) errores.push('El título admite como máximo 120 caracteres');
    if (!texto(datos.contenido)) errores.push('El contenido del aviso es obligatorio');
    else if (largo(texto(datos.contenido)) > 500) errores.push('El contenido admite como máximo 500 caracteres');
    if (datos.destinatarios !== undefined && DESTINATARIOS.indexOf(datos.destinatarios) === -1) errores.push('Destinatarios inválidos');
    return { valido: errores.length === 0, errores: errores };
  }

  /**
   * HU-012 CA-001: a quién le llega cada aviso. El alumno ve "todos" y "alumnos"; el docente,
   * "todos" y "docentes"; los roles administrativos ven todos los avisos.
   */
  function destinatariosVisibles(rol) {
    if (rol === 'alumno') return ['todos', 'alumnos'];
    if (rol === 'docente') return ['todos', 'docentes'];
    return DESTINATARIOS.slice();
  }

  // ---------- HU-013 Mensajes ----------
  var MIN_BUSQUEDA = 2;        // con una sola letra la lista no ayuda a elegir
  var MAX_PALABRAS_BUSQUEDA = 4;
  var MAX_DESTINATARIOS = 20;  // un mensaje a toda una sección (hasta ~20 alumnos) cabe
  var MSJ_SIN_DESTINATARIO = 'Elige al menos un destinatario';
  var ETIQUETA_ROL = { docente: 'Docente', alumno: 'Alumno', jefe_academico: 'Jefe Académico', registrador: 'Registrador' };

  /** id_usuario válido: entero positivo (número o texto de dígitos) que cabe en un INT de MySQL. */
  function esIdUsuario(valor) {
    var n = typeof valor === 'string' && /^[0-9]+$/.test(valor) ? Number(valor) : valor;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 2147483647;
  }

  /** Los ids sin repetir, como números y en el orden en que se eligieron. */
  function destinatariosUnicos(ids) {
    var unicos = [];
    (ids || []).forEach(function (id) {
      var n = Number(id);
      if (unicos.indexOf(n) === -1) unicos.push(n);
    });
    return unicos;
  }

  /**
   * HU-013: el texto del buscador "Para", partido en palabras ("  ana   TOR " -> ['ana', 'TOR']).
   * Cada palabra debe aparecer en el nombre, el apellido o el correo, así "torres ana" también
   * encuentra a Ana Torres. Devuelve [] si el texto es demasiado corto para buscar.
   */
  function palabrasDeBusqueda(q) {
    var t = Array.from(texto(q).replace(/\s+/g, ' ')).slice(0, 60).join('').trim();
    if (largo(t) < MIN_BUSQUEDA) return [];
    return t.split(' ').slice(0, MAX_PALABRAS_BUSQUEDA);
  }

  /** HU-013: segunda línea de cada sugerencia ("Docente · Matemática", "Alumno · 6-A", "Registrador"). */
  function detalleDestinatario(d) {
    d = d || {};
    var rol = ETIQUETA_ROL[d.rol] || '';
    var extra = d.rol === 'docente' ? d.especialidad : d.rol === 'alumno' ? d.grupo : null;
    return extra ? rol + ' · ' + extra : rol;
  }

  /**
   * Mensajes: `para` es la lista de id_usuario elegidos en el buscador (HU-013, de 1 a 20, sin
   * uno mismo) o, por compatibilidad, un correo institucional. Contenido de 1 a 1000 caracteres
   * (MENSAJE.contenido VARCHAR(1000)). Nunca a uno mismo (control 12 de verificar-integridad.sql).
   */
  function revisarMensaje(datos, correoPropio, idPropio) {
    datos = datos || {};
    var errores = [];
    if (Array.isArray(datos.para)) {
      if (!datos.para.length) errores.push(MSJ_SIN_DESTINATARIO);
      else if (!datos.para.every(esIdUsuario)) errores.push('Algún destinatario no es válido');
      else if (destinatariosUnicos(datos.para).length > MAX_DESTINATARIOS) errores.push('Puedes escribir a ' + MAX_DESTINATARIOS + ' destinatarios como máximo');
      else if (idPropio && destinatariosUnicos(datos.para).indexOf(Number(idPropio)) !== -1) errores.push('No puedes enviarte un mensaje a ti mismo');
    } else {
      var para = texto(datos.para).toLowerCase();
      if (!para) errores.push(MSJ_SIN_DESTINATARIO);
      else if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(para)) errores.push('El correo del destinatario no es válido');
      else if (correoPropio && para === String(correoPropio).toLowerCase()) errores.push('No puedes enviarte un mensaje a ti mismo');
    }
    if (!texto(datos.contenido)) errores.push('Escribe el mensaje');
    else if (largo(texto(datos.contenido)) > 1000) errores.push('El mensaje admite como máximo 1000 caracteres');
    return { valido: errores.length === 0, errores: errores };
  }

  return {
    revisarMensaje: revisarMensaje,
    MIN_BUSQUEDA: MIN_BUSQUEDA,
    MAX_DESTINATARIOS: MAX_DESTINATARIOS,
    esIdUsuario: esIdUsuario,
    destinatariosUnicos: destinatariosUnicos,
    palabrasDeBusqueda: palabrasDeBusqueda,
    detalleDestinatario: detalleDestinatario,
    TIPOS_RECLAMO: TIPOS_RECLAMO,
    PRIORIDADES: PRIORIDADES,
    DESTINATARIOS: DESTINATARIOS,
    MSJ_CAMPOS_OBLIGATORIOS: MSJ_CAMPOS_OBLIGATORIOS,
    revisarReclamo: revisarReclamo,
    siguienteEstadoReclamo: siguienteEstadoReclamo,
    etiquetaEstadoReclamo: etiquetaEstadoReclamo,
    filtrarReclamos: filtrarReclamos,
    revisarAviso: revisarAviso,
    destinatariosVisibles: destinatariosVisibles
  };
});
