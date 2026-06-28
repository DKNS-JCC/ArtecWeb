# ARTEC · Documentación técnica del Frontend

Documentación de referencia (estilo *Javadoc*) del cliente web de **ARTEC**,
generada automáticamente con [JSDoc](https://jsdoc.app/) + plantilla
[Docdash](https://github.com/clenemt/docdash) a partir del código fuente y sus
comentarios.

> Esta es la contraparte de la documentación del backend
> (`docs/back`). Aquí se documentan **componentes, vistas, composables,
> stores, servicios, utilidades, constantes y configuración** del frontend.

---

## 1. Descripción general

ARTEC es una plataforma de **guías robóticas para museos**. El frontend es una
*Single Page Application* (SPA) que da servicio a dos grandes perfiles:

- **Visitante.** Escanea un QR junto al robot, inicia una sesión efímera y
  conversa con una **guía con IA** (texto y voz: *speech-to-text* con Whisper
  local y *text-to-speech* del navegador). Puede pedir al robot que le lleve a una
  zona del museo (navegación ROS / Nav2).
- **Personal (técnicos y administradores).** Acceden a un panel para gestionar
  robots, museos, mapas y zonas, revisar estadísticas e incidencias y
  **teleoperar** o enviar objetivos de navegación a los robots en tiempo real.

El estado en vivo de los robots (posición, conexión, ocupación) llega vía
**SSE** desde el backend, y la comunicación con los robots se realiza con **ROS**
(`roslib`).

---

## 2. Arquitectura del frontend

El cliente sigue una separación de responsabilidades cercana a **MVVM**, en
capas:

| Capa | Carpeta | Rol |
|------|---------|-----|
| **Vista** | `views/`, `components/` | Componentes Vue (SFC `<script setup>`). Renderizado e interacción. |
| **VistaModelo / Estado** | `stores/` | Stores de **Pinia** (estado reactivo y acciones; p. ej. autenticación). |
| **Lógica reutilizable** | `composables/` | Composables de la Composition API (voz: STT/TTS). |
| **Acceso a datos** | `services/` | Clientes de la **API REST** sobre `fetch` (un adaptador HTTP central, `api.js`). |
| **Navegación** | `router/` | **Vue Router**: rutas, *lazy loading* y *navigation guards* por rol. |
| **Utilidades / Constantes** | `lib/` | Helpers (`cn`) y constantes compartidas (paleta de categorías de zonas). |
| **Configuración** | `main.js`, `vite.config.js` | Arranque de la app (Pinia + Router) y configuración de Vite (proxy, alias, HTTPS). |

**Principios:**

- **Origen único de datos** para la sesión: el store `stores/auth` es la fuente
  de verdad (token JWT, usuario, rol) y persiste en `localStorage`.
- **Una sola capa de red:** todos los servicios pasan por `services/api`, que
  inyecta `Authorization: Bearer <token>` y centraliza el manejo de errores (un
  `401` cierra sesión y redirige a login).
- **Mismo origen:** las llamadas usan rutas relativas (`/api`) que Vite redirige
  (proxy) al backend, de modo que la app funciona en cualquier red sin configurar
  IPs ni lidiar con CORS.

---

## 3. Tecnologías utilizadas

Detectadas automáticamente desde `frontend/package.json`:

| Tecnología | Uso en el proyecto |
|------------|--------------------|
| **Vue 3.5** (Composition API, `<script setup>`) | Framework de UI. |
| **Vite 7** | Bundler / servidor de desarrollo (proxy a la API, HTTPS opcional). |
| **Pinia 3** | Gestión de estado (store de autenticación). |
| **Vue Router 5** | Enrutado SPA con *guards* por rol. |
| **@vueuse/core** | Utilidades de composición reactivas. |
| **Tailwind CSS v4** (`@tailwindcss/vite`) | Estilos utilitarios. |
| **lucide-vue-next** | Iconografía SVG. |
| **class-variance-authority · clsx · tailwind-merge** | Sistema de variantes de UI (estilo *shadcn*) - ver `lib/utils`. |
| **qrcode** | Generación de códigos QR de acceso a robots. |
| **roslib** | Puente con ROS para datos y control del robot. |

> **No** se usan Axios, PrimeVue ni Vuetify: la red se hace con `fetch` nativo y
> la biblioteca de UI es propia (componentes en `components/ui/`).

---

## 4. Estructura de carpetas

```text
frontend/
├─ src/
│  ├─ main.js                # Arranque: crea la app, monta Pinia y el Router
│  ├─ App.vue                # Componente raíz (layout + <router-view>)
│  ├─ router/
│  │  └─ index.js            # Rutas + navigation guard por rol
│  ├─ views/                 # Páginas enrutadas (Home, Chat, Login, Dashboard…)
│  ├─ components/            # Componentes reutilizables (tabs, mapa, panel robot…)
│  │  └─ ui/                 # Primitivas de UI (Button, Card, Input, Alert, Label)
│  ├─ composables/           # useSpeechToText, useTextToSpeech
│  ├─ stores/                # Stores de Pinia (auth)
│  ├─ services/              # Clientes de la API REST (api, auth, chat, robot…)
│  └─ lib/                   # utils.js (cn) y mapCategories.js (constantes)
├─ jsdoc.json                # Configuración de JSDoc (esta documentación)
├─ jsdoc/                    # Plugin Vue + esta portada
├─ scripts/serve-docs.mjs    # Servidor estático para previsualizar la doc
└─ vite.config.js            # Configuración de Vite
```

---

## 5. Cómo está organizada esta documentación

Cada fichero declara un `@module <sección>/<nombre>`, de modo que en la barra
lateral (sección **Modules**) los elementos quedan **agrupados por prefijo**,
como los paquetes de Javadoc:

| Sección | Prefijo de módulo | Contenido |
|---------|-------------------|-----------|
| **Components** | `components/…` | Componentes Vue (incluye `components/ui/…`). |
| **Views** | `views/…` | Páginas enrutadas. |
| **Composables** | `composables/…` | Lógica reutilizable de la Composition API. |
| **Stores** | `stores/…` | Estado de Pinia. |
| **Services** | `services/…` | Acceso a la API REST. |
| **Utils** | `utils/…` | Funciones de utilidad. |
| **Constants** | `constants/…` | Constantes y enumerados. |
| **Configuration** | `config/…` | Arranque, router y Vite. |

Para los componentes, cada módulo describe en su cabecera las **Props**, los
**Eventos** emitidos y las **Dependencias** relevantes.

---

## 6. Regenerar y servir la documentación

Desde la carpeta `frontend/`:

```bash
npm run docs           # Genera la documentación (alias de docs:generate)
npm run docs:generate  # jsdoc -c jsdoc.json  ->  docs/front
npm run docs:serve     # Sirve docs/front en http://localhost:8088
```

La salida se escribe en `docs/front/` (fuera del control de versiones, igual que
el resto de documentación generada).
