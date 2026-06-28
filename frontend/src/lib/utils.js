/**
 * @file Utilidades de UI compartidas.
 * @module utils/cn
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combina clases de Tailwind de forma segura: resuelve condicionales con `clsx`
 * y deduplica/soluciona conflictos con `tailwind-merge` (gana la última clase).
 * Es la base del sistema de variantes de los componentes `components/ui/`.
 *
 * @function cn
 * @memberof module:utils/cn
 * @param {...(string|Object|Array)} inputs  Clases o expresiones condicionales.
 * @returns {string}  Cadena de clases final, sin conflictos.
 *
 * @example
 * cn('px-2', isActive && 'bg-primary', 'px-4') // -> 'bg-primary px-4'
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs))
}
