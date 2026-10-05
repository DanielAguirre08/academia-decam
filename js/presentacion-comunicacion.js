/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (comunicación, todos los roles)
 * ----------------------------------------------------------------------
 * HU-011 Reclamos · HU-012 Avisos
 *
 * Reemplaza las funciones del prototipo (reclamos en un array en memoria, avisos sin datos) por
 * la API. Las reglas viven en js/logica-comunicacion.js (la misma que valida el servidor).
 */
(function () {
  'use strict';
  var C = window.LogicaComunicacion;
  var esc = window.UtilidadesHtml.escaparHtml;
  var pedir = window.ApiCliente.pedir;
  var enviarJson = window.ApiCliente.enviarJson;
  var parametros = window.ApiCliente.parametros;
  var avisarError = window.ApiCliente.avisarError;

  var API = {
    reclamos: function (estado) { return pedir('/api/reclamos' + parametros({ estado: estado })); },
    registrarReclamo: function (datos) { return enviarJson('/api/reclamos', 'POST', datos); },
    avanzarReclamo: function (id) { return pedir('/api/reclamos/' + id + '/estado', { method: 'PATCH' }); },
    avisos: function () { return pedir('/api/avisos'); },
    publicarAviso: function (datos) { return enviarJson('/api/avisos', 'POST', datos); }
  };

  function valorDe(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function esJefe() { return CU && CU.role === 'jefe'; }
  function capital(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  // ---------------------------------------------------------------
  // HU-011 — Reclamos
  // ---------------------------------------------------------------

  var reclamos = [];
  var BADGE_ESTADO = { pendiente: 'b-warning', revision: 'b-info', resuelto: 'b-success' };
  var ESTILO_PRIORIDAD = { normal: '', alta: 'color:var(--danger)', urgente: 'color:var(--danger);font-weight:700' };
  var TIPO = { calificacion: 'Calificación', asistencia: 'Asistencia', trato: 'Trato/Conducta', administrativo: 'Administrativo', otro: 'Otro' };

  async function cargarReclamos() {
    try {
      reclamos = await API.reclamos();
      renderReclamos();
    } catch (e) {
      avisarError(e);
    }
  }

  // CA-003: la etiqueta y el filtro por estado reflejan el estado guardado en la BD.
  function renderReclamos() {
    var el = document.getElementById('reclamo-list');
    if (!el) return;
    var visibles = C.filtrarReclamos(reclamos, valorDe('reclamo-filter') || 'all');
    if (!visibles.length) {
      el.innerHTML = '<div class="empty-state"><p>' + (esJefe() ? 'No hay reclamos en este estado.' : 'No hay reclamos. Usa el botón para agregar uno.') + '</p></div>';
      return;
    }
    el.innerHTML = visibles.map(function (r) {
      // Solo el Jefe Académico avanza el estado, y un reclamo resuelto ya no avanza.
      var siguiente = C.siguienteEstadoReclamo(r.estado);
      var boton = esJefe() && siguiente
        ? '<button class="btn btn-sm" onclick="advanceReclamo(' + Number(r.id_reclamo) + ')" title="Pasar a ' + esc(C.etiquetaEstadoReclamo(siguiente)) + '">→</button>'
        : '';
      var descripcion = r.descripcion.length > 120 ? r.descripcion.substring(0, 120) + '...' : r.descripcion;
      return '<div style="padding:14px;border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:600;color:var(--navy)">' + esc(r.asunto) + '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0"><span class="badge ' + (BADGE_ESTADO[r.estado] || 'b-gray') + '">' + esc(r.estadoEtiqueta) + '</span>' + boton + '</div></div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">' + esc(descripcion) + '</div>' +
        '<div style="display:flex;gap:12px;font-size:11px;color:var(--muted)">' +
        '<span>' + esc(TIPO[r.tipo] || r.tipo) + '</span>' +
        '<span style="' + (ESTILO_PRIORIDAD[r.prioridad] || '') + '">⚡ ' + esc(capital(r.prioridad)) + '</span>' +
        '<span>' + esc(r.autor) + ' · ' + esc(r.fecha_registro) + '</span></div></div>';
    }).join('');
  }
  window.renderReclamos = renderReclamos;
  window.filterReclamos = renderReclamos;

  // CA-001 / CA-002: estado inicial, autor y fecha los asigna el servidor.
  window.saveReclamo = async function () {
    var datos = { asunto: valorDe('rec-asunto'), tipo: valorDe('rec-tipo'), prioridad: valorDe('rec-prioridad'), descripcion: valorDe('rec-desc') };
    var revision = C.revisarReclamo(datos);
    if (!revision.valido) { showToast(revision.errores[0]); return; }
    try {
      await API.registrarReclamo(datos);
      closeModal('modal-new-reclamo');
      document.getElementById('rec-asunto').value = '';
      document.getElementById('rec-desc').value = '';
      await cargarReclamos();
      showToast('Reclamo registrado como Pendiente');
    } catch (e) {
      avisarError(e);
    }
  };

  window.advanceReclamo = async function (id) {
    try {
      var r = await API.avanzarReclamo(id);
      await cargarReclamos();
      showToast('Reclamo ahora está: ' + r.estadoEtiqueta);
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // HU-012 — Avisos
  // ---------------------------------------------------------------

  var DESTINO = { todos: 'Todos', docentes: 'Docentes', alumnos: 'Alumnos' };

  /** CA-001: listado de avisos del rol + contadores de la página y del menú. */
  async function cargarAvisos() {
    var avisos;
    try {
      avisos = await API.avisos();
    } catch (e) {
      avisarError(e);
      return;
    }
    var badgeMenu = document.getElementById('nav-avisos-count');
    if (badgeMenu) { badgeMenu.textContent = avisos.length; badgeMenu.style.display = avisos.length ? '' : 'none'; }
    var contador = document.getElementById('avisos-count');
    if (contador) contador.textContent = avisos.length ? avisos.length + (avisos.length === 1 ? ' aviso' : ' avisos') : 'Sin avisos';

    var lista = document.getElementById('announcements-list');
    if (!lista) return;
    if (!avisos.length) {
      lista.innerHTML = '<div class="empty-state"><h3>Sin avisos publicados</h3><p>Los comunicados aparecerán aquí.</p></div>';
      return;
    }
    lista.innerHTML = avisos.map(function (a) {
      return '<div style="padding:14px 16px;border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
        '<div style="font-size:13px;font-weight:600;color:var(--navy)">' + esc(a.titulo) + '</div>' +
        '<span class="badge b-gray">' + esc(DESTINO[a.destinatarios] || a.destinatarios) + '</span></div>' +
        '<div style="font-size:12px;color:var(--slate);margin:6px 0">' + esc(a.contenido) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + esc(a.autor) + ' · ' + esc(a.fecha_publicacion) + '</div></div>';
    }).join('');
  }
  window.cargarAvisos = cargarAvisos;

  // CA-001: el Jefe publica; la fecha la pone el servidor. CA-002: a los demás roles el botón ni aparece.
  window.publicarAviso = async function () {
    var datos = { titulo: valorDe('aviso-titulo'), contenido: valorDe('aviso-contenido'), destinatarios: valorDe('aviso-destinatarios') || 'todos' };
    var revision = C.revisarAviso(datos);
    if (!revision.valido) { showToast(revision.errores[0]); return; }
    try {
      await API.publicarAviso(datos);
      closeModal('modal-new-aviso');
      document.getElementById('aviso-titulo').value = '';
      document.getElementById('aviso-contenido').value = '';
      await cargarAvisos();
      showToast('Aviso publicado');
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // Enganche con la navegación
  // ---------------------------------------------------------------
  var showPageAnterior = window.showPage;
  window.showPage = function (id) {
    showPageAnterior(id);
    if (!CU) return;
    if (id === 'reclamo') {
      var boton = document.getElementById('btn-nuevo-reclamo');
      if (boton) boton.style.display = esJefe() ? 'none' : '';
      var sub = document.getElementById('reclamo-pg-sub');
      if (sub) sub.textContent = esJefe() ? 'Atención de reclamos académicos' : 'Mis reclamos y su estado de atención';
      cargarReclamos();
    }
    // El contador de avisos del menú se mantiene al día al entrar al portal y a la página de avisos.
    if (id === 'avisos' || id === 'dashboard') cargarAvisos();
  };
})();
