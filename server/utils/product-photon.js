// Nitro's unwasm plugin needs ?module to preserve a raw WebAssembly.Module.
// The standard workerd entry imports plain .wasm, which Nitro otherwise turns
// into an instantiated exports wrapper before wasm-bindgen supplies its imports.
import { initPhoton, PhotonImage, SamplingFilter, resize } from '@cf-wasm/photon/others'
import photonModule from '@cf-wasm/photon/photon.wasm?module'

initPhoton.sync({ module: photonModule })
export { PhotonImage, SamplingFilter, resize }
