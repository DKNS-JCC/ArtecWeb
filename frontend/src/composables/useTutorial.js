import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * @file Composable del tutorial de coachmarks (onboarding de la primera visita).
 * @module composables/useTutorial
 *
 * Ilumina cada control real y ancla junto a él una pequeña burbuja con una cola
 * que apunta al elemento. Las posiciones se miden en vivo desde el DOM (vía el
 * atributo `data-tour` de cada paso), de modo que la burbuja sigue al botón real
 * sea cual sea el tamaño de pantalla. Los pasos cuyo objetivo no está renderizado
 * se omiten automáticamente. El composable gestiona su propio re-medido al
 * redimensionar la ventana.
 *
 * @param {Array<{target: string, place: 'above'|'below', title: string, desc: string}>} steps
 * @param {string} storageKey  Clave de localStorage donde se marca el tutorial como visto.
 * @returns {Object} Estado reactivo y controles del tutorial.
 */
export function useTutorial(steps, storageKey) {
    const showTutorial = ref(false)
    const tutorialStep = ref(0)
    const targetRect   = ref(null)   // caja delimitadora del elemento del paso actual

    // Pasos visibles: los que tienen su elemento en el DOM. Se calcula al arrancar el
    // tutorial (no con un computed), porque `querySelector` no es reactivo y evaluarlo
    // en el primer render —antes de montar el DOM— cachearía una lista vacía para siempre.
    const visibleSteps = ref([])

    const currentTutorialStep = computed(() => visibleSteps.value[tutorialStep.value] || null)

    const VIEWPORT = () => ({ w: window.innerWidth, h: window.innerHeight })

    /** Vuelve a medir el elemento resaltado para que el foco y la burbuja lo sigan. */
    const measureTarget = () => {
        const step = currentTutorialStep.value
        if (!step) { targetRect.value = null; return }
        const el = document.querySelector(`[data-tour="${step.target}"]`)
        if (!el) { targetRect.value = null; return }
        const r = el.getBoundingClientRect()
        targetRect.value = { top: r.top, left: r.left, width: r.width, height: r.height,
                             bottom: r.bottom, right: r.right, cx: r.left + r.width / 2 }
    }

    /** Recorte del foco: un anillo con relleno sobre el elemento con una sombra exterior enorme. */
    const spotlightStyle = computed(() => {
        const r = targetRect.value
        if (!r) return { display: 'none' }
        const pad = 8
        return {
            top:    `${r.top - pad}px`,
            left:   `${r.left - pad}px`,
            width:  `${r.width + pad * 2}px`,
            height: `${r.height + pad * 2}px`,
        }
    })

    const BUBBLE_W = 280

    /** Caja de la burbuja, ajustada al viewport y desplazada encima/debajo del elemento. */
    const bubbleStyle = computed(() => {
        const r = targetRect.value
        const step = currentTutorialStep.value
        if (!r || !step) return { display: 'none' }
        const { w } = VIEWPORT()
        const margin = 12
        let left = r.cx - BUBBLE_W / 2
        left = Math.max(margin, Math.min(left, w - BUBBLE_W - margin))
        const style = { width: `${BUBBLE_W}px`, left: `${left}px` }
        if (step.place === 'below') style.top = `${r.bottom + 16}px`
        else style.bottom = `${VIEWPORT().h - r.top + 16}px`
        return style
    })

    /** Desplazamiento horizontal de la cola de la burbuja para que apunte al centro del elemento. */
    const tailStyle = computed(() => {
        const r = targetRect.value
        if (!r) return { display: 'none' }
        const { w } = VIEWPORT()
        const margin = 12
        let left = r.cx - BUBBLE_W / 2
        left = Math.max(margin, Math.min(left, w - BUBBLE_W - margin))
        return { left: `${Math.max(16, Math.min(r.cx - left, BUBBLE_W - 16))}px` }
    })

    const startTutorial = async () => {
        // Recalcula qué pasos tienen su elemento renderizado justo al arrancar (DOM ya montado).
        visibleSteps.value = steps.filter(s => document.querySelector(`[data-tour="${s.target}"]`))
        tutorialStep.value = 0
        showTutorial.value = true
        await nextTick()
        measureTarget()
    }

    const nextTutorialStep = async () => {
        if (tutorialStep.value < visibleSteps.value.length - 1) {
            tutorialStep.value++
            await nextTick()
            measureTarget()
        } else {
            closeTutorial()
        }
    }

    const closeTutorial = () => {
        showTutorial.value = false
        targetRect.value = null
        localStorage.setItem(storageKey, '1')
    }

    // Re-mide el objetivo al redimensionar para que el foco siga al control.
    const onViewportChange = () => { if (showTutorial.value) measureTarget() }
    onMounted(() => window.addEventListener('resize', onViewportChange))
    onUnmounted(() => window.removeEventListener('resize', onViewportChange))

    return {
        showTutorial, tutorialStep, visibleSteps, currentTutorialStep,
        spotlightStyle, bubbleStyle, tailStyle,
        startTutorial, nextTutorialStep, closeTutorial,
    }
}
