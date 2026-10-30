/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (rol Alumno)
 * --------------------------------------------------------
 * HU-007 Consulta de calificaciones · HU-009 Historial de asistencia · HU-010 CA-003 (sus entregas)
 *
 * Funciones puras, sin DOM ni SQL; "hoy" llega por parámetro. Reutiliza las reglas oficiales de
 * la capa del Docente (promedio, estado, % de asistencia) para que el alumno vea exactamente lo
 * mismo que su docente. Se ejecuta en el navegador (js/logica-alumno.js) y en el servidor.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logica-docente'));
  } else {
    root.LogicaAlumno = factory(root.LogicaDocente);
  }
})(typeof self !== 'undefined' ? self : this, function (LD) {
  'use strict';

  var NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
    'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function dos(n) { return (n < 10 ? '0' : '') + n; }

  /** HU-009 CA-001: "Octubre 2026" (mes en curso con su año). */
  function tituloMes(anio, mes) {
    return NOMBRES_MES[mes] + ' ' + anio;
  }

  /**
   * HU-009 CA-001 / CA-002: arma el calendario de un mes.
   * - Sábados y domingos: 'no-lectivo' (sin estado, atenuado).
   * - Días posteriores a hoy: 'futuro' (sin estado, atenuado).
   * - Días hábiles transcurridos: el estado registrado ('presente' | 'ausente' | 'tardanza') o
   *   'sin-registro' si el docente aún no pasó lista ese día (no se inventa un "presente").
   * `mes` va de 0 (enero) a 11. Devuelve { titulo, desfase, dias[] }; `desfase` = cuántas celdas
   * vacías van antes del día 1 (la semana empieza en domingo, como el encabezado del calendario).
   */
  function construirCalendarioAsistencia(anio, mes, registros, hoy) {
    var porFecha = {};
    (registros || []).forEach(function (r) { porFecha[r.fecha] = r.estado; });
    var hoyISO = LD.fechaLocalISO(hoy || new Date());
    var diasDelMes = new Date(anio, mes + 1, 0).getDate();
    var dias = [];
    for (var d = 1; d <= diasDelMes; d++) {
      var fecha = anio + '-' + dos(mes + 1) + '-' + dos(d);
      var diaSemana = new Date(anio, mes, d).getDay();
      var tipo;
      if (diaSemana === 0 || diaSemana === 6) tipo = 'no-lectivo';
      else if (fecha > hoyISO) tipo = 'futuro';
      else tipo = porFecha[fecha] || 'sin-registro';
      dias.push({ dia: d, fecha: fecha, tipo: tipo });
    }
    return { titulo: tituloMes(anio, mes), desfase: new Date(anio, mes, 1).getDay(), dias: dias };
  }

  /**
   * HU-009 CA-003: indicadores acumulados del periodo: días registrados, faltas, tardanzas y
   * % de asistencia (la tardanza cuenta como asistencia; sin días, el % es null = "sin datos").
   */
  function resumirAsistencia(registros) {
    var resumen = { diasRegistrados: 0, presentes: 0, faltas: 0, tardanzas: 0 };
    (registros || []).forEach(function (r) {
      if (!LD.validarEstadoAsistencia(r.estado)) return;
      resumen.diasRegistrados++;
      if (r.estado === 'presente') resumen.presentes++;
      if (r.estado === 'ausente') resumen.faltas++;
      if (r.estado === 'tardanza') resumen.tardanzas++;
    });
    resumen.porcentaje = LD.calcularPorcentajeAsistencia(resumen.presentes, resumen.tardanzas, resumen.diasRegistrados);
    return resumen;
  }

  /**
   * HU-007 CA-001: cada fila de calificación con su promedio y estado oficiales (los mismos que
   * calcula el servidor para el docente). Se recalcula aquí para no confiar en un dato guardado.
   */
  function prepararMisCalificaciones(filas) {
    return (filas || []).map(function (c) {
      var promedio = LD.calcularPromedio(c);
      return Object.assign({}, c, { promedio: promedio, estado: LD.determinarEstado(promedio) });
    });
  }

  /** HU-010 CA-003: estado de una tarea para el alumno según SU entrega y la fecha límite. */
  function estadoDeMiTarea(fechaEntrega, entregue, hoy) {
    return LD.determinarEstadoEntrega(fechaEntrega, !!entregue, hoy || new Date());
  }

  /**
   * Inicio del alumno: promedio general = media de los promedios de sus periodos ya calificados
   * (2 decimales). Sin ningún periodo calificado, null ("sin datos").
   */
  function promedioGeneral(promedios) {
    var validos = (promedios || []).filter(function (p) { return p !== null && p !== undefined && p !== ''; }).map(Number);
    if (!validos.length) return null;
    var suma = validos.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((suma / validos.length) * 100) / 100;
  }

  /**
   * Inicio del alumno: puesto en su grupo por promedio general (1 = el mejor). Los empates
   * comparten puesto ("ranking de competición": 18, 15, 15, 12 -> 1, 2, 2, 4). Solo cuentan los
   * compañeros con promedio. Devuelve { puesto, total } o null si el alumno aún no tiene promedio.
   */
  function lugarEnGrupo(promediosDelGrupo, miPromedio) {
    if (miPromedio === null || miPromedio === undefined) return null;
    var conNota = (promediosDelGrupo || []).filter(function (p) { return p !== null && p !== undefined; }).map(Number);
    var mejores = conNota.filter(function (p) { return p > Number(miPromedio); }).length;
    return { puesto: mejores + 1, total: conNota.length };
  }

  return {
    tituloMes: tituloMes,
    construirCalendarioAsistencia: construirCalendarioAsistencia,
    resumirAsistencia: resumirAsistencia,
    prepararMisCalificaciones: prepararMisCalificaciones,
    estadoDeMiTarea: estadoDeMiTarea,
    promedioGeneral: promedioGeneral,
    lugarEnGrupo: lugarEnGrupo
  };
});
