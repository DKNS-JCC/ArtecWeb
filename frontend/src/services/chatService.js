import { api } from './api'

export const chatService = {
    sendMessage(message) {
        return api.post('/chat/message', { message })
    }
}
