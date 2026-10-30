/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (rol Alumno)
 * ---------------------------------------------------
 * HU-007 Mis calificaciones · HU-009 Mi asistencia · HU-010 CA-003 Mis tareas
 *
 * Reemplaza las vistas del alumno del prototipo (datos de relleno: 100 % de asistencia, todos los
 * días "presente") por datos reales de /api/mi, que siempre filtra por el alumno de la sesión.
 * Las reglas viven en js/logica-alumno.js.
 */
(function () {
  'use strict';
  var A = window.LogicaAlumno;
  var LD = window.LogicaDocente;
  var esc = window.UtilidadesHtml.escaparHtml;
  var pedir = window.ApiCliente.pedir;
  var avisarError = window.ApiCliente.avisarError;

  var API = {
    calificaciones: function () { return pedir('/api/mi/calificaciones'); },
    asistencia: function () { return pedir('/api/mi/asistencia'); },
    tareas: function () { return pedir('/api/mi/tareas'); },
    marcarEntrega: function (id) { return pedir('/api/mi/tareas/' + id + '/entrega', { method: 'POST' }); },
    desmarcarEntrega: function (id) { return pedir('/api/mi/tareas/' + id + '/entrega', { method: 'DELETE' }); }
  };

  function esAlumno() {
    return CU && CU.role === 'student';
  }

  function nota(v) {
    return v === null || v === undefined || v === '' ? '<span class="gv gv-dash">—</span>' : '<span class="gv">' + esc(Number(v).toFixed(2)) + '</span>';
  }

  // ---------------------------------------------------------------
  // HU-007 — Mis calificaciones (solo lectura: CA-002)
  // ---------------------------------------------------------------

  var buildGradesHeaderAnterior = window.buildGradesHeader;
  window.buildGradesHeader = function () {
    if (!esAlumno()) return buildGradesHeaderAnterior();
    // El cuadro guarda las notas por periodo (no por materia): las columnas reflejan eso.
    document.getElementById('grades-thead').innerHTML =
      '<tr><th>Periodo</th><th>Grupo · Tutor</th><th>Examen 1</th><th>Examen 2</th><th>Tareas</th><th>Proyecto</th><th>Promedio</th><th>Estado</th></tr>';
  };

  var misCalificaciones = [];
  var renderGradesAnterior = window.renderGrades;
  window.renderGrades = function (data) {
    if (!esAlumno()) return renderGradesAnterior(data);
    var tb = document.getElementById('grades-tbody');
    if (!tb) return;
    if (!misCalificaciones.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>Aún no tienes calificaciones registradas</h3></div></td></tr>';
      return;
    }
    tb.innerHTML = misCalificaciones.map(function (c) {
      return '<tr><td class="td-bold">' + esc(c.periodo) + '</td>' +
        '<td style="color:var(--muted);font-size:12px">' + esc(c.grupo) + (c.tutor ? ' · ' + esc(c.tutor) : '') + '</td>' +
        '<td>' + nota(c.examen1) + '</td><td>' + nota(c.examen2) + '</td><td>' + nota(c.tareas) + '</td><td>' + nota(c.proyecto) + '</td>' +
        '<td><div class="bar-wrap"><div class="bar-track"><div class="bar-fill ' + getBar(c.promedio) + '" style="width:' + (c.promedio ? c.promedio * 5 : 0) + '%"></div></div>' +
        '<span class="td-bold">' + (c.promedio !== null ? c.promedio.toFixed(2) : '—') + '</span></div></td>' +
        '<td><span class="badge ' + getBadge(c.promedio) + '">' + esc(c.estado) + '</span></td></tr>';
    }).join('');
  };

  async function cargarMisCalificaciones() {
    try {
      misCalificaciones = await API.calificaciones();
    } catch (e) {
      misCalificaciones = [];
      avisarError(e);
    }
    buildGradesHeader();
    renderGrades([]);
  }

  // ---------------------------------------------------------------
  // HU-009 — Mi asistencia: calendario del mes + indicadores acumulados
  // ---------------------------------------------------------------

  var CLASE_DIA = { presente: 'att-p', ausente: 'att-a', tardanza: 'att-l' };
  var TITULO_DIA = { presente: 'Presente', ausente: 'Falta', tardanza: 'Tardanza', 'sin-registro': 'Sin registro',
    'no-lectivo': 'No escolar', futuro: 'Aún no transcurre' };

  window.buildStudentAttCalendar = async function () {
    var contenedor = document.getElementById('att-calendar');
    if (!contenedor) return;
    var datos;
    try {
      datos = await API.asistencia();
    } catch (e) {
      avisarError(e);
      contenedor.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No se pudo cargar tu asistencia</h3></div>';
      return;
    }
    var hoy = new Date();
    var cal = A.construirCalendarioAsistencia(hoy.getFullYear(), hoy.getMonth(), datos.registros, hoy);
    document.getElementById('att-cal-title').textContent = cal.titulo; // CA-001

    var html = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(function (d) { return '<div class="att-lbl">' + d + '</div>'; }).join('');
    for (var i = 0; i < cal.desfase; i++) html += '<div class="att-empty"></div>';
    cal.dias.forEach(function (d) {
      // CA-002: no lectivos y días futuros van sin estado y atenuados.
      var atenuado = d.tipo === 'no-lectivo' || d.tipo === 'futuro' || d.tipo === 'sin-registro';
      var clase = CLASE_DIA[d.tipo] || 'att-h';
      html += '<div class="att-day ' + clase + '" title="' + esc(TITULO_DIA[d.tipo]) + '"' +
        (atenuado ? ' style="opacity:' + (d.tipo === 'futuro' ? '.35' : '.6') + '"' : '') + '>' + d.dia + '</div>';
    });
    contenedor.innerHTML = html;

    // CA-003: tarjetas de días registrados, faltas, tardanzas y % acumulado.
    var r = datos.resumen;
    document.getElementById('att-student-stats').innerHTML =
      sc('si-green', 'ti-circle-check', r.diasRegistrados, 'Días registrados') +
      sc('si-red', 'ti-circle-x', r.faltas, 'Faltas') +
      sc('si-amber', 'ti-clock', r.tardanzas, 'Llegadas tarde') +
      sc('si-teal', 'ti-chart-pie', r.porcentaje === null ? '—' : r.porcentaje + '%', '% Asistencia');
  };

  // ---------------------------------------------------------------
  // HU-010 CA-003 — Mis tareas: consulta y marcado de SUS entregas
  // ---------------------------------------------------------------

  var misTareas = [];
  var FILTRO_A_ESTADO = { all: 'todas', pending: 'pendiente', done: 'entregada', late: 'atrasada' };
  var CLASE_POR_ESTADO = {
    pendiente: { badge: 'b-info', due: 'due-soon', texto: 'Pendiente' },
    atrasada: { badge: 'b-danger', due: 'due-late', texto: 'Atrasada' },
    entregada: { badge: 'b-success', due: 'due-ok', texto: 'Entregada' }
  };

  var renderTasksAnterior = window.renderTasks;
  window.renderTasks = function () {
    if (!esAlumno()) return renderTasksAnterior();
    var el = document.getElementById('tasks-list');
    if (!el) return;
    var visibles = LD.filtrarTareasPorEstado(misTareas, FILTRO_A_ESTADO[taskFilter] || 'todas');
    if (!visibles.length) {
      var msg = taskFilter === 'late' ? 'Sin tareas atrasadas!' : taskFilter === 'done' ? 'Sin tareas entregadas.'
        : taskFilter === 'pending' ? 'Sin tareas pendientes.' : 'Sin tareas registradas.';
      el.innerHTML = '<div class="empty-state"><h3>' + msg + '</h3></div>';
      return;
    }
    el.innerHTML = visibles.map(function (t) {
      var c = CLASE_POR_ESTADO[t.estado] || CLASE_POR_ESTADO.pendiente;
      var entregue = t.entregue;
      return '<div class="task-item">' +
        '<div class="task-check editable ' + (entregue ? 'done' : '') + '" onclick="marcarMiEntrega(' + Number(t.id_tarea) + ',' + (!entregue) + ')" ' +
        'title="' + (entregue ? 'Desmarcar mi entrega' : 'Marcar como entregada') + '">' + (entregue ? '&#10003;' : '') + '</div>' +
        '<div style="flex:1"><div class="task-title" style="' + (entregue ? 'text-decoration:line-through;opacity:.5' : '') + '">' + esc(t.titulo) + '</div>' +
        '<div class="task-meta">' + esc(t.materia || 'General') + ' · ' + esc(t.tipo || 'Tarea') +
        (t.fecha_entrega_real ? ' · entregada el ' + esc(t.fecha_entrega_real) : '') + '</div></div>' +
        '<span class="task-due ' + c.due + '">' + esc(t.fecha_entrega) + '</span>' +
        '<span class="badge ' + c.badge + '" style="margin-left:8px">' + c.texto + '</span></div>';
    }).join('');
  };

  async function cargarMisTareas() {
    try {
      misTareas = await API.tareas();
    } catch (e) {
      misTareas = [];
      avisarError(e);
    }
    renderTasks();
  }

  window.marcarMiEntrega = async function (idTarea, entregar) {
    try {
      if (entregar) await API.marcarEntrega(idTarea);
      else await API.desmarcarEntrega(idTarea);
      showToast(entregar ? 'Entrega registrada' : 'Entrega desmarcada');
    } catch (e) {
      avisarError(e);
    }
    await cargarMisTareas(); // siempre se relee de la BD
  };

  // ---------------------------------------------------------------
  // Enganche con la navegación
  // ---------------------------------------------------------------
  var showPageAnterior = window.showPage;
  window.showPage = function (id) {
    showPageAnterior(id);
    if (!esAlumno()) return;
    if (id === 'calificaciones') cargarMisCalificaciones();
    if (id === 'tareas') cargarMisTareas();
  };
})();
