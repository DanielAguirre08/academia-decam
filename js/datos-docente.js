/**
 * ACADEMIA DECAM — CAPA DE DATOS (rol Docente)
 * ---------------------------------------------------------
 * Estructuras equivalentes a las tablas CALIFICACION, ASISTENCIA, TAREA y ENTREGA_TAREA
 * (MySQL 8.0, ver esquema del curso). Mientras no exista el backend real, esta capa
 * persiste en memoria del navegador, pero con la MISMA forma que tendrían las filas de
 * MySQL — así, el día que se conecte la API REST, solo se reemplaza el contenido de estas
 * funciones (la firma no cambia) y el resto de la app sigue funcionando igual.
 *
 * OJO: `allGrades` y `allStudents` YA existen como variables globales `let` declaradas en el
 * script original de dashboard.html. No las volvemos a declarar aquí (rompería con
 * "Identifier ya declarado") — simplemente las reutilizamos, que es justamente el rol de
 * esta capa: ser la única que las toca directamente.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.DatosDocente = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  // Tablas nuevas que el prototipo original NO tenía todavía (no hay conflicto de nombres).
  if (!root.allAsistencias) root.allAsistencias = []; // equivalente a ASISTENCIA
  if (!root.allEntregas) root.allEntregas = [];       // equivalente a ENTREGA_TAREA
  var idAsistenciaSeq = 1;
  var idEntregaSeq = 1;

  function _grades() { return root.allGrades || []; }   // equivalente a CALIFICACION (+ datos del alumno)
  function _students() { return root.allStudents || []; } // equivalente a ALUMNO
  function _tasks() { return root.allTasks || []; }       // equivalente a TAREA

  // ---------------------------------------------------------------
  // HU-005 — Calificaciones  (tabla CALIFICACION)
  // ---------------------------------------------------------------

  /** Equivalente SQL: SELECT * FROM CALIFICACION WHERE id_seccion = ?  (o todas si no hay filtro) */
  function obtenerCalificaciones(idSeccion) {
    var lista = _grades();
    return idSeccion ? lista.filter(function (g) { return g.group === idSeccion; }) : lista;
  }

  /**
   * Actualiza una nota puntual de un alumno (equivalente a lo que hacía updGrade() original).
   * Equivalente SQL: UPDATE CALIFICACION SET examen1=? WHERE id_calificacion = ?
   */
  function actualizarNota(idCalificacion, campo, valor) {
    var mapaCampos = { examen1: 'e1', examen2: 'e2', tareas: 'tarea', proyecto: 'proyecto' };
    var campoInterno = mapaCampos[campo] || campo;
    var registro = _grades().filter(function (g) { return g.id === idCalificacion; })[0];
    if (!registro) return null;
    registro[campoInterno] = valor === '' || valor === null ? null : parseFloat(valor);
    return registro;
  }

  /**
   * Registra un alumno nuevo en el cuadro de calificaciones.
   * Equivalente SQL: INSERT INTO CALIFICACION (id_alumno, id_seccion, examen1, examen2, tareas, proyecto)
   *                  VALUES (?, ?, ?, ?, ?, ?)
   */
  function registrarCalificacionInicial(datos) {
    var registro = {
      id: (root.gradeStudentId || 1),
      name: datos.nombreAlumno,
      group: datos.idSeccion,
      initials: (datos.nombreAlumno || '').split(' ').map(function (w) { return w[0] ? w[0].toUpperCase() : ''; }).join('').slice(0, 2) || 'XX',
      e1: datos.examen1, e2: datos.examen2, tarea: datos.tareas, proyecto: datos.proyecto
    };
    root.gradeStudentId = (root.gradeStudentId || 1) + 1;
    _grades().push(registro);
    return registro;
  }

  // ---------------------------------------------------------------
  // HU-008 — Asistencia  (tabla ASISTENCIA)
  // ---------------------------------------------------------------

  /** Equivalente SQL: SELECT * FROM ASISTENCIA WHERE id_seccion=? AND fecha=? */
  function obtenerAsistenciaPorGrupoYFecha(idSeccion, fecha) {
    return root.allAsistencias.filter(function (a) {
      return a.id_seccion === idSeccion && a.fecha === fecha;
    });
  }

  /**
   * Guarda (o actualiza si ya existía) la asistencia de un alumno para una sección y fecha.
   * Equivalente SQL:
   *   INSERT INTO ASISTENCIA (id_alumno, id_seccion, fecha, estado, id_docente_registra)
   *   VALUES (?, ?, ?, ?, ?)
   *   ON DUPLICATE KEY UPDATE estado = VALUES(estado)
   */
  function guardarAsistenciaAlumno(registro) {
    var existente = root.allAsistencias.filter(function (a) {
      return a.id_alumno === registro.id_alumno && a.id_seccion === registro.id_seccion && a.fecha === registro.fecha;
    })[0];
    if (existente) {
      existente.estado = registro.estado;
      return existente;
    }
    var nuevo = {
      id_asistencia: idAsistenciaSeq++,
      id_alumno: registro.id_alumno,
      id_seccion: registro.id_seccion,
      fecha: registro.fecha,
      estado: registro.estado,
      id_docente_registra: registro.id_docente_registra || null
    };
    root.allAsistencias.push(nuevo);
    return nuevo;
  }

  /** Guarda la asistencia de todo un grupo en una sola operación (batch). */
  function guardarAsistenciaGrupo(idSeccion, fecha, idDocente, filas) {
    return filas.map(function (f) {
      return guardarAsistenciaAlumno({
        id_alumno: f.id_alumno, id_seccion: idSeccion, fecha: fecha,
        estado: f.estado, id_docente_registra: idDocente
      });
    });
  }

  // ---------------------------------------------------------------
  // HU-010 — Tareas  (tablas TAREA y ENTREGA_TAREA)
  // ---------------------------------------------------------------

  /** Equivalente SQL: SELECT * FROM TAREA WHERE id_seccion = ? */
  function obtenerTareas(idSeccion) {
    var lista = _tasks();
    return idSeccion ? lista.filter(function (t) { return t.group === idSeccion; }) : lista;
  }

  /**
   * Equivalente SQL:
   *   INSERT INTO TAREA (titulo, descripcion, id_seccion, id_docente, fecha_asignacion, fecha_entrega)
   *   VALUES (?, ?, ?, ?, CURDATE(), ?)
   */
  function guardarTareaNueva(datos) {
    var nueva = {
      id: Date.now(),
      title: datos.titulo,
      subject: datos.tipo,
      type: datos.tipo,
      group: datos.idSeccion,
      teacherId: datos.idDocente,
      dueDate: datos.fechaEntrega,
      description: datos.descripcion,
      status: 'pending' // se recalcula con determinarEstadoEntrega en cada render
    };
    _tasks().push(nueva);
    return nueva;
  }

  /** Equivalente SQL: SELECT * FROM ENTREGA_TAREA WHERE id_tarea = ? */
  function obtenerEntregasPorTarea(idTarea) {
    return root.allEntregas.filter(function (e) { return e.id_tarea === idTarea; });
  }

  /**
   * Equivalente SQL:
   *   INSERT INTO ENTREGA_TAREA (id_tarea, id_alumno, estado, fecha_entrega_real)
   *   VALUES (?, ?, 'entregada', NOW())
   */
  function registrarEntrega(idTarea, idAlumno) {
    var entrega = {
      id_entrega: idEntregaSeq++,
      id_tarea: idTarea,
      id_alumno: idAlumno,
      estado: 'entregada',
      fecha_entrega_real: new Date().toISOString()
    };
    root.allEntregas.push(entrega);
    return entrega;
  }

  return {
    obtenerCalificaciones: obtenerCalificaciones,
    actualizarNota: actualizarNota,
    registrarCalificacionInicial: registrarCalificacionInicial,
    obtenerAsistenciaPorGrupoYFecha: obtenerAsistenciaPorGrupoYFecha,
    guardarAsistenciaAlumno: guardarAsistenciaAlumno,
    guardarAsistenciaGrupo: guardarAsistenciaGrupo,
    obtenerTareas: obtenerTareas,
    guardarTareaNueva: guardarTareaNueva,
    obtenerEntregasPorTarea: obtenerEntregasPorTarea,
    registrarEntrega: registrarEntrega
  };
});
