# ARTEC · Documentación técnica del Backend

Documentación de referencia (estilo *Javadoc*) de la API y la lógica de servidor
de **ARTEC**, generada automáticamente con [JSDoc](https://jsdoc.app/) + plantilla
[Docdash](https://github.com/clenemt/docdash) a partir del código fuente y sus
comentarios.

> Es la contraparte de la documentación del frontend (`docs/front`). Aquí se
> documentan **rutas, middleware, controladores, servicios, utilidades y la capa
> de persistencia** del backend.

---

## 1. Descripción general

El backend de ARTEC es una API REST (Node.js + Express) organizada en capas. Cada
petición atraviesa: arranque y configuración (`server.js`) → rutas
(`routes/api.js`) → middleware de seguridad (JWT y roles) → controladores →
servicios → utilidades y persistencia (`database.js` → SQLite).

## 2. Cómo está organizada

- **Controladores** (`controllers/`): manejo de peticiones por dominio
  (autenticación, museos, mapas, chat, historial y restablecimiento de contraseña).
- **Servicios** (`services/`): lógica de negocio e integraciones externas
  (Gemini, ROS, voz local con Whisper, tiempo real con SSE, navegación,
  incidencias y limpieza).
- **Middleware** (`middleware/`): verificación de identidad y autorización por rol
  y por museo, y validación de la sesión de visitante.
- **Utilidades y configuración** (`utils/`, `config/`, `database.js`): correo,
  geometría, caché de zonas, subida de ficheros y esquema de la base de datos.

> La especificación interactiva de la API (OpenAPI / Swagger UI) se sirve aparte
> en `GET /api/docs` con el backend en marcha.

## 3. Cómo navegar

Usa la barra lateral (con buscador) para saltar entre módulos. Cada módulo lista
sus funciones con sus parámetros y valores de retorno documentados.
