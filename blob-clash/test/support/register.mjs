// Lets tests import the vendored three.js addons, whose bare `three` import is normally
// resolved by the importmap in index.html.
import { register } from 'node:module';

register('./three-resolver.mjs', import.meta.url);
