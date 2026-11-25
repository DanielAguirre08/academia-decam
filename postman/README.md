# Pruebas de API con Postman

Colección con 74 peticiones y 235 verificaciones sobre la API de Academia Decam: frontend, autenticación, los cuatro roles, seguridad (OWASP Top 10) y bloqueo por fuerza bruta. Cada petición comprueba además que responda en menos de 2 segundos (RNF-01).

| Archivo | Contenido |
|---|---|
| `Academia-Decam.postman_collection.json` | La colección para importar en Postman |
| `reporte-newman.html` | Reporte de la última ejecución (235 de 235 aprobadas) |
| `resultado-newman.txt` | La misma ejecución en texto |

## Ejecutarla en Postman

1. Arranca el servidor: `npm start` (queda en http://localhost:3001).
2. En Postman: **Import** → elige `Academia-Decam.postman_collection.json`.
3. Sobre la colección: **Run** → desmarca *Stop run if an error occurs* → **Start run**.

Las carpetas van en orden porque cada una inicia sesión con el rol que necesita. Si el servidor usa otro puerto, cambia la variable `baseUrl` de la colección.

**Ojo:** en la base de desarrollo, cada ejecución crea una tarea «Tarea de prueba (Postman)», guarda la asistencia del día y la carpeta 8 bloquea la cuenta `jorge.mendoza` durante 10 minutos. Para dejar los datos como al inicio: `npm run db:reset`.

## Ejecutarla con Newman (sin abrir Postman)

Para no tocar la base de desarrollo, se usa la base de pruebas en el puerto 3101:

```bash
node scripts/preparar-bd-pruebas.js
DB_NAME=academia_decam_test PORT=3101 node server.js
```

Y en otra terminal:

```bash
npx newman run postman/Academia-Decam.postman_collection.json --env-var baseUrl=http://localhost:3101
```

Para regenerar el reporte HTML se agrega `-r cli,htmlextra --reporter-htmlextra-export postman/reporte-newman.html` (requiere el paquete `newman-reporter-htmlextra`).
