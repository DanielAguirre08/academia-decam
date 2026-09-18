/**
 * ACADEMIA DECAM — CAPA DE PRESENTACIÓN (rol Docente)
 * ---------------------------------------------------------
 * Este archivo se carga DESPUÉS del script original de dashboard.html (ver los <script>
 * agregados antes de </body>). En JavaScript clásico (sin módulos), una función declarada
 * de nuevo con el mismo nombre reemplaza a la anterior en el ámbito global: por eso podemos
 * "corregir" calcAvg, getStatus, filterGrades, loadAttGroup, renderTasks, etc. sin tocar ni
 * una línea del <script> original ni del HTML.
 *
 * QUÉ CAMBIÓ EN ESTA VERSIÓN
 * --------------------------
 * Antes, los datos vivían en memoria del navegador (js/datos-docente.js). Ahora TODO sale de
 * la API REST del backend Express, que a su vez lee y escribe en MySQL:
 *
 *     Presentación (este archivo)  ->  fetch()  ->  Express (routes/*.js)  ->  MySQL
 *                                                        |
 *                                                        +-> logica-docente.js (reglas puras)
 *
 * js/datos-docente.js queda en el proyecto como referencia del prototipo en memoria, pero
 * este archivo ya NO lo usa: su reemplazo es el objeto `API` de aquí abajo.
 *
 * La capa de Lógica (js/logica-docente.js) NO cambia: sigue siendo funciones puras sin DOM,
 * y ahora se ejecuta en los dos lados (navegador y servidor) con el mismo archivo.
 *
 * Dependencias globales que ya existen en dashboard.html y que esta capa reutiliza:
ATENCIÓN con el ámbito: dashboard.html declara CU, allGrades, allTasks y taskFilter con
 * `let` a nivel global. Un `let` global NO crea propiedad en window (a diferencia de var y
 * de function), así que window.CU o window.allGrades salen undefined. Sí se ven como
 * identificadores sueltos desde otro <script> clásico como este, porque comparten el ámbito
 * léxico global — por eso abajo se escribe `CU` y `allGrades`, nunca `window.CU`.
 * Escribir en el binding compartido además mantiene funcionando lo que ya usaba esas
 * variables en dashboard.html (openEditGrade, exportGrades, buildDashboard...).
 *
 * Dependencias globales que ya existen en dashboard.html y que esta capa reutiliza:
 *   CU (usuario logueado), taskFilter, av(), showToast(), openModal(), closeModal(),
 *   renderGrades(), buildGradesHeader(), populateSelects(), showPage(), initPortal().
 */
