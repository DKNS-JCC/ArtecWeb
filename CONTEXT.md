# ArtecWeb2 - Documentación de Contexto

Este documento describe la arquitectura, stack tecnológico y las instrucciones para el servidor web y la aplicación de gestión de robots ROS2, **ArtecWeb2**.

## 1. Arquitectura General y Stack

El proyecto es una aplicación de pila completa (Full-Stack) dividida en dos directorios principales:
- **`backend/`**: Servidor API REST construido en **Node.js** y **Express**.
- **`frontend/`**: Single Page Application (SPA) construida en **Vue 3**, **Vite**, **Vue Router** y estelizada con **TailwindCSS**.

### 1.1 El Backend
- Provee de endpoints estáticos y dinámicos para simular la monitorización de los robots.
- Usa los módulos `cors`, `dotenv` y `express`.
- Rutas actuales:
  - `GET /api/robots`: Devuelve el estado actual de la flota.
  - `GET /api/robots/:id`: Devuelve el estado de un robot en específico.
  - `POST /api/robots/:id/command`: Envía comandos simulados (`move`, `stop`, `charge`) a los robots.

### 1.2 El Frontend
- Layout principal en `src/App.vue` con un Navbar adaptable.
- **HomeView** (`/`): Una "Landing Page" de bienvenida para el cliente, estilizada con modernas técnicas visuales de Tailwind CSS.
- **DashboardView** (`/dashboard`): Un panel de control reactivo donde la interfaz consulta asíncronamente (cada 3 segundos por defecto usando *polling*) al backend para recuperar la información de los robots, y manda comandos reactivos.

---

## 2. Puesta en Marcha

Para arrancar el proyecto en desarrollo, debes abrir dos terminales:

### Terminal 1: Backend
```bash
cd backend
npm install   # (si es necesario)
npm run dev
```
*Se iniciará el servidor en http://localhost:3000 con soporte de reinicio automático via nodemon.*

### Terminal 2: Frontend
```bash
cd frontend
npm install   # (si es necesario)
npm run dev
```
*Se iniciará la interfaz en `http://localhost:5173` (o un puerto similar provisto por Vite).*

---

## 3. Guía de Escalabilidad y Modificación

### Añadir Conexión a Base de Datos:
1. Instala el conector en `backend/` (ej. `npm install pg` para PostgreSQL o `npm install mongoose` para MongoDB).
2. Modifica `backend/src/server.js` conectando a la DB antes de que empiece a escuchar (`app.listen`).
3. Sustituye la variable estática `robots` en `backend/src/routes/api.js` por llamadas a la DB.

### Integrar Librerías para ROS2 reales:
- En Node.js puedes usar la biblioteca `rclnodejs` (que enlaza los binarios locales de ROS2 sobrecargados).
- Los comandos `move`, `stop`, etc, recibidos en la ruta POST del API, deberán publicar mensajes a los *topics* (por ejemplo, a `/cmd_vel`) del framework de ROS2 mediante `rclnodejs`.

### Añadir o Modificar Componentes UI:
- El proyecto pre-instaló las dependencias para soportar bibliotecas como *shadcn-vue*.
- Puedes reemplazar componentes genéricos por componentes prediseñados de shadcn si así lo prefieres en un futuro.
- Los estilos están regidos enteramente por las clases utilitarias en línea de **Tailwind CSS**. Todas las variables globales (colores para `primary`, `background`, etc) se encuentran en `frontend/src/style.css`.
