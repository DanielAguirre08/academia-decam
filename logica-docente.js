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

  /** Valida que una nota esté en el rango permitido por CALIFICACION (0 a 20). */
  function validarNota(valor) {
    if (valor === null || valor === undefined || valor === '') return true; // nota aún no registrada
    var n = Number(valor);
    return !isNaN(n) && n >= NOTA_MINIMA && n <= NOTA_MAXIMA;
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
  // HU-008 — Asistencia
  // ---------------------------------------------------------------

  /** CA-002 (HU-008): no se puede cargar/editar la tabla sin un grupo (sección) seleccionado. */
  function validarGrupoSeleccionado(idSeccion) {
    return !!idSeccion;
  }

  /** CA-002 (HU-008): tampoco tiene sentido registrar asistencia sin una fecha válida. */
  function validarFechaAsistencia(fecha) {
    return !!fecha && !isNaN(new Date(fecha + 'T00:00:00').getTime());
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

  // ---------------------------------------------------------------
  // HU-010 — Tareas
  // ---------------------------------------------------------------

  /** CA-001 (HU-010): una tarea nueva necesita al menos título, sección y fecha de entrega. */
  function validarTarea(tarea) {
    tarea = tarea || {};
    return !!(tarea.titulo && tarea.titulo.trim() && tarea.id_seccion && tarea.fecha_entrega);
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
    validarGrupoSeleccionado: validarGrupoSeleccionado,
    validarFechaAsistencia: validarFechaAsistencia,
    marcarAsistenciaTodos: marcarAsistenciaTodos,
    validarEstadoAsistencia: validarEstadoAsistencia,
    validarTarea: validarTarea,
    determinarEstadoEntrega: determinarEstadoEntrega,
    filtrarTareasPorEstado: filtrarTareasPorEstado
  };
});
