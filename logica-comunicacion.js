/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (comunicación)
 * ----------------------------------------------------------
 * HU-011 Registro y seguimiento de reclamos · HU-012 Publicación de avisos institucionales
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
   * HU-011: revisa el formulario de reclamo. CA-002: sin asunto o sin descripción, el único error
   * es el mensaje de la HU. Tipo y prioridad son opcionales (tienen valor por defecto) pero, si
   * vienen, deben ser de la lista. Devuelve { valido, errores[] }.
   */
  function revisarReclamo(datos) {
    datos = datos || {};
    if (!texto(datos.asunto) || !texto(datos.descripcion)) return { valido: false, errores: [MSJ_CAMPOS_OBLIGATORIOS] };
    var errores = [];
    if (texto(datos.asunto).length > 120) errores.push('El asunto admite como máximo 120 caracteres');
    if (texto(datos.descripcion).length > 500) errores.push('La descripción admite como máximo 500 caracteres');
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
    else if (texto(datos.titulo).length > 120) errores.push('El título admite como máximo 120 caracteres');
    if (!texto(datos.contenido)) errores.push('El contenido del aviso es obligatorio');
    else if (texto(datos.contenido).length > 500) errores.push('El contenido admite como máximo 500 caracteres');
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

  return {
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
