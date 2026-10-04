# Academia Decam — Backend + Frontend conectados a MySQL

Plataforma de gestión académica con 4 roles (Docente, Alumno, Jefe Académico y Registrador).
Estado actual: **login real con roles (HU-001)** y las 3 historias del Docente
(**HU-005 Calificaciones**, **HU-008 Asistencia**, **HU-010 Tareas**) funcionando contra MySQL.
El resto de módulos se están conectando por fases (ver "Avance por historia de usuario").

## Arquitectura de 3 capas

| Capa | Archivo(s) | Corre en |
|---|---|---|
| Presentación | `dashboard.html` + `js/presentacion-docente.js` | Navegador |
| Lógica de Negocio | `logica-docente.js` (= `js/logica-docente.js`), `logica-auth.js` | **Navegador y servidor** / servidor |
| Datos | `routes/*.js` + `middleware/auth.js` + `config/db.js` + MySQL | Servidor |

La capa de Lógica son funciones puras: sin DOM, sin SQL y sin leer el reloj (la fecha llega por
parámetro). Por eso se prueban con `node`, sin navegador ni base de datos.

## 1. MySQL en Mac (Homebrew)
```bash
brew install mysql@8.4
echo 'export PATH="/opt/homebrew/opt/mysql@8.4/bin:$PATH"' >> ~/.zprofile
brew services start mysql@8.4
mysql -u root -e "SELECT VERSION();"     # debe mostrar 8.4.x
```
Homebrew instala `root` **sin contraseña**; el `.env` ya lo asume.

## 2. Crear la base de datos y cargar datos de prueba
```bash
npm run db:reset      # borra la BD, crea las 14 tablas y carga los datos de prueba
npm run db:check      # 14 controles de integridad entre tablas (todos deben salir OK)
npm run docs:db       # regenera el diccionario de datos y el diagrama entidad-relación
```
Todo lo de la base de datos vive en [`database/`](database/README.md): esquema, datos de prueba,
controles de integridad y el [diccionario de datos](database/diccionario-de-datos.md). Después de un
`git pull` que cambie el esquema, vuelve a correr `npm run db:reset`.

## 3. Configuración
```bash
cp .env.example .env         # y pon tu password de MySQL si root la tiene
```

## 4. Levantar todo
```bash
npm install
npm run dev
```
Abre <http://localhost:3001/dashboard.html>. Al reiniciar el servidor la sesión se pierde y hay que
volver a iniciar sesión (las sesiones viven en memoria).

## Usuarios de prueba

Elige la pestaña del rol y entra con (el cuadro de la pantalla de login los autocompleta al hacer clic):

| Rol | Correo | Contraseña |
|---|---|---|
| Docente | `prof@acadecam.edu.pe` | `decam2024` |
| Alumno (6-A) | `alumno@acadecam.edu.pe` | `alumno2024` |
| Jefe Académico | `jefe@acadecam.edu.pe` | `jefe2024` |
| Registrador | `registrador@acadecam.edu.pe` | `reg2024` |

Hay 3 docentes más (`rosa.quispe@…`, `jorge.mendoza@…`, `carmen.vilca@…`, con `decam2024`) y 14 alumnos más
(`ana.torres@…`, `luis.perez@…`, etc., con `alumno2024`).
En la base las contraseñas están como **hash bcrypt (costo 10)**, nunca en texto plano.

**Seguridad (RNF-02):** tras **5 intentos fallidos seguidos** la cuenta se bloquea **10 minutos**
(incluso con la contraseña correcta). Para desbloquearla en desarrollo: `npm run db:reset`.

## 5. Pruebas unitarias de la capa de Lógica
```bash
npm test      # 31 pruebas, sin frameworks (logica-docente + logica-auth)
```

## API REST

Toda la API exige sesión (cookie `decam.sid`) salvo `POST /api/auth/login`.
Sin sesión responde **401**; con una sesión de rol no permitido, **403**.

