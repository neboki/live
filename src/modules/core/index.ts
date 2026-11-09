// Public API of the core module: the app root component and the bootstrap that installs
// its plugins and error handlers. Only `src/main.ts` imports it.

export { default as App } from './components/App/App.vue';
export { bootstrap } from './bootstrap/bootstrap';
