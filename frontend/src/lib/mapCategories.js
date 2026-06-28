/**
 * @file Paleta y etiquetas compartidas de categorías de zona para las vistas de
 * mapa ({@link module:components/VisitorMap}, {@link module:components/MapTab}).
 * Colores funcionales/semánticos, distintos del acento de marca, para que cada
 * categoría sea identificable en el lienzo del mapa.
 * @module constants/mapCategories
 */

/**
 * Clave de la categoría especial "base" (punto de retorno del robot).
 * @constant {string}
 * @memberof module:constants/mapCategories
 */
export const BASE_CATEGORY = 'base'

/**
 * Color de la categoría base.
 * @constant {string}
 * @memberof module:constants/mapCategories
 */
export const BASE_COLOR = '#0ea5e9'

/**
 * Mapa categoría → color hexadecimal.
 * @constant {Object<string, string>}
 * @memberof module:constants/mapCategories
 */
export const CATEGORY_COLORS = {
    exhibit: '#3b82f6',
    obra: '#f59e0b',
    entrance: '#22c55e',
    exit: '#ef4444',
    restroom: '#8b5cf6',
    other: '#6b7280',
    [BASE_CATEGORY]: BASE_COLOR,
}

/**
 * Mapa categoría → etiqueta legible en español.
 * @constant {Object<string, string>}
 * @memberof module:constants/mapCategories
 */
export const CATEGORY_LABELS = {
    exhibit: 'Exhibición',
    obra: 'Obra',
    entrance: 'Entrada',
    exit: 'Salida',
    restroom: 'Baños',
    other: 'Otro',
}

/**
 * Categorías seleccionables (para `<select>` y formularios de zonas).
 * @constant {Array<{value: string, label: string}>}
 * @memberof module:constants/mapCategories
 */
export const CATEGORIES = [
    { value: 'exhibit', label: 'Exhibición' },
    { value: 'obra', label: 'Obra' },
    { value: 'entrance', label: 'Entrada' },
    { value: 'exit', label: 'Salida' },
    { value: 'restroom', label: 'Baños' },
    { value: 'other', label: 'Otro' },
]

/**
 * Devuelve el color de una categoría (cae a `other` si no existe).
 * @function categoryColor
 * @memberof module:constants/mapCategories
 * @param {string} category  Clave de categoría.
 * @returns {string}  Color hexadecimal.
 */
export function categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

/**
 * Devuelve la etiqueta legible de una categoría (cae a `'Zona'` si no existe).
 * @function categoryLabel
 * @memberof module:constants/mapCategories
 * @param {string} category  Clave de categoría.
 * @returns {string}  Etiqueta en español.
 */
export function categoryLabel(category) {
    return CATEGORY_LABELS[category] || 'Zona'
}
