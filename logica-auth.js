/**
 * ACADEMIA DECAM — CAPA DE LÓGICA DE NEGOCIO (autenticación)
 * -----------------------------------------------------------
 * HU-001 Inicio de sesión con acceso diferenciado por rol · RNF-02 Bloqueo por intentos fallidos
 *
 * Mismas reglas que logica-docente.js: ninguna función toca el DOM ni SQL, y son puras.
 * La fecha actual NO se lee aquí adentro (nada de `new Date()` sin argumento): llega por
 * parámetro, para que las pruebas puedan fijar "ahora" y el resultado sea siempre el mismo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LogicaAuth = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_INTENTOS_FALLIDOS = 5;   // RNF-02: la cuenta se bloquea al 5.º intento fallido...
  var MINUTOS_BLOQUEO = 10;        // ...y queda bloqueada durante 10 minutos.
  var ROLES_VALIDOS = ['docente', 'alumno', 'jefe_academico', 'registrador'];

  /** CA-001 (HU-001): hacen falta correo y contraseña antes de consultar nada. */
  function validarCredenciales(correo, contrasena) {
    return !!(correo && String(correo).trim() && contrasena && String(contrasena).trim());
  }

  /** Los 4 valores del ENUM USUARIO.rol; cualquier otro (incluido undefined) se rechaza. */
  function validarRol(rol) {
    return ROLES_VALIDOS.indexOf(rol) !== -1;
  }

  /**
   * CA-002 (HU-001): el rol elegido en la pantalla de login debe ser el rol real del usuario.
   * Si no coincide se trata igual que una contraseña mala (mismo mensaje), para no revelar
   * qué correos existen ni con qué rol.
   */
  function rolCoincide(rolUsuario, rolElegido) {
    return validarRol(rolElegido) && rolUsuario === rolElegido;
  }

  /** RNF-02: ¿ya se llegó al máximo de intentos fallidos? */
  function debeBloquearCuenta(intentosFallidos) {
    return (Number(intentosFallidos) || 0) >= MAX_INTENTOS_FALLIDOS;
  }

  /** ¿La cuenta sigue bloqueada en el instante `ahora`? `bloqueadoHasta` puede ser null. */
  function estaBloqueada(bloqueadoHasta, ahora) {
    if (!bloqueadoHasta) return false;
    return new Date(bloqueadoHasta).getTime() > ahora.getTime();
  }

  /** Minutos que faltan para el desbloqueo, redondeados hacia arriba (mínimo 1 mientras dure). */
  function minutosRestantes(bloqueadoHasta, ahora) {
    if (!estaBloqueada(bloqueadoHasta, ahora)) return 0;
    return Math.ceil((new Date(bloqueadoHasta).getTime() - ahora.getTime()) / 60000);
  }

  /**
   * RNF-02: calcula cómo queda la cuenta tras un intento fallido.
   * Devuelve el nuevo contador y, si se llegó al máximo, hasta cuándo queda bloqueada.
   * Al bloquear, el contador vuelve a 0 para que, pasados los 10 minutos, tenga 5 intentos nuevos.
   */
  function registrarIntentoFallido(intentosFallidos, ahora) {
    var intentos = (Number(intentosFallidos) || 0) + 1;
    if (debeBloquearCuenta(intentos)) {
      return {
        intentosFallidos: 0,
        bloqueadoHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60000),
        bloqueada: true
      };
    }
    return { intentosFallidos: intentos, bloqueadoHasta: null, bloqueada: false };
  }

  /** Iniciales para el avatar del menú lateral: "Profesor Demo" -> "PD". */
  function obtenerIniciales(nombre, apellido) {
    var primera = function (texto) { return String(texto || '').trim().charAt(0).toUpperCase(); };
    return (primera(nombre) + primera(apellido)) || '?';
  }

  /** Texto del rol que se muestra bajo el nombre (el alumno lleva su grupo, p. ej. "6-A"). */
  function etiquetaRol(rol, grupo) {
    if (rol === 'docente') return 'Maestro';
    if (rol === 'alumno') return grupo ? 'Alumno - ' + grupo : 'Alumno';
    if (rol === 'jefe_academico') return 'Jefe Académico';
    if (rol === 'registrador') return 'Registrador';
    return '';
  }

  // bcrypt solo usa los primeros 72 bytes: una contraseña más larga daría una falsa sensación de seguridad.
  var LARGO_MINIMO_CONTRASENA = 8;
  var LARGO_MAXIMO_CONTRASENA = 72;

  /**
   * Cambio de contraseña desde "Mi Perfil": exige la actual, una nueva de 8 a 72 caracteres con al
   * menos una letra y un número, distinta de la actual, y que la confirmación coincida.
   * (Que la actual sea la correcta lo comprueba el servidor con bcrypt.) Devuelve { valido, errores[] }.
   */
  function revisarCambioContrasena(actual, nueva, confirmacion) {
    var errores = [];
    if (typeof actual !== 'string' || !actual) errores.push('Ingresa tu contraseña actual');
    if (typeof nueva !== 'string' || nueva.length < LARGO_MINIMO_CONTRASENA || nueva.length > LARGO_MAXIMO_CONTRASENA) {
      errores.push('La nueva contraseña debe tener entre ' + LARGO_MINIMO_CONTRASENA + ' y ' + LARGO_MAXIMO_CONTRASENA + ' caracteres');
    } else if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) || !/[0-9]/.test(nueva)) {
      errores.push('La nueva contraseña debe tener al menos una letra y un número');
    } else if (nueva === actual) {
      errores.push('La nueva contraseña debe ser distinta de la actual');
    }
    if (nueva !== confirmacion) errores.push('La confirmación no coincide con la nueva contraseña');
    return { valido: errores.length === 0, errores: errores };
  }

  return {
    MAX_INTENTOS_FALLIDOS: MAX_INTENTOS_FALLIDOS,
    revisarCambioContrasena: revisarCambioContrasena,
    MINUTOS_BLOQUEO: MINUTOS_BLOQUEO,
    validarCredenciales: validarCredenciales,
    validarRol: validarRol,
    rolCoincide: rolCoincide,
    debeBloquearCuenta: debeBloquearCuenta,
    estaBloqueada: estaBloqueada,
    minutosRestantes: minutosRestantes,
    registrarIntentoFallido: registrarIntentoFallido,
    obtenerIniciales: obtenerIniciales,
    etiquetaRol: etiquetaRol
  };
});
