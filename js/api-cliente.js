/**
 * ACADEMIA DECAM — cliente HTTP compartido por las capas de Presentación de cada rol.
 * Centraliza el JSON, el manejo de errores del servidor y la sesión expirada (401).
 */
(function () {
  'use strict';

  /** Envoltorio único de fetch. Lanza Error con el mensaje del servidor y, si viene, el detalle por campo. */
  async function pedir(url, opciones) {
    var respuesta = await fetch(url, opciones);
    var cuerpo = null;
    try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = null; }
    // 401 = la sesión del servidor ya no existe (se reinició o expiró): de vuelta al login.
    if (respuesta.status === 401 && typeof window.sesionExpirada === 'function') window.sesionExpirada();
    if (!respuesta.ok) {
      var error = new Error((cuerpo && cuerpo.error) || ('El servidor respondió ' + respuesta.status));
      error.errores = (cuerpo && cuerpo.errores) || []; // detalle por fila o por campo
      throw error;
    }
    return cuerpo;
  }

  function enviarJson(url, metodo, datos) {
    return pedir(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
  }

  /** Query string a partir de un objeto, omitiendo los valores vacíos. */
  function parametros(objeto) {
    var qs = new URLSearchParams();
    Object.keys(objeto || {}).forEach(function (k) {
      if (objeto[k] !== null && objeto[k] !== undefined && objeto[k] !== '') qs.append(k, objeto[k]);
    });
    var s = qs.toString();
    return s ? '?' + s : '';
  }

  /** Muestra el error en el toast (con cuántos errores más hay) y lo deja en la consola. */
  function avisarError(e) {
    var mensaje = e && e.message ? e.message : 'No se pudo conectar con el servidor';
    var extra = e && e.errores && e.errores.length > 1 ? ' (y ' + (e.errores.length - 1) + ' error(es) más)' : '';
    showToast(mensaje + extra);
    console.error(e);
  }

  window.ApiCliente = { pedir: pedir, enviarJson: enviarJson, parametros: parametros, avisarError: avisarError };
})();
