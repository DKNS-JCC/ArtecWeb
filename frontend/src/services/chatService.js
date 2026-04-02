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
    }
}
