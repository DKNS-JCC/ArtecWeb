# 🚀 Guía de arranque — ArtecWeb2

Guía completa para poner en marcha la plataforma (backend + frontend), tanto en
**desarrollo local** como en una **demo sobre una red desconocida** (visitantes
escaneando el QR desde el móvil, con voz STT/TTS).

> Frontend y backend corren **siempre en el mismo PC**. Los visitantes se conectan
> desde su móvil por la IP de ese PC en la red local.

---

## 1. Requisitos previos

| Software | Versión recomendada | Comprobar |
|----------|---------------------|-----------|
| Node.js  | 20 o 22 LTS         | `node -v` |
| npm      | 10+                 | `npm -v`  |

Sistema operativo: **Windows** (probado). Funciona también en macOS/Linux.

> ⚠️ **Antes de la demo, instala dependencias y prueba la voz CON internet.** El
> modelo de reconocimiento de voz (Whisper) se descarga la primera vez y queda
> cacheado; después funciona **sin internet**. Ver §6.

---

## 2. Estructura del proyecto

```
ArtecWeb2/
├── backend/      # API Express + SQLite + IA (Gemini) + STT local (Whisper)
├── frontend/     # SPA Vue 3 (chat del visitante, panel admin)
├── database/     # database.sqlite
├── .env.local    # ⚙️ configuración (NO se sube a git)
└── docs/
```

---

## 3. Configuración (`.env.local`)

El archivo `.env.local` vive en la **raíz** del proyecto. Lo leen tanto el backend
como el frontend (Vite está configurado con `envDir: '..'`).

Si no existe, créalo a partir de [`.env.example`](../.env.example):

```bash
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
```

Contenido relevante:

```ini
# ── Backend ───────────────────────────────────────────
PORT=3000
JWT_SECRET=pon-aqui-una-cadena-larga-y-aleatoria

# Email (opcional — solo para invitar staff)
GMAIL_USER=
GMAIL_APP_PASSWORD=
APP_URL=http://localhost:5173/login

# IA del chat (interpretación de mensajes). Sin clave usa un fallback básico.
GEMINI_API_KEY=tu-clave-gemini
GEMINI_MODEL=gemini-2.5-flash

# Reconocimiento de voz LOCAL (Whisper). Sin clave, gratis, offline tras 1ª descarga.
WHISPER_MODEL=Xenova/whisper-tiny      # o Xenova/whisper-base (más preciso, +lento)
WHISPER_LANGUAGE=spanish

# ── Frontend ──────────────────────────────────────────
# DÉJALO COMENTADO. Así el frontend usa '/api' relativo (mismo origen) y el proxy
# de Vite lo redirige al backend. Esto hace que funcione en CUALQUIER red sin tocar IPs.
# VITE_API_URL=http://localhost:3000/api
```

> 🔑 **Regla de oro:** deja `VITE_API_URL` **comentada**. Solo descoméntala si el
> backend está en otra máquina distinta del frontend.

---

## 4. Instalación (una sola vez)

Desde la raíz, en dos pasos:

```bash
cd backend  && npm install
cd ../frontend && npm install
```

(Opcional) Cargar datos de ejemplo en la base de datos:

```bash
cd backend && npm run seed
```

---

## 5. Arranque

Necesitas **dos terminales** (una por servicio). Desde la raíz del proyecto:

### Terminal 1 — Backend
```bash
cd backend
npm run dev        # nodemon, reinicia al guardar
# o:  npm start    # producción simple
```
Verás: `Preparen sus roombas que el backend esta on fire` → escucha en `:3000`.

### Terminal 2 — Frontend
```bash
cd frontend
npm run dev          # HTTP normal (cómodo para desarrollo)
# o, si necesitas el micrófono en móviles reales:
npm run dev:https    # HTTPS con certificado autofirmado local
```

Por defecto Vite arranca en **HTTP** sobre `http://0.0.0.0:5173` (sin avisos de
certificado). Escucha en **todas las interfaces de red**, así que es accesible
por `localhost` y por la IP de LAN. Usa `dev:https` **solo** cuando vayas a probar
el micrófono desde un teléfono (ver §6).

