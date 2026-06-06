// Shared zone-category palette for map views (VisitorMap, MapTab).
// Functional/semantic colors — kept distinct from the brand accent so each
// category stays visually identifiable on the map canvas.

export const BASE_CATEGORY = 'base'
export const BASE_COLOR = '#0ea5e9'

export const CATEGORY_COLORS = {
    exhibit: '#3b82f6',
    obra: '#f59e0b',
    entrance: '#22c55e',
    exit: '#ef4444',
    restroom: '#8b5cf6',
    other: '#6b7280',
    [BASE_CATEGORY]: BASE_COLOR,
}

export const CATEGORY_LABELS = {
    exhibit: 'Exhibición',
    obra: 'Obra',
    entrance: 'Entrada',
    exit: 'Salida',
    restroom: 'Baños',
    other: 'Otro',
}

export const CATEGORIES = [
    { value: 'exhibit', label: 'Exhibición' },
    { value: 'obra', label: 'Obra' },
    { value: 'entrance', label: 'Entrada' },
    { value: 'exit', label: 'Salida' },
    { value: 'restroom', label: 'Baños' },
    { value: 'other', label: 'Otro' },
]

export function categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

export function categoryLabel(category) {
    return CATEGORY_LABELS[category] || 'Zona'
}
