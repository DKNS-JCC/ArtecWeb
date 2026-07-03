/**
 * @module constants/storageKeys
 * @description
 * Claves de `localStorage` usadas en toda la aplicación, centralizadas en un
 * único sitio para evitar literales repetidos (y erratas difíciles de detectar)
 * dispersos por stores, servicios, vistas y composables.
 */
export const STORAGE_KEYS = {
    /** Token JWT de la sesión en curso. */
    TOKEN: 'artec_token',
    /** Datos del usuario/visitante autenticado (JSON). */
    USER: 'artec_user',
    /** Idioma preferido (código: `es`, `en`…). */
    LANGUAGE: 'artec_language',
    /** Historial del chat del visitante (JSON). */
    CHAT_MESSAGES: 'artec_chat_messages',
    /** Marca de que el visitante ya vio el tutorial del chat. */
    CHAT_TUTORIAL_DONE: 'artec_chat_tutorial_done',
    /** Preferencia de lectura automática (TTS) de las respuestas. */
    CHAT_AUTOSPEAK: 'artec_chat_autospeak',
}
