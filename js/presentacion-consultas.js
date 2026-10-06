/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (pantallas de consulta sin HU propia)
 * ---------------------------------------------------------------------------
 * Horario, Mi Sección, Mis Alumnos y Mensajes mostraban datos fijos o vacíos en el prototipo.
 * Aquí leen la base real (GET /api/horario, /api/seccion, /api/alumnos y /api/mensajes).
 * Son de solo lectura, salvo enviar un mensaje y marcarlo como leído. El campo "Para" de
 * Redactar sugiere destinatarios mientras se escribe (HU-013, GET /api/mensajes/destinatarios).
 */
(function () {
  'use strict';
  var LD = window.LogicaDocente;
  var C = window.LogicaComunicacion;
  var esc = window.UtilidadesHtml.escaparHtml;
  var iniciales = window.UtilidadesHtml.iniciales;
  var pedir = window.ApiCliente.pedir;
  var enviarJson = window.ApiCliente.enviarJson;
  var parametros = window.ApiCliente.parametros;
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

  // ---------------------------------------------------------------
  // Campo "Para": buscador de destinatarios (HU-013)
  // ---------------------------------------------------------------
  var ESPERA_BUSQUEDA_MS = 250; // se busca cuando el usuario deja de teclear, no en cada letra
  var elegidos = [];            // [{ id_usuario, nombre }] en el orden en que se eligieron
  var sugerencias = [];         // resultados visibles de la última búsqueda
  var resaltada = -1;           // sugerencia marcada con las flechas
  var temporizador = null;
  var busquedaEnCurso = null;   // AbortController del pedido anterior: una respuesta vieja no pisa a la nueva

  function cerrarSugerencias() {
    var lista = el('msg-para-lista');
    lista.hidden = true;
    lista.innerHTML = '';
    el('msg-para-buscar').setAttribute('aria-expanded', 'false');
    el('msg-para-buscar').removeAttribute('aria-activedescendant');
    sugerencias = [];
    resaltada = -1;
  }

  function pintarElegidos() {
    el('msg-para-chips').innerHTML = elegidos.map(function (d) {
      return '<span class="dest-chip"><span>' + esc(d.nombre) + '</span>' +
        '<button type="button" onclick="quitarDestinatario(' + Number(d.id_usuario) + ')" aria-label="Quitar a ' + esc(d.nombre) + '">×</button></span>';
    }).join('');
    el('msg-para-buscar').placeholder = elegidos.length ? '' : 'Escribe un nombre o correo...';
  }

  function pintarSugerencias(textoBuscado) {
    var lista = el('msg-para-lista');
    var campo = el('msg-para-buscar');
    lista.innerHTML = sugerencias.length
      ? sugerencias.map(function (d, i) {
        // mousedown con preventDefault: el campo no pierde el foco (y la lista no se cierra) antes del clic.
        return '<div class="dest-op" role="option" id="msg-dest-op-' + i + '" aria-selected="' + (i === resaltada) + '"' +
          ' onmousedown="event.preventDefault()" onclick="elegirDestinatario(' + i + ')">' +
          '<div class="msg-av">' + esc(iniciales(d.nombre)) + '</div>' +
          '<div style="min-width:0"><div class="dest-op-nombre">' + esc(d.nombre) + '</div>' +
          '<div class="dest-op-detalle">' + esc(d.detalle) + ' · ' + esc(d.correo) + '</div></div></div>';
      }).join('')
      : '<div class="dest-vacio">No encontramos a nadie con «' + esc(textoBuscado) + '» entre las personas a las que puedes escribir.</div>';
    lista.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
    if (resaltada >= 0) {
      campo.setAttribute('aria-activedescendant', 'msg-dest-op-' + resaltada);
      el('msg-dest-op-' + resaltada).scrollIntoView({ block: 'nearest' });
    } else {
      campo.removeAttribute('aria-activedescendant');
    }
  }

  async function buscarDestinatarios() {
    var q = el('msg-para-buscar').value;
    if (busquedaEnCurso) busquedaEnCurso.abort();
    busquedaEnCurso = null;
    if (!C.palabrasDeBusqueda(q).length) { cerrarSugerencias(); return; }
    var control = busquedaEnCurso = new AbortController();
    var resultado;
    try {
      resultado = await pedir('/api/mensajes/destinatarios' + parametros({ q: q.trim() }), { signal: control.signal });
    } catch (e) {
      if (e.name !== 'AbortError') avisarError(e);
      return;
    }
    if (control !== busquedaEnCurso) return;
    busquedaEnCurso = null;
    var ya = elegidos.map(function (d) { return d.id_usuario; });
    sugerencias = resultado.filter(function (d) { return ya.indexOf(d.id_usuario) === -1; });
    resaltada = sugerencias.length ? 0 : -1;
    pintarSugerencias(q.trim());
  }

  window.elegirDestinatario = function (i) {
    var d = sugerencias[i];
    if (!d) return;
    if (elegidos.length >= C.MAX_DESTINATARIOS) {
      showToast('Puedes escribir a ' + C.MAX_DESTINATARIOS + ' destinatarios como máximo');
      return;
    }
    elegidos.push({ id_usuario: d.id_usuario, nombre: d.nombre });
    el('msg-para-buscar').value = '';
    cerrarSugerencias();
    pintarElegidos();
    el('msg-para-buscar').focus();
  };

  window.quitarDestinatario = function (id) {
    elegidos = elegidos.filter(function (d) { return d.id_usuario !== id; });
    pintarElegidos();
    el('msg-para-buscar').focus();
  };

  function limpiarRedaccion() {
    elegidos = [];
    pintarElegidos();
    el('msg-para-buscar').value = '';
    el('msg-contenido').value = '';
    cerrarSugerencias();
  }

  (function engancharBuscador() {
    var campo = el('msg-para-buscar');
    campo.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(buscarDestinatarios, ESPERA_BUSQUEDA_MS);
    });
    campo.addEventListener('keydown', function (e) {
      var abierta = !el('msg-para-lista').hidden && sugerencias.length > 0;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && abierta) {
        e.preventDefault();
        var paso = e.key === 'ArrowDown' ? 1 : -1;
        resaltada = (resaltada + paso + sugerencias.length) % sugerencias.length;
        pintarSugerencias(campo.value.trim());
      } else if (e.key === 'Enter' && abierta && resaltada >= 0) {
        e.preventDefault();
        elegirDestinatario(resaltada);
      } else if (e.key === 'Escape' && !el('msg-para-lista').hidden) {
        e.preventDefault();
        e.stopPropagation();
        cerrarSugerencias();
      } else if (e.key === 'Backspace' && !campo.value && elegidos.length) {
        quitarDestinatario(elegidos[elegidos.length - 1].id_usuario); // como en el correo: borra la última etiqueta
      }
    });
    campo.addEventListener('blur', function () {
      clearTimeout(temporizador);
      cerrarSugerencias();
    });
    // Un clic en cualquier parte del recuadro (entre etiquetas) lleva el foco al campo.
    el('msg-para-box').addEventListener('mousedown', function (e) {
      if (e.target === el('msg-para-box')) { e.preventDefault(); campo.focus(); }
    });
  })();

  window.enviarMensaje = async function () {
    var datos = { para: elegidos.map(function (d) { return d.id_usuario; }), contenido: el('msg-contenido').value.trim() };
    var revision = C.revisarMensaje(datos, CU.email);
    if (!revision.valido) {
      // Escribió un nombre pero no lo eligió de la lista: se lo decimos en vez de "elige un destinatario".
      showToast(!datos.para.length && el('msg-para-buscar').value.trim() ? 'Elige al destinatario de la lista de sugerencias' : revision.errores[0]);
      return;
    }
    try {
      var r = await enviarJson('/api/mensajes', 'POST', datos);
      limpiarRedaccion();
      closeModal('modal-new-msg');
      verBandeja('enviados');
      showToast(r.enviados > 1 ? 'Mensaje enviado a ' + r.enviados + ' destinatarios' : 'Mensaje enviado');
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
