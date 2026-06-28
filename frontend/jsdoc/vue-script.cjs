/**
 * JSDoc plugin - deja que JSDoc procese componentes Vue (SFC `.vue`).
 *
 * El parser de JSDoc sólo entiende JavaScript, así que antes de analizar un
 * `.vue` reemplazamos su código por la concatenación de los bloques `<script>`
 * (incluido `<script setup>`). Se descartan `<template>` y `<style>`, que
 * romperían el parser. El comentario JSDoc de cabecera de ese bloque -con su
 * etiqueta `@module components/…`- es lo que se documenta en el sitio HTML.
 *
 * Se mantiene en `.cjs` porque el paquete `frontend` es `"type": "module"` y
 * JSDoc carga los plugins con `require()`.
 */
exports.handlers = {
  beforeParse(e) {
    if (!e.filename.endsWith('.vue')) return
    const scripts = [...e.source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    e.source = scripts.map((m) => m[1]).join('\n')
  },
}
