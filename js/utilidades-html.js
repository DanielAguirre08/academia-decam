/**
 * ACADEMIA DECAM — utilidades puras para la capa de Presentación (escape de HTML e iniciales)
 * ---------------------------------------------------------------
 * Todo dato que viene de la base de datos (nombres, títulos, mensajes de error) y se pinta con
 * innerHTML debe pasar por escaparHtml: si no, un alumno registrado como
 * "<img src=x onerror=...>" ejecutaría código en el navegador del docente (XSS almacenado).
 *
 * Es una función pura (sin DOM), así que se prueba con node igual que la capa de Lógica.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UtilidadesHtml = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Convierte cualquier valor en texto seguro para insertar en HTML (contenido o atributo). */
  function escaparHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"']/g, function (c) { return ENTIDADES[c]; });
  }

  /** Iniciales para los avatares: primera letra de las dos primeras palabras ("Ana Torres" -> "AT"). */
  function iniciales(nombre) {
    return String(nombre || '').trim().split(/\s+/)
      .map(function (p) { return p ? p.charAt(0).toUpperCase() : ''; })
      .join('').slice(0, 2);
  }

  return { escaparHtml: escaparHtml, iniciales: iniciales };
});
