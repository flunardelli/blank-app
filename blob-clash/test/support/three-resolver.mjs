const THREE = new URL('../../vendor/three/three.module.min.js', import.meta.url).href;
const ADDONS = new URL('../../vendor/three/addons/', import.meta.url).href;

export function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: THREE, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: ADDONS + specifier.slice('three/addons/'.length), shortCircuit: true };
  return next(specifier, context);
}
