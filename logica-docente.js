/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (rol Docente)
 * ---------------------------------------------------------
 * HU-005 Registro de calificaciones · HU-008 Control de asistencia · HU-010 Gestión de tareas
 *
 * Reglas de esta capa (obligatorias para la nota del curso):
 *   - Ninguna función de este archivo toca el DOM (no usa document.*, alert, etc.).
 *   - Todas son funciones puras: mismos argumentos -> mismo resultado, sin efectos secundarios.
 *   - Por eso son las más fáciles de cubrir con pruebas unitarias (ver tests/logica-docente.test.js).
 *
 * Convención de nombres: camelCase, igual que el resto del proyecto (calcularPromedio, etc.).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LogicaDocente = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NOTA_MINIMA = 0;
  var NOTA_MAXIMA = 20;
  var NOTA_APROBATORIA = 11.00; // Regla oficial de negocio (CA-001 de HU-005)

  // ---------------------------------------------------------------
  // HU-005 — Calificaciones
  // ---------------------------------------------------------------

  /**
   * Valida una nota contra CALIFICACION: DECIMAL(4,2) entre 0 y 20.
   * Vacío/null = nota aún no registrada (válido). Se rechazan booleanos (Number(true) es 1),
   * textos con espacios o letras, y más de 2 decimales (MySQL los redondearía en silencio).
   */
  function validarNota(valor) {
    if (valor === null || valor === undefined || valor === '') return true; // nota aún no registrada
    var n;
    if (typeof valor === 'number') n = valor;
    else if (typeof valor === 'string' && /^\d+(\.\d+)?$/.test(valor)) n = Number(valor);
    else return false;
    if (!isFinite(n) || n < NOTA_MINIMA || n > NOTA_MAXIMA) return false;
    return Math.abs(Math.round(n * 100) - n * 100) < 1e-9; // máximo 2 decimales
  }

  /**
   * CA-001 (HU-005): recalcula el promedio a partir de examen1, examen2, tareas y proyecto.
   * Ignora las notas aún no registradas (null/''/undefined) en vez de tratarlas como 0,
   * y redondea a 2 decimales para calzar con la columna DECIMAL(4,2) de CALIFICACION.
   */
  function calcularPromedio(notas) {
    notas = notas || {};
    var valores = [notas.examen1, notas.examen2, notas.tareas, notas.proyecto]
      .filter(function (v) { return v !== null && v !== undefined && v !== ''; })
      .map(Number);

    if (!valores.length) return null;

    var suma = valores.reduce(function (acc, v) { return acc + v; }, 0);
    return Math.round((suma / valores.length) * 100) / 100;
  }

  /**
   * CA-001 (HU-005): determina el estado oficial del alumno según el promedio.
   * Regla de negocio explícita: Aprobado >= 11.00 / Desaprobado < 11.00.
   */
  function determinarEstado(promedio) {
    if (promedio === null || promedio === undefined) return 'Sin calificar';
    return promedio >= NOTA_APROBATORIA ? 'Aprobado' : 'Desaprobado';
  }

  /**
   * Nivel de desempeño visual (no reemplaza a determinarEstado; es solo para el color/barra
   * de la interfaz, igual que ya lo hacía el prototipo con getBadge/getBar/getStatus).
   */
  function obtenerNivelDesempeno(promedio) {
    if (promedio === null || promedio === undefined) return 'sin-datos';
    if (promedio >= 18) return 'excelente';
    if (promedio >= 16) return 'bien';
    if (promedio >= NOTA_APROBATORIA) return 'aprobado';
    return 'desaprobado';
  }

  /**
   * CA-003 (HU-005): aplica los 3 filtros combinados (grupo, estado, nombre) sobre una lista
   * de calificaciones. `estado` se compara contra el resultado de determinarEstado.
   */
  function filtrarCalificaciones(lista, filtros) {
    filtros = filtros || {};
    var grupo = filtros.grupo || '';
    var estado = filtros.estado || '';
    var busqueda = (filtros.busqueda || '').toLowerCase();

    return (lista || []).filter(function (item) {
      var coincideGrupo = !grupo || item.id_seccion === grupo;
      var coincideEstado = !estado || determinarEstado(item.promedio).toLowerCase() === estado.toLowerCase();
      var coincideBusqueda = !busqueda || (item.nombreAlumno || '').toLowerCase().indexOf(busqueda) !== -1;
      return coincideGrupo && coincideEstado && coincideBusqueda;
    });
  }

  // ---------------------------------------------------------------
  // HU-006 — Exportar calificaciones a CSV
  // ---------------------------------------------------------------

  /** Encabezados exactos del CSV (HU-006 CA-001). */
  var ENCABEZADOS_CSV_CALIFICACIONES = ['Nombre', 'Grupo', 'Examen 1', 'Examen 2', 'Tareas', 'Proyecto', 'Promedio', 'Estado'];

  /**
   * Escapa un campo según RFC 4180: si tiene coma, comillas o salto de línea va entre comillas
   * y las comillas internas se duplican. Además, un texto que empieza con = + - @ se antepone
   * con ' para que Excel no lo ejecute como fórmula (inyección de fórmulas en CSV).
   */
  function escaparCampoCSV(valor) {
    if (valor === null || valor === undefined) return '';
    var texto = String(valor);
    if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
    if (/[",\r\n]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
    return texto;
  }

  /**
   * Arma el CSV completo: BOM UTF-8 (para que Excel muestre bien tildes y ñ), una fila de
   * encabezados y filas separadas por CRLF (RFC 4180).
   */
  function generarCSV(encabezados, filas) {
    var lineas = [encabezados].concat(filas || []).map(function (fila) {
      return fila.map(escaparCampoCSV).join(',');
    });
    return '\uFEFF' + lineas.join('\r\n') + '\r\n';
  }

  /** Nota con 2 decimales (como DECIMAL(4,2)) o vacío si aún no está registrada. */
  function notaCSV(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    return Number(valor).toFixed(2);
  }

  /**
   * HU-006: CSV del cuadro de notas. Cada fila: { nombreAlumno, grupo, examen1, examen2,
   * tareas, proyecto }. Promedio y estado se recalculan con las reglas oficiales (CA-001 HU-005).
   */
  function exportarCalificacionesCSV(calificaciones) {
    var filas = (calificaciones || []).map(function (c) {
      var promedio = calcularPromedio(c);
      return [c.nombreAlumno, c.grupo, notaCSV(c.examen1), notaCSV(c.examen2), notaCSV(c.tareas),
        notaCSV(c.proyecto), notaCSV(promedio), determinarEstado(promedio)];
    });
    return generarCSV(ENCABEZADOS_CSV_CALIFICACIONES, filas);
  }

  // ---------------------------------------------------------------
  // HU-008 — Asistencia
  // ---------------------------------------------------------------

  /** Entero positivo, venga como número (JSON) o como texto (query string / <select>). */
  function esIdValido(valor) {
    if (typeof valor === 'number') return Number.isInteger(valor) && valor > 0;
    return typeof valor === 'string' && /^[1-9]\d*$/.test(valor);
  }

  /**
   * CA-002 (HU-008): no se puede cargar/editar la tabla sin un grupo (sección) seleccionado.
   * El value del combo es el id_seccion real, así que "seleccionado" = id entero positivo.
   */
  function validarGrupoSeleccionado(idSeccion) {
    return esIdValido(idSeccion);
  }

  /** Fecha local de `fecha` (Date) en formato YYYY-MM-DD, sin pasar por UTC. */
  function fechaLocalISO(fecha) {
    function dos(n) { return (n < 10 ? '0' : '') + n; }
    return fecha.getFullYear() + '-' + dos(fecha.getMonth() + 1) + '-' + dos(fecha.getDate());
  }

  /**
   * CA-002 (HU-008): tampoco tiene sentido registrar asistencia sin una fecha válida.
   * Exige el formato exacto YYYY-MM-DD de <input type="date"> y una fecha que exista en el
   * calendario: new Date('2026-02-31') "corrige" a 3 de marzo, por eso se compara ida y vuelta.
   */
  function validarFechaAsistencia(fecha) {
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    var d = new Date(fecha + 'T00:00:00');
    return !isNaN(d.getTime()) && fechaLocalISO(d) === fecha;
  }

  /**
   * HU-008: no se pasa lista de un día que todavía no ocurre. `hoy` llega por parámetro para
   * que la función siga siendo pura. Las fechas YYYY-MM-DD se comparan bien como texto.
   */
  function esFechaFutura(fecha, hoy) {
    return fecha > fechaLocalISO(hoy || new Date());
  }

  /**
   * CA-003 (HU-008): produce el estado "presente" para cada alumno del grupo, de una sola vez.
   * Es pura a propósito: solo calcula el resultado; la Presentación decide cómo pintarlo,
   * y el alumno puede seguir cambiando filas individuales después (eso lo permite el DOM,
   * no esta función).
   */
  function marcarAsistenciaTodos(idsAlumnos, estado) {
    estado = estado || 'presente';
    return (idsAlumnos || []).map(function (idAlumno) {
      return { id_alumno: idAlumno, estado: estado };
    });
  }

  var ESTADOS_ASISTENCIA_VALIDOS = ['presente', 'ausente', 'tardanza'];
  function validarEstadoAsistencia(estado) {
    return ESTADOS_ASISTENCIA_VALIDOS.indexOf(estado) !== -1;
  }

  /**
   * CA-003 (HU-008): valida el pase de lista completo antes de guardarlo.
   * `idsDelGrupo` son los alumnos ACTIVOS de la sección (los trae el servidor de la BD).
   * Devuelve { valido, errores[] } para poder decirle al docente exactamente qué está mal.
   */
  function validarRegistrosAsistencia(registros, idsDelGrupo) {
    if (!Array.isArray(registros) || !registros.length) {
      return { valido: false, errores: ['No hay alumnos que registrar'] };
    }
    var permitidos = {};
    (idsDelGrupo || []).forEach(function (id) { permitidos[Number(id)] = true; });

    var errores = [];
    var vistos = {};
    registros.forEach(function (r, i) {
      var fila = 'Fila ' + (i + 1) + ': ';
      if (!r || typeof r !== 'object') { errores.push(fila + 'registro inválido'); return; }
      if (!esIdValido(r.id_alumno)) { errores.push(fila + 'id de alumno inválido'); return; }
      var id = Number(r.id_alumno);
      if (vistos[id]) errores.push(fila + 'el alumno ' + id + ' está repetido');
      vistos[id] = true;
      if (!permitidos[id]) errores.push(fila + 'el alumno ' + id + ' no pertenece a este grupo');
      if (!validarEstadoAsistencia(r.estado)) errores.push(fila + 'estado de asistencia inválido (' + r.estado + ')');
    });
    return { valido: errores.length === 0, errores: errores };
  }

  /**
   * % histórico de asistencia de un alumno en la sección: la tardanza cuenta como asistencia.
   * Sin días registrados devuelve null ("sin datos"), no un 100% inventado.
   */
  function calcularPorcentajeAsistencia(diasPresente, tardanzas, diasRegistrados) {
    var dias = Number(diasRegistrados) || 0;
    if (!dias) return null;
    var asistio = (Number(diasPresente) || 0) + (Number(tardanzas) || 0);
    return Math.round((asistio / dias) * 100);
  }

  // ---------------------------------------------------------------
  // HU-010 — Tareas
  // ---------------------------------------------------------------

  /** HU-010: los 4 valores del selector "Tipo" (columna TAREA.tipo). */
  var TIPOS_TAREA = ['Tarea', 'Examen', 'Proyecto', 'Exposición'];
  function validarTipoTarea(tipo) {
    return TIPOS_TAREA.indexOf(tipo) !== -1;
  }

  // Longitudes de las columnas TAREA.titulo VARCHAR(100) y TAREA.descripcion VARCHAR(300).
  var LARGO_TITULO = 100;
  var LARGO_DESCRIPCION = 300;

  /**
   * Largo en CARACTERES, como cuenta MySQL un VARCHAR(n) en utf8mb4. String.length cuenta unidades
   * UTF-16 y un emoji vale 2: un texto válido para la base se rechazaría.
   */
  function largo(t) {
    return Array.from(t).length;
  }

  /**
   * CA-001 (HU-010): una tarea nueva necesita título, grupo y fecha límite válidos.
   * Devuelve { valido, errores[] } con un mensaje por problema.
   * La fecha límite no puede ser anterior a hoy (la tarea se publica hoy: control 14 de
   * verificar-integridad.sql). `hoy` llega por parámetro para que la función siga siendo pura.
   */
  function revisarTarea(tarea, hoy) {
    tarea = tarea || {};
    var errores = [];
    var titulo = typeof tarea.titulo === 'string' ? tarea.titulo.trim() : '';
    var descripcion = typeof tarea.descripcion === 'string' ? tarea.descripcion.trim() : '';

    if (!titulo) errores.push('El título es obligatorio');
    else if (largo(titulo) > LARGO_TITULO) errores.push('El título admite como máximo ' + LARGO_TITULO + ' caracteres');
    if (tarea.descripcion !== undefined && tarea.descripcion !== null && typeof tarea.descripcion !== 'string') {
      errores.push('La descripción debe ser texto');
    } else if (largo(descripcion) > LARGO_DESCRIPCION) {
      errores.push('La descripción admite como máximo ' + LARGO_DESCRIPCION + ' caracteres');
    }
    if (!esIdValido(tarea.id_seccion)) errores.push('Debes seleccionar un grupo');
    if (!validarFechaAsistencia(tarea.fecha_entrega)) errores.push('Debes indicar una fecha límite válida (AAAA-MM-DD)');
    else if (tarea.fecha_entrega < fechaLocalISO(hoy || new Date())) errores.push('La fecha límite no puede ser anterior a hoy');
    if (tarea.tipo !== undefined && !validarTipoTarea(tarea.tipo)) errores.push('Tipo de tarea inválido');

    return { valido: errores.length === 0, errores: errores };
  }

  /**
   * Determina el estado de cumplimiento de una tarea para un alumno (pendiente/entregada/atrasada),
   * comparando la fecha de entrega límite contra la fecha actual y si ya existe un registro
   * en ENTREGA_TAREA. `hoy` se recibe como parámetro (en vez de usar `new Date()` adentro)
   * precisamente para que la función siga siendo pura y 100% testeable.
   */
  function determinarEstadoEntrega(fechaEntregaLimite, fueEntregada, hoy) {
    if (fueEntregada) return 'entregada';
    hoy = hoy || new Date();
    var limite = new Date(fechaEntregaLimite + 'T23:59:59');
    return limite.getTime() < hoy.getTime() ? 'atrasada' : 'pendiente';
  }

  /**
   * Inicio del docente: nombre del día tal como lo guarda HORARIO.dia_semana
   * ('Lunes'..'Viernes'; 'Miercoles' sin tilde). Sábado y domingo -> null (no hay clases).
   */
  var DIAS_HORARIO = [null, 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', null];
  function diaDeHorario(fecha) {
    return DIAS_HORARIO[(fecha || new Date()).getDay()];
  }

  var DIAS_LECTIVOS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];

  /**
   * Horario (consulta): ordena los bloques de HORARIO en una grilla día x hora de inicio.
   * Devuelve { dias, horas, celdas } donde celdas['Lunes|07:00'] es el bloque de esa celda.
   */
  function organizarHorario(bloques) {
    var horas = [];
    var celdas = {};
    (bloques || []).forEach(function (b) {
      if (horas.indexOf(b.hora_inicio) === -1) horas.push(b.hora_inicio);
      celdas[b.dia_semana + '|' + b.hora_inicio] = b;
    });
    horas.sort();
    return { dias: DIAS_LECTIVOS.slice(), horas: horas, celdas: celdas };
  }

  /**
   * Mis Alumnos: etiqueta de desempeño del filtro del directorio, a partir del nivel visual
   * (excelente >= 18, bien >= 16, aprobado >= 11, desaprobado < 11). "En riesgo" = Desaprobado.
   */
  var ETIQUETA_DESEMPENO = { excelente: 'Excelente', bien: 'Bien', aprobado: 'Regular', desaprobado: 'En riesgo', 'sin-datos': 'Sin datos' };
  function etiquetaDesempeno(promedio) {
    return ETIQUETA_DESEMPENO[obtenerNivelDesempeno(promedio)];
  }

  /** CA-002 (HU-010): filtra tareas por su estado ('todas' no filtra). */
  function filtrarTareasPorEstado(tareas, estado) {
    if (!estado || estado === 'all' || estado === 'todas') return tareas || [];
    return (tareas || []).filter(function (t) { return t.status === estado; });
  }

  return {
    NOTA_APROBATORIA: NOTA_APROBATORIA,
    validarNota: validarNota,
    calcularPromedio: calcularPromedio,
    determinarEstado: determinarEstado,
    obtenerNivelDesempeno: obtenerNivelDesempeno,
    filtrarCalificaciones: filtrarCalificaciones,
    ENCABEZADOS_CSV_CALIFICACIONES: ENCABEZADOS_CSV_CALIFICACIONES,
    escaparCampoCSV: escaparCampoCSV,
    generarCSV: generarCSV,
    exportarCalificacionesCSV: exportarCalificacionesCSV,
    esIdValido: esIdValido,
    validarGrupoSeleccionado: validarGrupoSeleccionado,
    fechaLocalISO: fechaLocalISO,
    validarFechaAsistencia: validarFechaAsistencia,
    validarFechaISO: validarFechaAsistencia, // mismo formato estricto, para otros módulos (p. ej. Registro)
    esFechaFutura: esFechaFutura,
    marcarAsistenciaTodos: marcarAsistenciaTodos,
    validarEstadoAsistencia: validarEstadoAsistencia,
    validarRegistrosAsistencia: validarRegistrosAsistencia,
    calcularPorcentajeAsistencia: calcularPorcentajeAsistencia,
    validarTipoTarea: validarTipoTarea,
    revisarTarea: revisarTarea,
    determinarEstadoEntrega: determinarEstadoEntrega,
    filtrarTareasPorEstado: filtrarTareasPorEstado,
    diaDeHorario: diaDeHorario,
    organizarHorario: organizarHorario,
    etiquetaDesempeno: etiquetaDesempeno
  };
});
