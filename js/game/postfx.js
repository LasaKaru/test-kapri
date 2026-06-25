import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Cinematic grade. A single `amount` (0..1) lerps the whole effect from the
// raw "natural" image (0) to the full cinematic look (1): warm tint, contrast,
// vignette, film grain and edge chromatic aberration all scale together.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 1.0 },
    kc: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform float kc;
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d,d);
      // chromatic aberration (scaled by amount)
      float ab = 0.0018 * r2 * 6.0 * amount;
      vec3 raw = texture2D(tDiffuse, uv).rgb;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*ab).r;
      col.g = raw.g;
      col.b = texture2D(tDiffuse, uv - d*ab).b;
      // warm grade + contrast + lift
      col *= mix(vec3(1.0), vec3(1.06,1.0,0.9), amount);
      col = (col - 0.5) * (1.0 + 0.09*amount) + 0.5;
      col = pow(max(col,0.0), vec3(mix(1.0, 0.96, amount)));
      // vignette
      float v = smoothstep(0.85, 0.32, length(d));
      col *= mix(1.0, mix(1.0 - 0.55, 1.0, v), amount);
      // film grain
      float g = fract(sin(dot(uv*(time*60.0+1.0), vec2(12.9898,78.233))) * 43758.5453);
      col += (g - 0.5) * 0.05 * amount;
      // blend back toward the raw image by (1-amount) for a clean natural look
      col = mix(raw, col, 1.0);
      // kill-cam: cold desaturated slow-mo with a heavy edge darken
      if (kc > 0.001) {
        float lum = dot(col, vec3(0.299,0.587,0.114));
        vec3 kcCol = mix(col, vec3(lum)*vec3(0.86,0.94,1.12), 0.72);
        kcCol *= mix(1.0, 0.62, smoothstep(0.18,0.72,length(d)));
        col = mix(col, kcCol, kc);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(size.clone(), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.composer.addPass(new OutputPass());
    this._t = 0;
    this.realism = 1;      // 0..1 master
    this._baseBloom = 0.55;
    this.setRealism(1);
  }

  // 0 = flat natural low-poly look, 1 = full cinematic
  setRealism(amount) {
    this.realism = Math.max(0, Math.min(1, amount));
    this.grade.uniforms.amount.value = this.realism;
    this._baseBloom = 0.12 + this.realism * 0.55; // some bloom even when low, off near 0
    if (this.realism <= 0.02) this._baseBloom = 0;
    this.bloom.enabled = this.realism > 0.02;
    // soften tone mapping toward neutral when natural
    this.renderer.toneMappingExposure = 1.12 + this.realism * 0.04;   // brighter, airier base
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
  // keep the composer's internal render targets in sync with the renderer DPR
  setPixelRatio(r) { if (this.composer.setPixelRatio) this.composer.setPixelRatio(r); }

  setKillcam(v) { this.grade.uniforms.kc.value = Math.max(0, Math.min(1, v)); }

  pulseBloom(amount) {
    if (this.bloom.enabled) this.bloom.strength = Math.min(1.8, this.bloom.strength + amount * (0.4 + this.realism));
  }

  render(dt) {
    this._t += dt;
    this.grade.uniforms.time.value = this._t;
    this.bloom.strength += (this._baseBloom - this.bloom.strength) * Math.min(1, dt * 4);
    this.composer.render();
  }
}
