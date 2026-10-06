/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (pantallas de consulta sin HU propia)
 * ---------------------------------------------------------------------------
 * Horario, Mi Sección, Mis Alumnos y Mensajes mostraban datos fijos o vacíos en el prototipo.
 * Aquí leen la base real (GET /api/horario, /api/seccion, /api/alumnos y /api/mensajes).
 * Son de solo lectura, salvo enviar un mensaje y marcarlo como leído.
 */
(function () {
  'use strict';
  var LD = window.LogicaDocente;
  var C = window.LogicaComunicacion;
  var esc = window.UtilidadesHtml.escaparHtml;
  var iniciales = window.UtilidadesHtml.iniciales;
  var pedir = window.ApiCliente.pedir;
  var enviarJson = window.ApiCliente.enviarJson;
  var avisarError = window.ApiCliente.avisarError;

  function el(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------
  // Horario
  // ---------------------------------------------------------------
  var DIA_VISIBLE = { Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miércoles', Jueves: 'Jueves', Viernes: 'Viernes' };

  window.buildSchedule = async function () {
    var grilla = el('schedule-grid');
    if (!grilla || !CU || (CU.role !== 'teacher' && CU.role !== 'student')) return;
    // initPortal() también llama a buildSchedule al entrar: solo se consulta si la página está abierta.
    if (!el('page-horario').classList.contains('active')) return;
    var h;
    try {
      h = await pedir('/api/horario');
    } catch (e) {
      avisarError(e);
      return;
    }
    if (!h.horas.length) {
      grilla.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Aún no tienes clases en el horario</h3></div>';
      return;
    }
    var html = '<div class="sch-head"></div>' + h.dias.map(function (d) { return '<div class="sch-head">' + DIA_VISIBLE[d] + '</div>'; }).join('');
    h.horas.forEach(function (hora) {
      html += '<div class="sch-time">' + esc(hora) + '</div>';
      h.dias.forEach(function (dia) {
        var b = h.celdas[dia + '|' + hora];
        // El docente ve en qué grupo dicta; el alumno, quién le dicta.
        html += b
          ? '<div class="sch-cell"><div class="sch-subj">' + esc(b.curso) + '</div><div class="sch-room">' +
            esc(CU.role === 'teacher' ? b.grupo + ' · ' + (b.aula || '') : b.docente) + ' · ' + esc(b.hora_inicio + '–' + b.hora_fin) + '</div></div>'
          : '<div class="sch-cell sch-empty"></div>';
      });
    });
    grilla.innerHTML = html;
  };

  // ---------------------------------------------------------------
  // Mi Sección
  // ---------------------------------------------------------------
  window.buildSeccion = async function (idSeccion) {
    if (!CU || (CU.role !== 'teacher' && CU.role !== 'student')) return;
    var s;
    try {
      s = await pedir('/api/seccion' + (idSeccion ? '?id_seccion=' + encodeURIComponent(idSeccion) : ''));
    } catch (e) {
      avisarError(e);
      return;
    }
    var lista = el('seccion-alumnos-list');
    if (!s) {
      ['sec-grado', 'sec-tutor', 'sec-aula', 'sec-turno', 'sec-total'].forEach(function (id) { el(id).textContent = '—'; });
      el('seccion-pg-sub').textContent = CU.role === 'teacher' ? 'No eres tutor de ninguna sección' : 'Aún no estás matriculado en una sección';
      lista.innerHTML = '<div class="empty-state"><h3>Sin sección asignada</h3></div>';
      return;
    }
    // Un docente tutor de varias secciones elige cuál ver (siempre en el mismo orden).
    var sub = el('seccion-pg-sub');
    if (s.opciones && s.opciones.length > 1) {
      sub.innerHTML = 'Información de tu grupo y aula · <select class="filter-select" style="padding:2px 6px;font-size:12px" onchange="buildSeccion(this.value)">' +
        s.opciones.map(function (o) {
          return '<option value="' + Number(o.id_seccion) + '"' + (o.id_seccion === s.id_seccion ? ' selected' : '') + '>' + esc(o.grupo + ' ' + o.nivel) + '</option>';
        }).join('') + '</select>';
    } else {
      sub.textContent = 'Información de tu grupo y aula · ' + s.anio_lectivo;
    }
    el('sec-grado').textContent = s.grupo + ' ' + s.nivel;
    el('sec-tutor').textContent = s.tutor || '—';
    el('sec-aula').textContent = s.aula || '—';
    el('sec-turno').textContent = s.turno;
    el('sec-total').textContent = s.alumnos.length + (s.alumnos.length === 1 ? ' alumno' : ' alumnos');
    lista.innerHTML = s.alumnos.length
      ? s.alumnos.map(function (a) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div class="u-av av-s" style="width:32px;height:32px;font-size:11px">' + esc(iniciales(a.nombreAlumno)) + '</div>' +
          '<div style="font-size:13px;font-weight:500;color:var(--navy)">' + esc(a.nombreAlumno) + '</div></div>';
      }).join('')
      : '<div class="empty-state"><h3>No hay alumnos activos en esta sección</h3></div>';
  };

  // ---------------------------------------------------------------
  // Mis Alumnos (docente)
  // ---------------------------------------------------------------
  var misAlumnos = [];
  var BADGE_DESEMPENO = { Excelente: 'b-success', Bien: 'b-info', Regular: 'b-warning', 'En riesgo': 'b-danger', 'Sin datos': 'b-gray' };

  async function cargarMisAlumnos() {
    try {
      misAlumnos = await pedir('/api/alumnos');
    } catch (e) {
      misAlumnos = [];
      avisarError(e);
    }
    // El filtro de grupos se arma con los grupos reales del docente (antes era una lista fija 1-A..6-B).
    var grupos = [];
    misAlumnos.forEach(function (a) { if (grupos.indexOf(a.grupo) === -1) grupos.push(a.grupo); });
    var combo = el('students-group-filter');
    var elegido = combo.value;
    combo.innerHTML = '<option value="">Todos los grupos</option>' +
      grupos.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + '</option>'; }).join('');
    if (grupos.indexOf(elegido) !== -1) combo.value = elegido; // se conserva el grupo que estaba filtrado
    filterStudents();
  }

  // Los 3 filtros se leen siempre del formulario (el buscador y los combos llaman a esta misma función).
  window.filterStudents = function () {
    var buscador = document.querySelector('#page-alumnos .search-input');
    var texto = (buscador ? buscador.value : '').trim().toLowerCase();
    var grupo = el('students-group-filter').value;
    var estado = el('students-status-filter').value;
    var visibles = misAlumnos.filter(function (a) {
      return (!texto || a.nombreAlumno.toLowerCase().indexOf(texto) !== -1) && (!grupo || a.grupo === grupo) && (!estado || a.desempeno === estado);
    });
    el('students-count').textContent = visibles.length + (visibles.length === 1 ? ' alumno' : ' alumnos');
    var tb = el('students-tbody');
    if (!visibles.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>Sin resultados</h3></div></td></tr>';
      return;
    }
    tb.innerHTML = visibles.map(function (a, i) {
      var prom = a.promedio;
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:8px">' + av(esc(iniciales(a.nombreAlumno))) + '<span class="td-bold">' + esc(a.nombreAlumno) + '</span></div></td>' +
        '<td><span class="badge b-gray">' + esc(a.grupo) + '</span></td>' +
        '<td><div class="bar-wrap"><div class="bar-track"><div class="bar-fill ' + getBar(prom) + '" style="width:' + (prom ? prom * 5 : 0) + '%"></div></div><b>' +
        (prom === null ? '—' : prom.toFixed(2)) + '</b></div></td>' +
        '<td>' + (a.porcentajeAsistencia === null ? '—' : a.porcentajeAsistencia + '%') + '</td>' +
        '<td>' + (a.tareasPendientes === 0 ? '<span class="badge b-success">Al día</span>' : '<span class="badge b-warning">' + a.tareasPendientes + ' pend.</span>') + '</td>' +
        '<td><span class="badge ' + (BADGE_DESEMPENO[a.desempeno] || 'b-gray') + '">' + esc(a.desempeno) + '</span></td>' +
        '<td style="font-size:12px;color:var(--info)" title="' + esc(a.apoderado) + '">' + esc(a.telefonoApoderado || '—') + '</td></tr>';
    }).join('');
  };

  // ---------------------------------------------------------------
  // Mensajes
  // ---------------------------------------------------------------
  var bandeja = 'recibidos';
  var pedidoMensajes = 0; // cada carga tiene un número: solo se pinta la respuesta del último pedido

  async function cargarMensajes() {
    var lista = el('messages-list');
    var miPedido = ++pedidoMensajes;
    var cual = bandeja; // la bandeja que se pidió, aunque el usuario cambie de pestaña mientras tanto
    var mensajes;
    try {
      mensajes = await pedir('/api/mensajes?bandeja=' + cual);
    } catch (e) {
      if (miPedido === pedidoMensajes) avisarError(e);
      return;
    }
    if (miPedido !== pedidoMensajes) return; // llegó tarde: ya hay un pedido más nuevo
    if (!mensajes.length) {
      lista.innerHTML = '<div class="empty-state"><h3>Bandeja vacía</h3><p>' + (cual === 'enviados' ? 'Aún no has enviado mensajes.' : 'Los mensajes aparecerán aquí.') + '</p></div>';
      return;
    }
    lista.innerHTML = mensajes.map(function (m) {
      var noLeido = cual === 'recibidos' && !m.leido;
      return '<div class="msg-item"' + (noLeido ? ' onclick="marcarLeido(' + Number(m.id_mensaje) + ')" title="Marcar como leído"' : '') + '>' +
        '<div class="msg-av">' + esc(iniciales(m.otro)) + '</div>' +
        '<div style="min-width:0;flex:1"><div class="msg-sender">' + (cual === 'enviados' ? 'Para: ' : '') + esc(m.otro) + '</div>' +
        '<div class="msg-subj" style="font-weight:400;color:var(--muted)">' + esc(m.correoOtro) + '</div>' +
        '<div style="font-size:12.5px;color:var(--slate);margin-top:4px;white-space:pre-wrap">' + esc(m.contenido) + '</div></div>' +
        '<span class="msg-time">' + esc(m.fecha_envio) + '</span>' + (noLeido ? '<div class="msg-dot"></div>' : '') + '</div>';
    }).join('');
  }

  window.verBandeja = function (cual) {
    bandeja = cual;
    el('messages-list').innerHTML = '<div class="empty-state"><p>Cargando…</p></div>';
    el('tab-recibidos').classList.toggle('active', cual === 'recibidos');
    el('tab-enviados').classList.toggle('active', cual === 'enviados');
    cargarMensajes();
  };

  window.marcarLeido = async function (id) {
    try {
      await pedir('/api/mensajes/' + id + '/leido', { method: 'PATCH' });
    } catch (e) {
      avisarError(e);
    }
    cargarMensajes();
  };

  window.enviarMensaje = async function () {
    var datos = { para: el('msg-para').value.trim(), contenido: el('msg-contenido').value.trim() };
    var revision = C.revisarMensaje(datos, CU.email);
    if (!revision.valido) { showToast(revision.errores[0]); return; }
    try {
      await enviarJson('/api/mensajes', 'POST', datos);
      el('msg-para').value = '';
      el('msg-contenido').value = '';
      closeModal('modal-new-msg');
      verBandeja('enviados');
      showToast('Mensaje enviado');
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // Enganche con la navegación
  // ---------------------------------------------------------------
  var showPageAnterior = window.showPage;
  window.showPage = function (id) {
    // El showPage original pinta Mis Alumnos al instante: se vacía antes, para no mostrar ni un
    // momento los alumnos de un usuario anterior (p. ej. tras cerrar sesión en la misma pestaña).
    if (id === 'alumnos') misAlumnos = [];
    showPageAnterior(id);
    if (!CU) return;
    if (id === 'horario') buildSchedule();
    if (id === 'seccion') buildSeccion();
    if (id === 'alumnos' && CU.role === 'teacher') cargarMisAlumnos();
    if (id === 'mensajes') verBandeja('recibidos');
  };
})();
