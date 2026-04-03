import { api } from './api'

export const chatService = {
    sendMessage(message) {
        return api.post('/chat/message', { message })
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

    /** Lightweight poll — returns { x, y, theta, last_update } for the visitor's robot. */
    getRobotPosition() {
        return api.get('/visitor/robot-position')
    },

    /** Update the visitor's expertise level (AI adapts language on next message). */
    updateExpertise(level) {
        return api.patch('/visitor/expertise', { expertise_level: level })
    }
}
