/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (rol Registrador)
 * --------------------------------------------------------
 * HU-002 Registro · HU-003 Matrícula · HU-004 Estado de matrículas
 *
 * Igual que presentacion-docente.js: se carga después del <script> original de dashboard.html y
 * reemplaza las funciones del prototipo (que guardaban en arrays en memoria) por llamadas a la API.
 * Las reglas viven en js/logica-registro.js (la misma que valida el servidor).
 */
(function () {
  'use strict';
  var R = window.LogicaRegistro;
  var esc = window.UtilidadesHtml.escaparHtml;
  var pedir = window.ApiCliente.pedir;
  var enviarJson = window.ApiCliente.enviarJson;
  var parametros = window.ApiCliente.parametros;
  var avisarError = window.ApiCliente.avisarError;

  var API = {
    registros: function (filtros) { return pedir('/api/registros' + parametros(filtros)); },
    registrar: function (datos) { return enviarJson('/api/registros', 'POST', datos); },
    matriculas: function (filtros) { return pedir('/api/matriculas' + parametros(filtros)); },
    matricular: function (datos) { return enviarJson('/api/matriculas', 'POST', datos); },
    alternarEstado: function (id) { return pedir('/api/matriculas/' + id + '/estado', { method: 'PATCH' }); }
  };

  function valorDe(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function limpiar(ids) {
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  }
  function esRegistrador() {
    return CU && CU.role === 'registrador';
  }

  /** Fila "etiqueta: valor" del panel de detalle (todo escapado). */
  function filaDetalle(etiqueta, valor, ultima) {
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0' +
      (ultima ? '' : ';border-bottom:1px solid var(--border)') + '">' +
      '<span style="font-size:12px;color:var(--muted)">' + esc(etiqueta) + '</span>' +
      '<span style="font-size:13px;color:var(--navy);text-align:right">' + esc(valor || '—') + '</span></div>';
  }

  /**
   * La contraseña inicial solo existe en la respuesta del alta: se muestra UNA vez para que el
   * registrador se la entregue a la persona. No se guarda en ninguna variable global.
   */
  function avisoContrasena(registro) {
    if (!registro.contrasenaInicial) return '';
    return '<div style="margin-top:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--r);font-size:12px;color:#9a3412">' +
      'Contraseña inicial de <b>' + esc(registro.correo) + '</b>: ' +
      '<code style="font-size:13px;background:#fff;padding:2px 6px;border-radius:4px">' + esc(registro.contrasenaInicial) + '</code>' +
      '<br>Entrégala ahora: no se volverá a mostrar.</div>';
  }

  var SEXO = { M: 'Masculino', F: 'Femenino' };
  var PROCEDENCIA = { nuevo: 'Alumno nuevo', traslado: 'Traslado de otro colegio', promocion: 'Promoción interna' };
  var BADGE_TIPO = { alumno: 'b-info', docente: 'b-success', apoderado: 'b-warning' };
  var BADGE_ESTADO = { activa: 'b-success', inactiva: 'b-danger' };
  function capital(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  // ---------------------------------------------------------------
  // HU-002 — Registro de alumnos, docentes y apoderados
  // ---------------------------------------------------------------

  var registros = [];

  // CA-002: los campos de alumno solo se ven con el tipo "Alumno"; la especialidad, solo con "Docente".
  window.toggleRegistroAlumnoFields = function () {
    var tipo = valorDe('ci-reg-tipo');
    ['ci-reg-sexo-wrap', 'ci-reg-seccion-wrap', 'ci-reg-direccion-wrap', 'ci-reg-apoderado-wrap', 'ci-reg-fechanac-wrap']
      .forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = tipo === 'alumno' ? '' : 'none'; });
    var esp = document.getElementById('ci-reg-especialidad-wrap');
    if (esp) esp.style.display = tipo === 'docente' ? '' : 'none';
    // El apoderado sí tiene dirección propia.
    var dir = document.getElementById('ci-reg-direccion-wrap');
    if (dir && tipo === 'apoderado') dir.style.display = '';
  };

  async function cargarRegistros() {
    try {
      registros = await API.registros({});
      renderRegistro();
    } catch (e) {
      avisarError(e);
    }
  }
  window.cargarRegistros = cargarRegistros;

  // CA-001: listado con su contador; el filtro (tipo + búsqueda) lo aplica la capa de Lógica.
  function renderRegistro() {
    var el = document.getElementById('registro-list');
    if (!el) return;
    var visibles = R.filtrarRegistros(registros, { tipo: valorDe('registro-filter-tipo'), busqueda: valorDe('registro-search') });
    var contador = document.getElementById('registro-count');
    if (contador) contador.textContent = visibles.length + (visibles.length === 1 ? ' registro' : ' registros');
    if (!visibles.length) {
      el.innerHTML = '<div class="empty-state"><p>No hay registros que coincidan.</p></div>';
      return;
    }
    el.innerHTML = visibles.map(function (r) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" ' +
        'onclick="verRegistro(\'' + esc(r.tipo) + '\',' + Number(r.id) + ')">' +
        '<div><div style="font-size:13px;font-weight:500;color:var(--navy)">' + esc(r.nombre) + '</div>' +
        '<div style="font-size:12px;color:var(--muted)">' + esc(r.correo || r.telefono || r.dni) + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px"><span class="badge ' + (BADGE_TIPO[r.tipo] || 'b-gray') + '">' + esc(capital(r.tipo)) + '</span>' +
        '<span style="font-size:11px;color:var(--muted)">' + esc(r.fecha) + '</span></div></div>';
    }).join('');
  }
  window.renderRegistro = renderRegistro;
  window.filterRegistro = renderRegistro;

  function showDtRegistro(r) {
    var el = document.getElementById('dt-registro-detalle');
    if (!el || !r) return;
    var filas = [filaDetalle('Nombre', r.nombre), filaDetalle('Tipo', capital(r.tipo)), filaDetalle('DNI', r.dni)];
    if (r.tipo === 'alumno') {
      filas.push(filaDetalle('Fecha de nacimiento', R.fechaPeruana(r.fecha_nacimiento)), filaDetalle('Sexo', SEXO[r.sexo]),
        filaDetalle('Nivel', r.nivel), filaDetalle('Sección', r.seccion || 'Sin matrícula'), filaDetalle('Dirección', r.direccion),
        filaDetalle('Apoderado', r.apoderado_nombre), filaDetalle('Tel. apoderado', r.apoderado_telefono));
      if (r.codigoMatricula) filas.push(filaDetalle('Matrícula', r.codigoMatricula));
    }
    if (r.tipo === 'docente') filas.push(filaDetalle('Especialidad', r.especialidad));
    if (r.tipo === 'apoderado') filas.push(filaDetalle('Dirección', r.direccion));
    filas.push(filaDetalle('Correo', r.correo), filaDetalle('Teléfono', r.telefono, true));
    el.innerHTML = '<div style="display:grid">' + filas.join('') + '</div>' +
      '<div style="margin-top:10px;padding:8px 12px;background:var(--accent-light);border-radius:var(--r);font-size:12px;color:var(--accent)">✓ Registrado el ' + esc(r.fecha) + '</div>' +
      avisoContrasena(r);
  }
  window.showDtRegistro = showDtRegistro;
  window.verRegistro = function (tipo, id) {
    showDtRegistro(registros.filter(function (r) { return r.tipo === tipo && r.id === id; })[0]);
  };

  // CA-001 / CA-003: guarda en la BD (USUARIO + ALUMNO/DOCENTE o APODERADO) tras validar.
  window.submitRegistroForm = async function () {
    var tipo = valorDe('ci-reg-tipo');
    var datos = {
      tipo: tipo, nombre: valorDe('ci-reg-nombre'), dni: valorDe('ci-reg-dni'),
      correo: valorDe('ci-reg-email'), telefono: valorDe('ci-reg-tel'),
      direccion: (tipo === 'alumno' || tipo === 'apoderado') ? valorDe('ci-reg-direccion') : ''
    };
    if (tipo === 'alumno') {
      Object.assign(datos, {
        fecha_nacimiento: valorDe('ci-reg-fechanac'), sexo: valorDe('ci-reg-sexo'), nivel: valorDe('ci-reg-nivel'),
        grado: valorDe('ci-reg-grado'), seccion: valorDe('ci-reg-seccionletra'),
        apoderado_nombre: valorDe('ci-reg-apoderado'), apoderado_dni: valorDe('ci-reg-apo-dni'),
        apoderado_telefono: valorDe('ci-reg-apo-tel')
      });
    }
    if (tipo === 'docente') datos.especialidad = valorDe('ci-reg-especialidad');

    var revision = R.revisarRegistro(datos, new Date());
    if (!revision.valido) { showToast(revision.errores[0]); return; }

    try {
      var creado = await API.registrar(datos);
      limpiar(['ci-reg-nombre', 'ci-reg-dni', 'ci-reg-fechanac', 'ci-reg-direccion', 'ci-reg-email', 'ci-reg-tel',
        'ci-reg-apoderado', 'ci-reg-apo-dni', 'ci-reg-apo-tel', 'ci-reg-especialidad', 'ci-reg-sexo', 'ci-reg-nivel', 'ci-reg-seccionletra']);
      updateGradoOptions('ci-reg-nivel', 'ci-reg-grado');
      await cargarRegistros();
      showDtRegistro(creado); // incluye la contraseña inicial, que no está en el listado
      showToast(capital(creado.tipo) + ' registrado correctamente');
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // HU-003 / HU-004 — Matrículas
  // ---------------------------------------------------------------

  var matriculas = [];

  async function cargarMatriculas() {
    try {
      matriculas = await API.matriculas({});
      renderMatriculas();
    } catch (e) {
      avisarError(e);
    }
  }
  window.cargarMatriculas = cargarMatriculas;

  // HU-004 CA-001 / CA-003: filtro por estado, búsqueda por nombre o documento y contador de resultados.
  function renderMatriculas() {
    var tbody = document.getElementById('matricula-tbody');
    if (!tbody) return;
    var visibles = R.filtrarMatriculas(matriculas, { estado: valorDe('matricula-filter-estado') || 'all', busqueda: valorDe('matricula-search') });
    var contador = document.getElementById('matricula-count');
    if (contador) contador.textContent = visibles.length + (visibles.length === 1 ? ' matrícula' : ' matrículas');
    if (!visibles.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No hay matrículas que coincidan.</td></tr>';
      return;
    }
    tbody.innerHTML = visibles.map(function (m) {
      var id = Number(m.id_matricula);
      return '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:10px 16px;font-size:12px;color:var(--muted);white-space:nowrap">' + esc(m.codigo) + '</td>' +
        '<td style="padding:10px 16px;font-size:13px;font-weight:500;color:var(--navy)">' + esc(m.nombreAlumno) + '</td>' +
        '<td style="padding:10px 16px;font-size:13px"><span class="badge b-gray">' + esc(m.seccion) + ' ' + esc(m.nivel) + '</span></td>' +
        '<td style="padding:10px 16px;font-size:13px;color:var(--muted)">' + esc(m.anio_lectivo) + '</td>' +
        '<td style="padding:10px 16px;font-size:13px;color:var(--muted);white-space:nowrap">' + esc(m.fecha) + '</td>' +
        '<td style="padding:10px 16px"><span class="badge ' + (BADGE_ESTADO[m.estado] || 'b-gray') + '" onclick="toggleMatriculaEstado(' + id + ')" ' +
        'style="cursor:pointer" title="Cambiar a ' + esc(R.alternarEstadoMatricula(m.estado)) + '">' + esc(capital(m.estado)) + '</span></td>' +
        '<td style="padding:10px 16px"><button class="btn btn-sm" onclick="verMatricula(' + id + ')" title="Ver detalle">Ver</button></td></tr>';
    }).join('');
  }
  window.renderMatriculas = renderMatriculas;
  window.filterMatriculas = renderMatriculas;
  window.updateMatriculaCount = renderMatriculas;

  function showDtMatricula(m) {
    var el = document.getElementById('dt-matricula-detalle');
    if (!el || !m) return;
    el.innerHTML = '<div style="display:grid">' + [
      filaDetalle('N° Matrícula', m.codigo), filaDetalle('Alumno', m.nombreAlumno), filaDetalle('DNI', m.dni),
      filaDetalle('Fecha de nacimiento', R.fechaPeruana(m.fecha_nacimiento)), filaDetalle('Sexo', SEXO[m.sexo]),
      filaDetalle('Procedencia', PROCEDENCIA[m.procedencia]), filaDetalle('Dirección', m.direccion),
      filaDetalle('Nivel', m.nivel), filaDetalle('Sección', m.seccion), filaDetalle('Año lectivo', String(m.anio_lectivo)),
      filaDetalle('Turno', m.turno), filaDetalle('Apoderado', m.apoderado_nombre), filaDetalle('DNI apoderado', m.apoderado_dni),
      filaDetalle('Teléfono apoderado', m.apoderado_telefono), filaDetalle('Correo apoderado', m.apoderado_correo),
      filaDetalle('Estado', capital(m.estado), !m.observaciones)
    ].join('') + (m.observaciones ? '<div style="padding:8px;background:var(--cream);border-radius:var(--r);font-size:12px;color:var(--muted)">' + esc(m.observaciones) + '</div>' : '') +
      '</div><div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border-radius:var(--r);font-size:12px;color:#16a34a">✓ Matrícula registrada el ' + esc(m.fecha) + '</div>' +
      avisoContrasena({ contrasenaInicial: m.contrasenaInicial, correo: 'alumno.' + m.dni + '@acadecam.edu.pe' });
  }
  window.showDtMatricula = showDtMatricula;
  window.verMatricula = function (id) {
    showDtMatricula(matriculas.filter(function (m) { return m.id_matricula === id; })[0]);
  };

  // HU-004 CA-002: alterna activa <-> inactiva en la BD; el código se conserva.
  window.toggleMatriculaEstado = async function (id) {
    try {
      var m = await API.alternarEstado(id);
      await cargarMatriculas();
      showToast('Matrícula ' + m.codigo + ' ahora está ' + m.estado);
    } catch (e) {
      avisarError(e);
    }
  };

  // HU-003: CA-003 valida los (*) con el mensaje de la HU; CA-001 el código lo genera el servidor.
  window.submitMatriculaForm = async function () {
    var datos = {
      nombre: valorDe('ci-mat-nombre'), dni: valorDe('ci-mat-dni'), fecha_nacimiento: valorDe('ci-mat-fechanac'),
      sexo: valorDe('ci-mat-sexo'), procedencia: valorDe('ci-mat-procedencia') || 'nuevo', direccion: valorDe('ci-mat-direccion'),
      nivel: valorDe('ci-mat-nivel'), grado: valorDe('ci-mat-grado'), seccion: valorDe('ci-mat-seccion'),
      anio_lectivo: valorDe('ci-mat-anio'), turno: valorDe('ci-mat-turno'),
      apoderado_nombre: valorDe('ci-mat-apoderado'), apoderado_dni: valorDe('ci-mat-apo-dni'),
      apoderado_telefono: valorDe('ci-mat-apo-tel'), apoderado_correo: valorDe('ci-mat-apo-email'),
      observaciones: valorDe('ci-mat-obs')
    };
    var revision = R.revisarMatricula(datos, new Date());
    if (!revision.valido) { showToast(revision.errores[0]); return; }

    try {
      var creada = await API.matricular(datos);
      limpiar(['ci-mat-nombre', 'ci-mat-dni', 'ci-mat-fechanac', 'ci-mat-direccion', 'ci-mat-apoderado', 'ci-mat-apo-dni',
        'ci-mat-apo-tel', 'ci-mat-apo-email', 'ci-mat-obs', 'ci-mat-seccion', 'ci-mat-sexo', 'ci-mat-nivel', 'ci-mat-turno']);
      document.getElementById('ci-mat-procedencia').value = 'nuevo';
      updateGradoOptions('ci-mat-nivel', 'ci-mat-grado');
      await cargarMatriculas();
      showDtMatricula(creada);
      showToast('Matrícula ' + creada.codigo + ' registrada');
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
    if (!esRegistrador()) return;
    if (id === 'registro') { toggleRegistroAlumnoFields(); cargarRegistros(); }
    if (id === 'matricula') {
      var anio = document.getElementById('ci-mat-anio');
      if (anio && !anio.value) anio.value = String(new Date().getFullYear());
      cargarMatriculas();
    }
  };
})();
