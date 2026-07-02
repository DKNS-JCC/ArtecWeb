import { ref } from 'vue'

/**
 * @file Composable de CRUD para las entidades del panel de administración.
 * @module composables/useCrud
 *
 * Robots, personal y museos repetían el mismo flujo casi idéntico de crear /
 * editar / borrar: refs de estado (formulario, error, éxito, modales), y
 * handlers con el patrón «limpiar mensajes → llamar al servicio → refrescar la
 * lista → autocerrar el modal tras un momento (o mostrar el error)». Este
 * composable centraliza ese patrón; cada entidad solo aporta sus servicios,
 * mensajes y forma de formulario. Los nombres devueltos se re-mapean en la vista
 * a los que ya usaba la plantilla, de modo que el HTML no cambia.
 *
 * @param {Object}   cfg
 * @param {Function} cfg.refetch                Recarga la lista tras cada operación.
 * @param {Function} cfg.createFn               (form) => Promise. Crea la entidad.
 * @param {Function} cfg.updateFn               (form) => Promise. Actualiza la entidad.
 * @param {Function} cfg.removeFn               (target) => Promise. Elimina la entidad.
 * @param {Function} cfg.blankForm              () => objeto del formulario de creación vacío.
 * @param {Function} cfg.toEditForm             (item) => objeto del formulario de edición.
 * @param {Object}   cfg.messages               { created, updated, createError, updateError, deleteError }.
 * @param {Function} [cfg.blankEditForm]        () => forma inicial del formulario de edición (por defecto {}).
 * @param {boolean}  [cfg.sharedForm=false]     Si crear y editar comparten el mismo ref de formulario (caso robots).
 * @param {boolean}  [cfg.showDeleteError=true] Si un fallo al borrar se muestra en la UI (si no, va a consola).
 * @param {Object}   [cfg.delays]               { create, edit } ms para autocerrar el modal (por defecto 1500).
 * @returns {Object} Estado reactivo y handlers del CRUD.
 */
export function useCrud(cfg) {
    const {
        refetch, createFn, updateFn, removeFn,
        blankForm, toEditForm, messages,
        blankEditForm = () => ({}),
        sharedForm = false,
        showDeleteError = true,
        delays = {},
    } = cfg

    const createDelay = delays.create ?? 1500
    const editDelay   = delays.edit ?? 1500

    const error   = ref(null)
    const success = ref(null)

    const form     = ref(blankForm())
    const editForm = sharedForm ? form : ref(blankEditForm())

    const showCreate = ref(false)
    const showEdit   = ref(false)
    const showDelete = ref(false)

    const deleteTarget = ref(null)
    const deleteError  = ref(null)

    function openCreate() {
        form.value = blankForm()
        error.value = null
        success.value = null
        showCreate.value = true
    }

    function openEdit(item) {
        editForm.value = toEditForm(item)
        error.value = null
        success.value = null
        showEdit.value = true
    }

    async function create() {
        error.value = null
        success.value = null
        try {
            await createFn(form.value)
            success.value = messages.created
            await refetch()
            setTimeout(() => { showCreate.value = false }, createDelay)
        } catch (err) {
            error.value = err.message || messages.createError
        }
    }

    async function update() {
        error.value = null
        success.value = null
        try {
            await updateFn(editForm.value)
            success.value = messages.updated
            await refetch()
            setTimeout(() => { showEdit.value = false }, editDelay)
        } catch (err) {
            error.value = err.message || messages.updateError
        }
    }

    function openDelete(item) {
        deleteTarget.value = item
        deleteError.value = null
        showDelete.value = true
    }

    async function remove() {
        deleteError.value = null
        try {
            await removeFn(deleteTarget.value)
            showDelete.value = false
            deleteTarget.value = null
            await refetch()
        } catch (err) {
            if (showDeleteError) deleteError.value = err.message || messages.deleteError
            else console.error(err)
        }
    }

    return {
        form, editForm, error, success,
        showCreate, showEdit, showDelete,
        deleteTarget, deleteError,
        openCreate, openEdit, openDelete,
        create, update, remove,
    }
}
