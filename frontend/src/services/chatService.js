/**
 * @file Servicio del chat con la guía IA del visitante: envío de mensajes,
 * transcripción de voz (STT), confirmación de navegación y datos del mapa/zonas
 * del robot asignado. Capa de acceso a las rutas `/chat` y `/visitor`.
 * @module services/chatService
 */
import { api } from './api'

/**
 * Operaciones del chat del visitante contra la API.
 * @namespace chatService
 * @memberof module:services/chatService
 */
export const chatService = /** @lends module:services/chatService.chatService */ {
    /**
     * Envía un mensaje de texto a la guía IA y obtiene su respuesta.
     * @param {string} message  Texto del visitante.
     * @returns {Promise<Object>}  Respuesta de la IA (puede incluir intención de navegación).
     */
    sendMessage(message) {
        return api.post('/chat/message', { message })
    },

    /**
     * Transcribe un clip de voz grabado usando el modelo local de Whisper del backend.
     * @param {Blob} wavBlob  WAV PCM-16 mono de 16 kHz producido por useSpeechToText.
     * @returns {Promise<{ text: string }>}
     */
    transcribe(wavBlob) {
        const formData = new FormData()
        formData.append('audio', wavBlob, 'voice.wav')
        return api.uploadFormData('/chat/stt', formData)
    },

    /**
     * Confirma un intent navigate_to pendiente y lanza el goal real de ROS.
     * @param {string} placeId  ID de la zona devuelto por la API del chat como resolved_place.id
     */
    confirmNav(placeId) {
        return api.post('/chat/confirm-nav', { place_id: placeId })
    },

    /**
     * Obtiene el mapa y las zonas asignadas al robot del visitante.
     * @returns {Promise<Object>}  Mapa y listado de zonas navegables.
     */
    getVisitorMap() {
        return api.get('/visitor/map')
    },

    /**
     * Actualiza el nivel de conocimiento del visitante; la IA adapta el lenguaje
     * en el siguiente mensaje.
     * @param {string} level  Nivel de experiencia (p. ej. `general`, `experto`).
     * @returns {Promise<Object>}
     */
    updateExpertise(level) {
        return api.patch('/visitor/expertise', { expertise_level: level })
    }
}