(function () {
  'use strict';
  var L = window.LogicaDocente;

  // ===============================================================
  // ACCESO A LA API REST  (lo que antes hacía DatosDocente.* en memoria)
  // ===============================================================

  /** Envoltorio único de fetch: centraliza el JSON y el manejo de errores del servidor. */
  async function pedir(url, opciones) {
    var respuesta = await fetch(url, opciones);
    var cuerpo = null;
    try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = null; }
    if (!respuesta.ok) {
      throw new Error((cuerpo && cuerpo.error) || ('El servidor respondió ' + respuesta.status));
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

  function parametros(objeto) {
    var qs = new URLSearchParams();
    Object.keys(objeto).forEach(function (k) {
      if (objeto[k] !== null && objeto[k] !== undefined && objeto[k] !== '') qs.append(k, objeto[k]);
    });
    var s = qs.toString();
    return s ? '?' + s : '';
  }

  var API = {
    secciones: function () {
      return pedir('/api/secciones');
    },
    calificaciones: function (filtros) {
      return pedir('/api/calificaciones' + parametros(filtros || {}));
    },
    actualizarNota: function (idCalificacion, campo, valor) {
      return enviarJson('/api/calificaciones/' + idCalificacion, 'PATCH', { campo: campo, valor: valor });
    },
    registrarAlumno: function (datos) {
      return enviarJson('/api/calificaciones', 'POST', datos);
    },
    asistencia: function (idSeccion, fecha) {
      return pedir('/api/asistencia' + parametros({ id_seccion: idSeccion, fecha: fecha }));
    },
    guardarAsistencia: function (datos) {
      return enviarJson('/api/asistencia', 'POST', datos);
    },
    tareas: function (filtros) {
      return pedir('/api/tareas' + parametros(filtros || {}));
    },
    publicarTarea: function (datos) {
      return enviarJson('/api/tareas', 'POST', datos);
    }
  };

  // ---------------------------------------------------------------
  // Utilidades comunes
  // ---------------------------------------------------------------

  function valorDe(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  /** MySQL devuelve los DECIMAL como texto ("15.00"); la interfaz necesita números. */
  function aNumero(v) {
    return (v === null || v === undefined || v === '') ? null : Number(v);
  }

  function iniciales(nombre) {
    return (nombre || '').split(' ')
      .map(function (p) { return p[0] ? p[0].toUpperCase() : ''; })
      .join('').slice(0, 2) || 'XX';
  }

  function avisarError(e) {
    showToast(e && e.message ? e.message : 'No se pudo conectar con el servidor');
    console.error(e);
  }

  function estadoVacio(colspan, titulo, texto) {
    return '<tr><td colspan="' + colspan + '"><div class="empty-state"><h3>' + titulo + '</h3>' +
      (texto ? '<p>' + texto + '</p>' : '') + '</div></td></tr>';
  }

  // ---------------------------------------------------------------
  // Secciones (tabla SECCION) — reemplazan a la lista fija CFG.groups
  // ---------------------------------------------------------------

  var SECCIONES = [];
  var ETIQUETA_SECCION = {}; // id_seccion -> '6-A'
  var promesaSecciones = null;

  /** Se pide una sola vez y se reutiliza; todas las pantallas dependen de este mapa. */
  function cargarSecciones() {
    if (!promesaSecciones) {
      promesaSecciones = API.secciones().then(function (filas) {
        SECCIONES = filas;
        ETIQUETA_SECCION = {};
        filas.forEach(function (s) { ETIQUETA_SECCION[s.id_seccion] = s.grupo; });
        return filas;
      }).catch(function (e) {
        promesaSecciones = null; // permite reintentar en la siguiente interacción
        throw e;
      });
    }
    return promesaSecciones;
  }

  function etiquetaSeccion(idSeccion) {
    return ETIQUETA_SECCION[idSeccion] || String(idSeccion);
  }

  // Los combos de grupo de las 3 HU pasan a llevar el id_seccion REAL como value
  // (es la clave foránea que esperan CALIFICACION, ASISTENCIA y TAREA) y el '6-A' como texto.
  var populateSelectsOriginal = window.populateSelects;
  window.populateSelects = function () {
    if (populateSelectsOriginal) populateSelectsOriginal(); // combos de las páginas que no son HU-005/008/010
    cargarSecciones().then(function () {
      var opciones = SECCIONES.map(function (s) {
        return '<option value="' + s.id_seccion + '">' + s.grupo + '</option>';
      }).join('');
      ['grades-group-filter', 'att-group-filter', 'task-group-sel', 'ag-group'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var base = el.options[0] && el.options[0].value === '' ? el.options[0].outerHTML : '';
        el.innerHTML = base + opciones;
      });
    }).catch(avisarError);
  };

  // ---------------------------------------------------------------
  // HU-005 — Calificaciones
  // ---------------------------------------------------------------

  // Reemplaza calcAvg: ahora usa la regla oficial (2 decimales) en vez de redondear a entero.
  window.calcAvg = function (s) {
    return L.calcularPromedio({ examen1: s.e1, examen2: s.e2, tareas: s.tarea, proyecto: s.proyecto });
  };

  // Reemplaza getStatus: CA-001 exige exactamente 2 estados posibles (>= 11.00 / < 11.00).
  window.getStatus = function (avg) {
    return L.determinarEstado(avg);
  };

  // Colores de la insignia y de la barra alineados al estado oficial (antes tenían 4 niveles
  // que ya no correspondían con "Aprobado/Desaprobado").
  window.getBadge = function (avg) {
    var estado = L.determinarEstado(avg);
    if (estado === 'Sin calificar') return 'b-gray';
    return estado === 'Aprobado' ? 'b-success' : 'b-danger';
  };
  window.getBar = function (avg) {
    var estado = L.determinarEstado(avg);
    if (estado === 'Sin calificar') return 'bf-poor';
    return estado === 'Aprobado' ? 'bf-ex' : 'bf-poor';
  };

  /** Traduce una fila de CALIFICACION (forma SQL) a la forma interna que pinta renderGrades. */
  function aFilaDeTabla(r) {
    return {
      id: r.id_calificacion,      // renderGrades lo usa para updGrade() y openEditGrade()
      id_alumno: r.id_alumno,
      id_seccion: r.id_seccion,
      name: r.nombreAlumno,
      group: etiquetaSeccion(r.id_seccion),
      initials: iniciales(r.nombreAlumno),
      e1: aNumero(r.examen1),
      e2: aNumero(r.examen2),
      tarea: aNumero(r.tareas),
      proyecto: aNumero(r.proyecto),
      periodo: r.periodo
    };
  }

  /**
   * CA-003: los 3 filtros (grupo, estado, nombre) ahora viajan a la API.
   * El grupo se resuelve en SQL (WHERE id_seccion = ?) y estado/nombre los aplica la MISMA
   * función pura filtrarCalificaciones, pero ejecutándose en el servidor.
   */
  async function cargarCalificaciones(busqueda) {
    var tb = document.getElementById('grades-tbody');
    if (!tb) return;
    try {
      await cargarSecciones();
      var texto = busqueda !== undefined && busqueda !== null && busqueda !== ''
        ? busqueda
        : valorDe('grades-search');
      var filas = await API.calificaciones({
        id_seccion: valorDe('grades-group-filter'),
        estado: valorDe('grades-status-filter'),
        busqueda: texto
      });
      // Se escribe el binding global compartido (sin window.): así exportGrades() y
      // openEditGrade() de dashboard.html siguen viendo exactamente las mismas filas.
      allGrades = filas.map(aFilaDeTabla);
      buildGradesHeader();
      renderGrades(allGrades);
    } catch (e) {
      avisarError(e);
      tb.innerHTML = estadoVacio(9, 'No se pudo cargar desde la base de datos', e.message);
    }
  }
  window.cargarCalificaciones = cargarCalificaciones;

  // El buscador dispara en cada tecla (oninput): se espera un momento para no lanzar
  // una consulta por letra tecleada.
  var temporizadorBusqueda = null;
  window.filterGrades = function (q) {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(function () { cargarCalificaciones(q); }, 180);
  };

  // CA-001: modificar una nota en la tabla ahora hace PATCH y el promedio lo recalcula
  // (y lo persiste) el servidor con la misma función calcularPromedio.
  var CAMPO_SQL = { e1: 'examen1', e2: 'examen2', tarea: 'tareas', proyecto: 'proyecto' };
  window.updGrade = async function (idCalificacion, campo, valor) {
    try {
      var nota = valor === '' ? null : parseFloat(valor);
      if (!L.validarNota(nota)) { showToast('La nota debe estar entre 0 y 20'); await cargarCalificaciones(); return; }
      var r = await API.actualizarNota(idCalificacion, CAMPO_SQL[campo] || campo, nota);
      await cargarCalificaciones();
      showToast('Nota guardada — promedio ' + (r.promedio !== null ? r.promedio : '—') + ' (' + r.estado + ')');
    } catch (e) {
      avisarError(e);
      await cargarCalificaciones(); // devuelve la celda al valor real de la BD
    }
  };

  // CA-001: el modal "Editar notas" manda las 4 notas y luego relee desde la BD.
  window.saveEditGrade = async function () {
    var fila = (allGrades || []).filter(function (g) { return g.id === editingGradeId; })[0];
    if (!fila) { closeModal('modal-edit-grade'); return; }

    var campos = [
      ['examen1', valorDe('eg-e1')],
      ['examen2', valorDe('eg-e2')],
      ['tareas', valorDe('eg-tarea')],
      ['proyecto', valorDe('eg-proyecto')]
    ];
    var invalida = campos.filter(function (c) { return !L.validarNota(c[1]); })[0];
    if (invalida) { showToast('La nota de ' + invalida[0] + ' debe estar entre 0 y 20'); return; }

    try {
      for (var i = 0; i < campos.length; i++) {
        await API.actualizarNota(fila.id, campos[i][0], campos[i][1] === '' ? null : parseFloat(campos[i][1]));
      }
      closeModal('modal-edit-grade');
      await cargarCalificaciones();
      showToast('Notas de ' + fila.name + ' actualizadas correctamente');
    } catch (e) {
      avisarError(e);
    }
  };

  // CA-002: el alta de alumno inserta de verdad en USUARIO + ALUMNO + CALIFICACION.
  window.saveGradeStudent = async function () {
    var nombre = valorDe('ag-name').trim();
    var idSeccion = valorDe('ag-group');
    if (!nombre) {
      var elN = document.getElementById('ag-name');
      elN.focus(); elN.style.borderColor = 'var(--danger)';
      return;
    }
    if (!idSeccion) {
      var elG = document.getElementById('ag-group');
      elG.focus(); elG.style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('ag-name').style.borderColor = '';
    document.getElementById('ag-group').style.borderColor = '';

    var notas = {
      examen1: valorDe('ag-e1') === '' ? null : parseFloat(valorDe('ag-e1')),
      examen2: valorDe('ag-e2') === '' ? null : parseFloat(valorDe('ag-e2')),
      tareas: valorDe('ag-tarea') === '' ? null : parseFloat(valorDe('ag-tarea')),
      proyecto: valorDe('ag-proyecto') === '' ? null : parseFloat(valorDe('ag-proyecto'))
    };
    var invalida = Object.keys(notas).filter(function (k) { return !L.validarNota(notas[k]); })[0];
    if (invalida) { showToast('La nota de ' + invalida + ' debe estar entre 0 y 20'); return; }

    try {
      var creado = await API.registrarAlumno(Object.assign({ nombreAlumno: nombre, id_seccion: idSeccion }, notas));
      ['ag-name', 'ag-e1', 'ag-e2', 'ag-tarea', 'ag-proyecto'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      document.getElementById('ag-group').value = '';
      document.getElementById('ag-preview').style.display = 'none';
      closeModal('modal-add-grade-student');
      await cargarCalificaciones();
      showToast(creado.nombreAlumno + ' registrado correctamente (' + creado.estado + ')');
    } catch (e) {
      avisarError(e);
    }
  };


  // Los dos modales pintan un promedio "en vivo" mientras se teclean las notas. El original
  // redondeaba a entero y usaba 4 niveles (Excelente/Bien/Aprobado/Desaprobado); se alinean
  // con CA-001 para que el modal no diga algo distinto a lo que después muestra la tabla.
  function pintarPreview(ids, idValor, idInsignia, idContenedor) {
    var notas = {
      examen1: valorDe(ids[0]), examen2: valorDe(ids[1]),
      tareas: valorDe(ids[2]), proyecto: valorDe(ids[3])
    };
    var promedio = L.calcularPromedio(notas);
    var elValor = document.getElementById(idValor);
    var elInsignia = document.getElementById(idInsignia);
    var contenedor = idContenedor ? document.getElementById(idContenedor) : null;
    if (promedio === null) {
      if (contenedor) contenedor.style.display = 'none';
      if (elValor) elValor.textContent = '—';
      if (elInsignia) { elInsignia.className = 'badge b-gray'; elInsignia.textContent = '—'; }
      return;
    }
    if (contenedor) contenedor.style.display = 'flex';
    if (elValor) elValor.textContent = promedio.toFixed(2);
    if (elInsignia) {
      elInsignia.className = 'badge ' + window.getBadge(promedio);
      elInsignia.textContent = L.determinarEstado(promedio);
    }
  }
  window.previewAvg = function () {
    pintarPreview(['ag-e1', 'ag-e2', 'ag-tarea', 'ag-proyecto'], 'ag-avg-val', 'ag-avg-badge', 'ag-preview');
  };
  window.previewEditAvg = function () {
    pintarPreview(['eg-e1', 'eg-e2', 'eg-tarea', 'eg-proyecto'], 'eg-avg-val', 'eg-avg-badge', null);
  };

  // ---------------------------------------------------------------
  // HU-008 — Asistencia
  // ---------------------------------------------------------------

  var ESTADO_POR_LETRA = { P: 'presente', A: 'ausente', L: 'tardanza' };
  var LETRA_POR_ESTADO = { presente: 'P', ausente: 'A', tardanza: 'L' };
  var CLASE_POR_LETRA = { P: 'sel-p', A: 'sel-a', L: 'sel-l' };

  // CA-001: carga según grupo Y fecha (el original solo miraba el grupo), leyendo de ASISTENCIA.
  window.loadAttGroup = async function () {
    var tb = document.getElementById('att-tbody');
    if (!tb) return;
    var idSeccion = valorDe('att-group-filter');
    var fecha = valorDe('att-date');

    // CA-002: sin grupo o sin fecha válida no se consulta nada (misma regla que valida el servidor)
    if (!L.validarGrupoSeleccionado(idSeccion)) {
      tb.innerHTML = estadoVacio(6, 'Selecciona un grupo', 'Elige el grupo para registrar asistencia.');
      return;
    }
    if (!L.validarFechaAsistencia(fecha)) {
      tb.innerHTML = estadoVacio(6, 'Selecciona una fecha', 'Elige la fecha del pase de lista.');
      return;
    }

    var filas;
    try {
      filas = await API.asistencia(idSeccion, fecha);
    } catch (e) {
      avisarError(e);
      tb.innerHTML = estadoVacio(6, 'No se pudo cargar la asistencia', e.message);
      return;
    }
    if (!filas.length) {
      tb.innerHTML = estadoVacio(6, 'Sin alumnos en este grupo', 'Registra alumnos en la sección para pasar lista.');
      return;
    }

    // Si ya se guardó asistencia para esta fecha, la tabla la refleja; si no, el servidor
    // devolvió "presente" por defecto para todos (calculado con marcarAsistenciaTodos).
    tb.innerHTML = filas.map(function (f, i) {
      var letraSel = LETRA_POR_ESTADO[f.estado] || 'P';
      function btn(letra, texto) {
        var sel = letra === letraSel ? ' ' + CLASE_POR_LETRA[letra] : '';
        return '<button class="att-r' + sel + '" onclick="setAtt(this,\'' + letra + '\')">' + texto + '</button>';
      }
      var pct = f.porcentajeAsistencia;
      var claseBarra = pct >= 90 ? 'bf-ex' : pct >= 75 ? 'bf-avg' : 'bf-poor';
      var insignia = pct >= 90 ? ['b-success', 'Normal'] : pct >= 75 ? ['b-warning', 'Regular'] : ['b-danger', 'Riesgo'];
      return '<tr data-id-alumno="' + f.id_alumno + '"><td>' + (i + 1) + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:8px">' + av(iniciales(f.nombreAlumno)) +
        '<span class="td-bold">' + f.nombreAlumno + '</span></div></td>' +
        '<td><div class="att-rg">' + btn('P', 'P') + btn('A', 'A') + btn('L', 'T') + '</div></td>' +
        '<td><div class="bar-wrap"><div class="bar-track"><div class="bar-fill ' + claseBarra + '" style="width:' + pct + '%"></div></div><span>' + pct + '%</span></div></td>' +
        '<td>' + f.faltas + '</td>' +
        '<td><span class="badge ' + insignia[0] + '">' + insignia[1] + '</span></td></tr>';
    }).join('');
  };

  // Mismo nombre y firma que ya usaba el botón "Todos presentes" (markAll('P')): sigue siendo
  // 100% cliente (solo pinta), y el cálculo de "a quién marcar" lo hace la capa de Lógica.
  window.markAll = function (letra) {
    var filas = document.querySelectorAll('#att-tbody tr[data-id-alumno]');
    var ids = Array.prototype.map.call(filas, function (tr) { return tr.getAttribute('data-id-alumno'); });
    var resultado = L.marcarAsistenciaTodos(ids, ESTADO_POR_LETRA[letra]); // capa de Lógica (pura)
    var resultadoPorId = {};
    resultado.forEach(function (r) { resultadoPorId[r.id_alumno] = r.estado; });

    filas.forEach(function (tr) {
      var id = tr.getAttribute('data-id-alumno');
      var letraFila = LETRA_POR_ESTADO[resultadoPorId[id]] || letra;
      tr.querySelectorAll('.att-r').forEach(function (b) { b.classList.remove('sel-p', 'sel-a', 'sel-l'); });
      var objetivo = tr.querySelector('[onclick*="\'' + letraFila + '\'"]');
      if (objetivo) objetivo.classList.add(CLASE_POR_LETRA[letraFila]);
    });
    // El profesor puede seguir cambiando filas individuales antes de guardar.
  };

  // CA-003: guarda el pase de lista completo en ASISTENCIA (INSERT ... ON DUPLICATE KEY UPDATE).
  window.guardarAsistencia = async function () {
    var idSeccion = valorDe('att-group-filter');
    var fecha = valorDe('att-date');
    if (!L.validarGrupoSeleccionado(idSeccion)) { showToast('Selecciona un grupo antes de guardar'); return; }
    if (!L.validarFechaAsistencia(fecha)) { showToast('Selecciona una fecha válida'); return; }

    var filas = document.querySelectorAll('#att-tbody tr[data-id-alumno]');
    if (!filas.length) { showToast('No hay alumnos que registrar'); return; }

    var registros = Array.prototype.map.call(filas, function (tr) {
      var seleccionado = tr.querySelector('.att-r.sel-p, .att-r.sel-a, .att-r.sel-l');
      var letra = seleccionado && seleccionado.classList.contains('sel-a') ? 'A'
        : seleccionado && seleccionado.classList.contains('sel-l') ? 'L' : 'P';
      return { id_alumno: Number(tr.getAttribute('data-id-alumno')), estado: ESTADO_POR_LETRA[letra] };
    });

    try {
      var r = await API.guardarAsistencia({
        id_seccion: idSeccion,
        fecha: fecha,
        registros: registros
      });
      await loadAttGroup(); // relee de la BD: los % y faltas se actualizan con lo recién guardado
      showToast('Asistencia guardada en la base de datos (' + r.guardados + ' alumnos)');
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // HU-010 — Tareas
  // ---------------------------------------------------------------

  // Las pestañas del prototipo usan all/pending/done/late; la capa de Lógica y la BD hablan
  // en español. Este mapa es el único punto de traducción.
  var FILTRO_A_ESTADO = { all: 'todas', pending: 'pendiente', done: 'entregada', late: 'atrasada' };
  var CLASE_POR_ESTADO = {
    pendiente: { badge: 'b-info', due: 'due-soon', texto: 'Pendiente' },
    atrasada: { badge: 'b-danger', due: 'due-late', texto: 'Atrasada' },
    entregada: { badge: 'b-success', due: 'due-ok', texto: 'Entregada' }
  };

  /** Trae las tareas de la BD; el estado (pendiente/atrasada/entregada) lo calcula el servidor
   *  con determinarEstadoEntrega, así que no queda congelado como en el prototipo. */
  async function cargarTareas() {
    var el = document.getElementById('tasks-list');
    if (!el) return;
    try {
      await cargarSecciones();
      allTasks = await API.tareas({}); // binding global compartido, igual que allGrades
      renderTasks();
    } catch (e) {
      avisarError(e);
      el.innerHTML = '<div class="empty-state"><h3>No se pudieron cargar las tareas</h3><p>' + e.message + '</p></div>';
    }
  }
  window.cargarTareas = cargarTareas;

  // Reemplaza renderTasks: pinta la caché que vino de la API (ya no arma nada en memoria).
  window.renderTasks = function () {
    var el = document.getElementById('tasks-list');
    if (!el) return;
    var estadoBuscado = FILTRO_A_ESTADO[taskFilter] || 'todas';
    // CA-002: el filtro por estado lo resuelve la capa de Lógica (la misma del servidor)
    var visibles = L.filtrarTareasPorEstado(allTasks || [], estadoBuscado);

    if (!visibles.length) {
      var msg = taskFilter === 'late' ? 'Sin tareas atrasadas!'
        : taskFilter === 'done' ? 'Sin tareas entregadas.'
        : taskFilter === 'pending' ? 'Sin tareas pendientes.'
        : 'Sin tareas registradas.';
      el.innerHTML = '<div class="empty-state"><h3>' + msg + '</h3></div>';
      return;
    }

    el.innerHTML = visibles.map(function (t) {
      var c = CLASE_POR_ESTADO[t.estado] || CLASE_POR_ESTADO.pendiente;
      var entregada = t.estado === 'entregada';
      return '<div class="task-item">' +
        '<div class="task-check ' + (entregada ? 'done ' : '') + 'readonly" title="El avance se lleva en ENTREGA_TAREA, por alumno">' +
        (entregada ? '&#10003;' : '') + '</div>' +
        '<div style="flex:1"><div class="task-title" style="' + (entregada ? 'text-decoration:line-through;opacity:.5' : '') + '">' +
        t.titulo + '</div>' +
        '<div class="task-meta">Grupo ' + t.grupo + ' — ' + t.entregas + ' de ' + t.totalAlumnos + ' entregas</div></div>' +
        '<span class="task-due ' + c.due + '">' + t.fecha_entrega + '</span>' +
        '<span class="badge ' + c.badge + '" style="margin-left:8px">' + c.texto + '</span></div>';
    }).join('');
  };

  // CA-001: el botón "Publicar" inserta la tarea en la tabla TAREA.
  window.guardarTarea = async function () {
    var datos = {
      titulo: valorDe('tn-titulo').trim(),
      descripcion: valorDe('tn-desc').trim(),
      id_seccion: valorDe('task-group-sel'),
      fecha_entrega: valorDe('tn-fecha')
    };
    if (!L.validarTarea(datos)) { showToast('Completa título, grupo y fecha límite'); return; }

    try {
      await API.publicarTarea(datos);
      ['tn-titulo', 'tn-fecha', 'tn-desc'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('task-group-sel').value = '';
      closeModal('modal-new-task');
      await cargarTareas();
      showToast('Tarea publicada correctamente');
    } catch (e) {
      avisarError(e);
    }
  };

  // ---------------------------------------------------------------
  // Enganche con la navegación del dashboard
  // ---------------------------------------------------------------

  // showPage original pinta la página con la caché en memoria; aquí se le encadena la
  // recarga real desde la API, para que entrar a una pestaña siempre traiga datos frescos.
  var showPageOriginal = window.showPage;
  window.showPage = function (id) {
    showPageOriginal(id);
    if (!CU || CU.role !== 'teacher') return;
    if (id === 'calificaciones') cargarCalificaciones();
    if (id === 'asistencia') loadAttGroup();
    if (id === 'tareas') cargarTareas();
  };

  // Reemplaza a la siembra de datos de demo del prototipo: los datos ya no viven en memoria.
  window.sembrarDatosDemo = function () {
    showToast('Ya no hace falta: los datos salen de MySQL. Usa "mysql -u root < seed.sql".');
  };
})();
