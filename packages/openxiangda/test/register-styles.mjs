import { createRequire, register } from 'node:module';

// Test-only CSS stubs. Browser acceptance loads the real packaged styles.
createRequire(import.meta.url).extensions['.css'] = module => { module.exports = {}; };
register('./style-loader.mjs', import.meta.url);
