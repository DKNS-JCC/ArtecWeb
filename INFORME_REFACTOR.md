# Informe de refactor profundo — ArtecWeb2

> Rama: `limpieza-final`. Refactor que preserva comportamiento (tests del backend en verde). Un commit por unidad salvo la Fase A inicial, consolidada por decisión del autor.

## Fase A · Backend estructural (protegido por Jest)

| Unidad | Estado | Líneas antes→después | Notas |
|--------|--------|----------------------|-------|
| A2 · Helpers de BD en `utils/db.js` | HECHO | — | Ya aplicado en la limpieza (commit `d011a9a`). |
| A3 · Extraer estadísticas de `/admin/stats` | HECHO | ~18 SQL inline → `services/statsService.js` | Colapsa cada par global/acotado en una consulta con `(? OR museum_id = ?)`. |
| Dedup · `utils/access.js` (`museumScope`, `loadRobotForUser`) | HECHO | — | Centraliza el patrón multi-museo repetido en `api.js`, `authController`, `chatHistoryController`, `incidentService`. |
| A7 · Deduplicar borrado de avatar | HECHO | — | Ya aplicado en la limpieza (commit `54fecb7`). |
| A1 · Consolidar `require()` inline en `api.js` | HECHO | — | jwt y crypto subidos a cabecera; visitorMiddleware inline (x3) eliminado. |
| A6 · Helper de token SSE | HECHO | — | `middleware/sseAuth.js` (`verifySseToken`); cada stream conserva su chequeo de rol. |
| A5 · Extraer `visitorController` | HECHO | — | confirm-nav, expertise y visitor/map → `controllers/visitorController.js`; visitorMiddleware como middleware normal. |
| A4 · Extraer `robotController` | HECHO | `api.js` 611→203 | 13 handlers movidos a `controllers/robotController.js`. DTO robot: los 2 objetos (lista/detalle) no son idénticos, se dejan en el controller; merge con `sseService.formatRobot` NO hecho (opcional, mayor riesgo). |

Verificación de la Fase A: `cd backend && npm test` → 121/121 en verde. `api.js` reducido a enrutado fino (611 → 203 líneas).

## Simplificación STT (huella de IA, T7 auditoría)

| Unidad | Estado | Notas |
|--------|--------|-------|
| Backend: parser WAV binario a mano → `node-wav` | HECHO | ~50 líneas de lectura de offsets sustituidas por la librería. `resampleTo16k` se conserva como red de seguridad. |
| Frontend: `encodeWav` (DataView a mano) → `audiobuffer-to-wav` | HECHO | ~30 líneas menos. Resto del pipeline (OfflineAudioContext) intacto. |

## Fase C · Frontend — partición de god-components (riesgo ALTO, sin tests)

> Verificación por unidad: `cd frontend && npm run build`.

| Unidad | Estado | Líneas antes→después | Notas |
|--------|--------|----------------------|-------|
| C1.1 · `ui/ConfirmDeleteModal.vue` | HECHO | — | Unifica los 3 modales de borrado (robot/cuenta/museo) casi idénticos; mensaje por slot. |
| C1.2 · `composables/useCrud.js` | HECHO | `DashboardView` 1238→1079 | Centraliza el CRUD triplicado (robots/personal/museos). Nombres re-mapeados a los de la plantilla → HTML intacto. |
| C1.3 · Extraer `RobotsTab`/`StaffTab`/`MuseumsTab` | HECHO | `DashboardView` 1079→744 | Pestañas presentacionales en `components/dashboard/`. Las listas (robots/museos) siguen en el padre por estar compartidas (MapTab usa robots). StaffTab se lleva sus filtros. ⚠️ Sin tests: requiere prueba manual del CRUD. |
| C2.1 · Extraer tutorial/coachmarks a `composables/useTutorial.js` | HECHO | `ChatView` 1212→1129 | Toda la mecánica (medición DOM, foco, burbuja, cola, navegación, resize) fuera. ChatView conserva `TUTORIAL_STEPS` y la decisión de primera visita. ⚠️ Sin tests: probar el tutorial a mano (borrar `artec_chat_tutorial_done` de localStorage). |
| C2.2 · Extraer overlay a `ChatTutorial.vue` | HECHO | — | Overlay + estilos `.tour-*`/`.step-*` fuera, con transición `fade` propia (equivale a la `modal` que reutilizaba). La transición `modal` del modal de navegación queda intacta en ChatView. |
| C2.3 · Extraer `ChatComposer.vue` (pie de entrada) | HECHO | `ChatView` 1068→989 | v-model para messageText/showMap, `stt` por prop, eventos send/mic-down/mic-up. Mueve estilos glass-footer/scrollbar-hide/banner. ⚠️ Probar a mano: escribir+enviar, y micro mantener-pulsado. |
| C2.4 · Extraer `ChatMessages.vue` (lista) | PENDIENTE | — | Opcional; requiere exponer `scrollToBottom` (el padre controla el scroll del contenedor). |
| C3.1 · Extraer `map/MapCanvasEditor.vue` (lienzo) | HECHO | `MapTab` 1258→780 | Componente controlado: posee solo el estado de vista (escala/pan/imagen); datos e interacción (`isPlacingMode`/`placingBase`/`hoveredZone`/`pendingZone`) llegan por props/v-model. La carga de imagen se dispara en `onMounted`+watch de `mapData` (antes lo hacía `fetchMapAndZones`). ⚠️ Sin tests: probar a mano pan/zoom, colocar zona, editar y fijar base. |
| C3.2 · Extraer `map/MapZonesSidebar.vue` (barra lateral) | HECHO | — | Presentacional: lista de zonas + punto base + asignación de robots. Todo por props y eventos (`hover`/`edit-zone`/`start-placing-base`/`delete-base`/`assign`/`unassign`). |

## Fase D · Opcionales de pulido

| Unidad | Estado | Notas |
|--------|--------|-------|
| D1 · Unificar configs de multer | HECHO | Nueva fábrica `config/uploadFactory.js` (`almacenamientoEnDisco` + `filtroPorTipo`); `uploadConfig`/`mapUploadConfig`/`audioUploadConfig` reescritas sobre ella conservando subcarpeta, nombre, formatos y límites exactos. `npm test` verde. |
| D2 · Plantilla base de email | HECHO | `renderEmailLayout(contenido)` en `utils/emailService.js` envuelve ambos correos (contenedor+cabecera+pie). Se unificó el color del pie (`#94a3b8`); el resto del HTML es idéntico. |