| Método | Ruta | HU | Roles | Qué hace |
|---|---|---|---|---|
| POST | `/api/auth/login` | HU-001 | público | Valida correo, contraseña y rol; abre sesión |
| POST | `/api/auth/logout` | HU-001 | cualquiera | Cierra la sesión |
| GET | `/api/auth/me` | HU-001 | con sesión | Devuelve el usuario de la sesión |
| GET | `/api/secciones` | — | con sesión | Secciones reales; llena los combos de grupo |
| GET | `/api/calificaciones?id_seccion&estado&busqueda` | HU-005 CA-003 | docente, jefe | Lista con los filtros |
| POST | `/api/calificaciones` | HU-005 CA-002 | docente | Alta de alumno (USUARIO + ALUMNO + CALIFICACION, en transacción) |
| PATCH | `/api/calificaciones/:id` | HU-005 CA-001 | docente | Cambia una nota y recalcula el promedio |
| GET | `/api/asistencia?id_seccion&fecha` | HU-008 CA-001 | docente, jefe | Lista del grupo con lo ya guardado en esa fecha |
| POST | `/api/asistencia` | HU-008 CA-003 | docente | Guarda el pase de lista (el docente sale de la sesión) |
| GET | `/api/tareas?id_seccion&estado` | HU-010 CA-002 | docente, jefe | Tareas con estado derivado de la fecha límite |
| POST | `/api/tareas` | HU-010 CA-001 | docente | Publica una tarea (con su `tipo`) |

Comprobación rápida sin navegador:
```bash
curl -c cookies.txt -H "Content-Type: application/json" -X POST \
  -d '{"correo":"prof@acadecam.edu.pe","contrasena":"decam2024","rol":"docente"}' \
  http://localhost:3001/api/auth/login
curl -b cookies.txt "http://localhost:3001/api/calificaciones?estado=Desaprobado"
```

## Cambios en el esquema (actualizar el diccionario de datos del informe)

Se agregaron 3 columnas (`usuario.intentos_fallidos`, `usuario.bloqueado_hasta`, `tarea.tipo`), 6 restricciones
únicas, 13 reglas CHECK y 10 índices. La lista completa, con el motivo de cada cambio, está en
[`database/README.md`](database/README.md#cambios-respecto-al-diccionario-de-datos-del-informe-sección-45).

## Estructura del proyecto

```
dashboard.html, js/        Presentación (navegador)
logica-*.js                Lógica de negocio: funciones puras, sin DOM ni SQL
routes/, middleware/       API REST y control de acceso por rol
config/db.js               Conexión a MySQL
database/                  Esquema, datos de prueba, controles de integridad y diccionario de datos
scripts/                   Utilidades (generador del diccionario de datos)
tests/                     Pruebas unitarias de la capa de Lógica
```

## Avance por historia de usuario

| HU | Estado |
|---|---|
| HU-001 Login con acceso por rol | Hecho (bcrypt, sesión, permisos por rol en el servidor, bloqueo por intentos) |
| HU-005 / HU-008 / HU-010 (Docente) | Funcionan contra MySQL. HU-010: falta marcar entregas por alumno (HU-010 CA-003) |
| HU-002 / HU-003 / HU-004 (Registrador) | Pendiente: hoy guardan en memoria |
| HU-006 Exportar CSV | Pendiente: falta BOM UTF-8, encabezados exactos y escapar comas |
| HU-007 / HU-009 (Alumno) | Pendiente: aún no hay endpoints propios del alumno |
| HU-011 Reclamos / HU-012 Avisos | Pendiente |

## Pendientes conocidos

- El alta de alumno desde Calificaciones completa `fecha_nacimiento` y `sexo` con valores
  provisionales y no crea su matrícula (se reemplazará por el módulo de Registro; `npm run db:check`
  lo marca). Esa cuenta nace sin contraseña utilizable.
- `POST /api/asistencia` todavía no valida que cada alumno pertenezca a la sección enviada.
- Las tarjetas del Inicio siguen mostrando `?`: no están conectadas a la API.
- El cuadro "Credenciales de acceso" de la pantalla de login muestra las contraseñas de prueba;
  hay que quitarlo antes de la entrega final.
- `js/datos-docente.js` es código muerto del prototipo en memoria.