| Acceso | URL (modo `dev`) | URL (modo `dev:https`) |
|--------|------------------|------------------------|
| Panel admin (en el PC)      | `http://localhost:5173` | `https://localhost:5173` |
| Panel admin (por IP de LAN) | `http://<IP-DEL-PC>:5173` | `https://<IP-DEL-PC>:5173` |
| Visitante (QR)              | `http://<IP-DEL-PC>:5173/r/<robotId>` | `https://<IP-DEL-PC>:5173/r/<robotId>` |

> ⚠️ Escribe el esquema correcto en el navegador: en modo `dev` usa `http://`,
> en modo `dev:https` usa `https://`. Mezclarlos da `ERR_EMPTY_RESPONSE`.
>
> En modo `dev:https`, la primera vez cada dispositivo mostrará un **aviso de
> certificado** → acepta ("Avanzado → Continuar"). Es normal con certificado
> local y **obligatorio para que funcione el micrófono** fuera de `localhost`.

---

## 6. 🎙️ Funcionalidad de voz (STT + TTS)

El chat del visitante incluye:

- **TTS (el robot habla):** voz del propio dispositivo (`SpeechSynthesis`), gratis
  y offline. Toggle global 🔊 en la cabecera + botón de repetir en cada mensaje.
- **STT (el visitante habla):** botón de micrófono "mantener pulsado para hablar".
  El audio se transcribe con **Whisper ejecutándose en el backend** (local, gratis,
  sin APIs externas).

### Requisitos para que la voz funcione en el móvil
1. **HTTPS** — arranca el frontend con `npm run dev:https`. Sin contexto seguro,
   el navegador **bloquea el micrófono** en cualquier IP que no sea `localhost`.
   (En el propio PC vía `localhost`, el micro funciona también en modo `http`.)
2. **Aceptar el certificado** en el móvil (ver §5) y dar **permiso de micrófono**
   cuando lo pida.

### Pre-descarga del modelo Whisper (¡IMPORTANTE para demo sin internet!)
La **primera** transcripción descarga el modelo (~42 MB) desde internet y lo cachea
en `backend/node_modules/@xenova/transformers/.cache`. Después funciona offline.

**Antes de una demo sin internet garantizado**, fuerza la descarga con conexión:
```bash
# Arranca el backend con internet y haz una grabación de prueba desde el chat,
# o ejecuta una transcripción cualquiera. Verás en consola:
#   [STT] Loading local Whisper model ... → [STT] Whisper model ready.
```
Una vez cacheado, **no borres `node_modules`** del backend.

---

## 7. 📱 Flujo de demo en una red desconocida (paso a paso)

1. Conecta el **PC** a la red de la demo (WiFi/cable).
2. Arranca **backend** y **frontend**. Para la demo con voz en móviles usa el
   modo HTTPS: `cd frontend && npm run dev:https`.
3. Averigua la **IP del PC** en esa red:
   ```bash
   ipconfig          # busca "Dirección IPv4" (ej. 192.168.x.x)
   ```
4. En el PC, abre el **panel admin por la IP**: `https://<IP-DEL-PC>:5173`
   (así los QR que genera apuntan a esa IP, no a `localhost`). Inicia sesión.
5. Conecta el robot y **muestra el QR** de ese robot (se genera **en local**, no
   necesita internet).
6. El **visitante escanea el QR** con la cámara del móvil →
   `https://<IP-DEL-PC>:5173/r/<robotId>` → acepta el certificado → da permiso de
   micro → **chatea, habla y escucha** al robot.

> ✅ No hay ninguna IP que editar a mano: el frontend usa rutas relativas y el QR
> toma la IP de la barra de direcciones del panel admin.

