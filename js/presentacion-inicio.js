/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (Inicio y Mi Perfil, todos los roles)
 * ---------------------------------------------------------------------------
 * El prototipo pintaba "?" o "0" fijos en las tarjetas de Inicio y "?" en el perfil. Aquí se
 * reemplazan por datos reales de GET /api/resumen y GET /api/perfil, y se conecta el cambio de
 * contraseña (POST /api/auth/contrasena).
 */
(function () {
  'use strict';
  var esc = window.UtilidadesHtml.escaparHtml;
  var pedir = window.ApiCliente.pedir;
  var enviarJson = window.ApiCliente.enviarJson;
  var avisarError = window.ApiCliente.avisarError;

  function el(id) { return document.getElementById(id); }
  function pct(v) { return v === null || v === undefined ? '—' : v + '%'; }
  function cifra(v) { return v === null || v === undefined ? '—' : String(v); }

  /** Tarjeta de panel con título, botón opcional y filas (o un estado vacío). */
  function panel(titulo, filas, vacio, pagina) {
    var boton = pagina ? '<button class="btn btn-sm" onclick="showPage(\'' + pagina + '\')">Ver todo</button>' : '';
    var cuerpo = filas.length
      ? '<div class="card-pad" style="display:flex;flex-direction:column;gap:2px">' + filas.join('') + '</div>'
      : '<div class="empty-state" style="padding:28px"><h3>' + esc(vacio) + '</h3></div>';
    return '<div class="card"><div class="card-header"><h2>' + esc(titulo) + '</h2>' + boton + '</div>' + cuerpo + '</div>';
  }
  function fila(principal, secundario, derecha) {
    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<div><div style="font-size:13px;font-weight:500;color:var(--navy)">' + esc(principal) + '</div>' +
      (secundario ? '<div style="font-size:12px;color:var(--muted)">' + esc(secundario) + '</div>' : '') + '</div>' +
      (derecha ? '<span style="font-size:12px;color:var(--muted);white-space:nowrap">' + esc(derecha) + '</span>' : '') + '</div>';
  }

  // Lo que el prototipo dejaba fijo (saludo, accesos) se arma al instante; las cifras llegan de la API.
  var PINTAR = {
    teacher: function (r) {
      el('dash-stats').innerHTML = sc('si-blue', 'ti-users', cifra(r.alumnosActivos), 'Alumnos registrados') +
        sc('si-green', 'ti-clipboard-check', pct(r.asistenciaPromedio), 'Asistencia promedio') +
        sc('si-amber', 'ti-checklist', cifra(r.tareasAtrasadas), 'Tareas atrasadas') +
        sc('si-red', 'ti-user-x', cifra(r.alumnosEnRiesgo), 'Alumnos en riesgo');
      el('dash-left').innerHTML = panel('Clases de hoy', (r.clasesHoy || []).map(function (c) {
        return fila(c.curso + ' · ' + c.grupo, c.aula || '', c.hora_inicio + ' – ' + c.hora_fin);
      }), 'Hoy no tienes clases programadas');
      el('dash-right').innerHTML = panel('Últimas entregas', (r.ultimasEntregas || []).map(function (e) {
        return fila(e.alumno, e.tarea, e.fecha);
      }), 'Sin entregas aún', 'tareas');
    },
    student: function (r) {
      var lugar = r.lugarEnGrupo ? r.lugarEnGrupo.puesto + ' de ' + r.lugarEnGrupo.total : '—';
      el('dash-stats').innerHTML = sc('si-green', 'ti-award', r.promedioGeneral === null ? '—' : r.promedioGeneral.toFixed(2), 'Promedio general') +
        sc('si-blue', 'ti-checklist', cifra(r.tareasPendientes), 'Tareas pendientes') +
        sc('si-teal', 'ti-calendar-check', pct(r.asistencia), '% Asistencia') +
        sc('si-amber', 'ti-star', esc(lugar), 'Lugar en grupo');
      el('dash-left').innerHTML = panel('Tareas próximas', (r.proximasTareas || []).map(function (t) {
        return fila(t.titulo, t.tipo, 'vence ' + t.fecha_entrega);
      }), 'Sin tareas pendientes', 'tareas');
      el('dash-right').innerHTML = panel('Mis cursos', (r.misCursos || []).map(function (c) {
        return fila(c.curso, c.docente);
      }), 'Aún no tienes cursos asignados');
    },
    jefe: function (r) {
      el('dash-stats').innerHTML = sc('si-blue', 'ti-users', cifra(r.alumnosActivos), 'Alumnos activos') +
        sc('si-green', 'ti-checklist', cifra(r.matriculasActivas), 'Matrículas activas') +
        sc('si-amber', 'ti-clipboard-check', cifra(r.secciones), 'Secciones del año') +
        sc('si-red', 'ti-alert-triangle', cifra(r.reclamosPendientes), 'Reclamos pendientes');
      el('dash-quick').innerHTML = qb('ti-message-circle', 'Reclamos', 'reclamo') + qb('ti-bell', 'Avisos', 'avisos') + qb('ti-user', 'Mi Perfil', 'perfil');
      el('dash-left').innerHTML = panel('Reclamos por atender', (r.reclamosPorAtender || []).map(function (x) {
        return fila(x.asunto, x.autor + ' · prioridad ' + x.prioridad, x.fecha);
      }), 'No hay reclamos pendientes', 'reclamo');
      el('dash-right').innerHTML = '';
    },
    registrador: function (r) {
      el('dash-stats').innerHTML = sc('si-blue', 'ti-users', cifra(r.matriculasActivas), 'Matrículas activas') +
        sc('si-green', 'ti-clipboard-check', cifra(r.matriculasDelMes), 'Matrículas este mes') +
        sc('si-amber', 'ti-checklist', cifra(r.matriculasInactivas), 'Matrículas inactivas') +
        sc('si-teal', 'ti-home', cifra(r.secciones), 'Secciones del año');
      el('dash-quick').innerHTML = qb('ti-users', 'Registro', 'registro') + qb('ti-clipboard-list', 'Matrícula', 'matricula') + qb('ti-user', 'Mi Perfil', 'perfil');
      el('dash-left').innerHTML = panel('Últimas matrículas', (r.ultimasMatriculas || []).map(function (m) {
        return fila(m.alumno, m.codigo + ' · ' + m.seccion, m.fecha);
      }), 'Aún no hay matrículas', 'matricula');
      el('dash-right').innerHTML = '';
    }
  };

  var buildDashboardAnterior = window.buildDashboard;
  window.buildDashboard = function () {
    buildDashboardAnterior(); // saludo y accesos rápidos del diseño
    if (!CU || !PINTAR[CU.role]) return;
    // Mientras llegan los datos, las tarjetas muestran "—" (nunca un "?" ni un 0 inventado).
    el('dash-stats').querySelectorAll('.stat-val').forEach(function (v) { v.textContent = '—'; });
    pedir('/api/resumen')
      .then(function (r) { PINTAR[CU.role](r); })
      .catch(avisarError);
  };

  // ---------------------------------------------------------------
  // Mi Perfil
  // ---------------------------------------------------------------

  function camposDelPerfil(p) {
    var campos = [['Nombre completo', p.nombreCompleto], ['Correo', p.correo], ['Rol', p.rolEtiqueta]];
    if (p.rol === 'docente') {
      campos.push(['DNI', p.dni], ['Especialidad', p.especialidad], ['Grupos', (p.grupos || []).join(', ')], ['Teléfono', p.telefono]);
    }
    if (p.rol === 'alumno') {
      campos.push(['DNI', p.dni], ['Matrícula', p.matricula], ['Grupo', p.grupo ? p.grupo + ' ' + (p.nivel || '') : ''],
        ['Tutor', p.tutor], ['Ciclo', p.ciclo]);
    }
    campos.push(['En el sistema desde', window.LogicaRegistro.fechaPeruana(p.desde)]);
    return campos;
  }

  window.buildProfile = async function () {
    var avatar = CU.role === 'teacher' ? 'av-t' : CU.role === 'student' ? 'av-s' : 'av-admin';
    el('profile-hero-section').innerHTML = '<div class="profile-hero"><div class="ph-av ' + avatar + '">' + esc(CU.initials) + '</div>' +
      '<div style="position:relative;z-index:1"><div class="ph-name">' + esc(CU.name) + '</div><div class="ph-info">' + esc(CU.roleLabel) + '</div>' +
      '<div class="ph-badges"><span class="ph-badge">' + esc(CU.email) + '</span><span class="ph-badge">' + esc(CFG.name) + '</span></div></div></div>';
    var info = el('profile-info-section');
    try {
      var p = await pedir('/api/perfil');
      info.innerHTML = camposDelPerfil(p).map(function (c) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<span style="font-size:13px;color:var(--muted)">' + esc(c[0]) + '</span>' +
          '<span style="font-size:13px;font-weight:600;color:var(--navy);text-align:right">' + esc(c[1] === null || c[1] === undefined || c[1] === '' ? '—' : c[1]) + '</span></div>';
      }).join('');
    } catch (e) {
      avisarError(e);
    }
  };

  // Cambio de contraseña: la regla la valida el servidor (logica-auth.js) y aquí se muestra el resultado.
  window.cambiarContrasena = async function () {
    var datos = { actual: el('pwd-actual').value, nueva: el('pwd-nueva').value, confirmacion: el('pwd-confirmar').value };
    if (datos.nueva !== datos.confirmacion) { showToast('La confirmación no coincide con la nueva contraseña'); return; }
    try {
      await enviarJson('/api/auth/contrasena', 'POST', datos);
      ['pwd-actual', 'pwd-nueva', 'pwd-confirmar'].forEach(function (id) { el(id).value = ''; });
      showToast('Contraseña actualizada');
    } catch (e) {
      avisarError(e);
    }
  };
})();
