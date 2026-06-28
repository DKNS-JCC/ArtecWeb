// Configuración de vue-docgen-cli - genera documentación (Markdown) de los
// componentes Vue a partir de sus comentarios JSDoc, props, eventos y slots.
// Usa extensión .cjs porque el paquete frontend es "type": "module".
// Ejecutar con:  npm run docs:components   (desde la carpeta frontend)
// Salida:        docs/api-docs/components/
module.exports = {
  componentsRoot: 'src',
  components: '**/*.vue',
  outDir: '../docs/api-docs/components',
  getDocFileName: (componentPath) => componentPath.replace(/\.vue$/, ''),
};
