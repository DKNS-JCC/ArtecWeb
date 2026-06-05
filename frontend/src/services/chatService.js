import { api } from './api'

export const chatService = {
    sendMessage(message) {
        return api.post('/chat/message', { message })
    },

    /**
     * Transcribe a recorded voice clip using the backend's local Whisper model.
     * @param {Blob} wavBlob  16 kHz mono PCM-16 WAV produced by useSpeechToText.
     * @returns {Promise<{ text: string }>}
     */
    transcribe(wavBlob) {
        const formData = new FormData()
        formData.append('audio', wavBlob, 'voice.wav')
        return api.uploadFormData('/chat/stt', formData)
    },

    /**
     * Confirm a pending navigate_to intent and fire the actual ROS goal.
     * @param {string} placeId  Zone ID returned by the chat API as resolved_place.id
     */
    confirmNav(placeId) {
        return api.post('/chat/confirm-nav', { place_id: placeId })
    },

    /** Get the map and zones assigned to the visitor's robot. */
    getVisitorMap() {
        return api.get('/visitor/map')
    },

    /** Update the visitor's expertise level (AI adapts language on next message). */
    updateExpertise(level) {
        return api.patch('/visitor/expertise', { expertise_level: level })
    }
}