### Checklist rápido pre-demo
- [ ] `npm install` hecho en `backend` y `frontend`.
- [ ] Modelo Whisper pre-descargado (probado el micro **con** internet una vez).
- [ ] `VITE_API_URL` **comentada** en `.env.local`.
- [ ] `GEMINI_API_KEY` puesta (si quieres respuestas de IA buenas).
- [ ] Probado el flujo completo desde **un móvil real** vía IP + HTTPS.
- [ ] (Recomendado) IP fija/reserva DHCP para el PC en el router de la demo.

---

## 8. 🔧 Solución de problemas

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `ERR_EMPTY_RESPONSE` al abrir la app | Entraste por `http://` con el server en HTTPS (o viceversa) | Usa el esquema correcto: `http://` con `npm run dev`, `https://` con `npm run dev:https` |
| `POST .../api/... net::ERR_CONNECTION_REFUSED` | Backend no arrancado, o IP/origen incorrecto | Arranca el backend; comprueba `netstat -ano \| findstr :3000`; deja `VITE_API_URL` comentada y reinicia Vite |
| El micrófono no pide permiso / falla | La página no está en HTTPS, o no aceptaste el certificado | Entra por `https://`, acepta el aviso de certificado, concede permiso de micro |
| El QR no se ve / da error de red | (Ya corregido) dependía de internet | Ahora se genera en local; si sigue, recarga el panel |
| El QR lleva a `localhost` y el móvil no abre | Abriste el panel admin por `localhost` | Abre el panel por `https://<IP-DEL-PC>:5173` y regenera/relee el QR |
| STT tarda ~3-5 s la primera vez | Carga inicial del modelo en memoria | Normal; las siguientes son rápidas. (Se puede pre-calentar al arrancar) |
| STT falla y en consola: error de red al cargar modelo | Sin internet y modelo no cacheado | Pre-descarga el modelo con internet (§6) antes de la demo |
| Cambié `.env.local` y no surte efecto | Vite/Node leen variables al arrancar | **Reinicia** el servidor correspondiente |
| El móvil no conecta al PC | Aislamiento de clientes del WiFi, o firewall | Usa una red sin "AP isolation"; permite Node en el Firewall de Windows (puertos 3000 y 5173) |

### Permitir los puertos en el Firewall de Windows (si el móvil no conecta)
```powershell
New-NetFirewallRule -DisplayName "ArtecWeb Vite 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
New-NetFirewallRule -DisplayName "ArtecWeb API 3000"  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## 9. Referencia rápida de comandos

```bash
# Instalar
cd backend && npm install
cd frontend && npm install

# Arrancar (2 terminales)
cd backend  && npm run dev
cd frontend && npm run dev          # HTTP (desarrollo)
cd frontend && npm run dev:https    # HTTPS (micro en móviles / demo)

# Datos de ejemplo
cd backend && npm run seed

# Tests backend
cd backend && npm test

# Build de producción del frontend
cd frontend && npm run build && npm run preview   # preview también sirve por HTTPS + proxy

# Ver IP del PC (Windows)
ipconfig
```

---

## 10. Notas de arquitectura relevantes

- **Origen único + proxy:** `frontend/vite.config.js` redirige `/api` y `/uploads`
  al backend (`http://localhost:3000`). Por eso el frontend usa rutas relativas y
  no hay CORS ni IPs hardcodeadas.
- **HTTPS local (opt-in):** plugin `@vitejs/plugin-basic-ssl` (certificado
  autofirmado, generado en local, sin internet). Desactivado por defecto; se
  activa con `npm run dev:https` (`VITE_HTTPS=1`). Necesario para el micrófono
  fuera de `localhost`.
- **STT local:** `backend/src/services/sttService.js` ejecuta Whisper vía
  `@xenova/transformers` (onnxruntime con binarios precompilados, sin compilar nada
  en Windows). Ruta: `POST /api/chat/stt`.
- **TTS local:** `frontend/src/composables/useTextToSpeech.js` usa la API
  `SpeechSynthesis` del navegador.
- **QR local:** `frontend/src/views/DashboardView.vue` genera los QR con la librería
  `qrcode` (sin servicios externos).
