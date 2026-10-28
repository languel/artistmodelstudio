// Where the big files live (models, wasm). Normally next to the lessons, found by path.
// In the single-file export they are embedded in the HTML: the loader fills globalThis.__ASSETS with
// blob: URLs for them, and this function hands those out instead.
export function assetUrl(path) {
  return globalThis.__ASSETS?.[path] ?? new URL('../' + path, import.meta.url).href;
}
