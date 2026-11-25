// Post-processing: render → subtle RGB shift → output (linear → sRGB).
// Only used on the "high" quality preset; mobile renders straight to the canvas (cheaper, and the shift is barely
// visible on small screens anyway).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

export const RGB_BASE = 0.0011;

export function createPost(renderer, scene, camera, { msaa }) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(msaa, renderer.capabilities.maxSamples || 0),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const rgb = new ShaderPass(RGBShiftShader);
  rgb.uniforms.angle.value = 2.1;
  rgb.uniforms.amount.value = RGB_BASE;
  composer.addPass(rgb);
  composer.addPass(new OutputPass());

  return {
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    },
    setAmount(a) {
      rgb.uniforms.amount.value = a;
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
