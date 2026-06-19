import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Cinematic grade: warm tint, contrast, vignette, film grain, mild aberration.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 1.0 },
    grain: { value: 0.05 },
    warmth: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time;
    uniform float vignette; uniform float grain; uniform float warmth;
    void main(){
      vec2 uv = vUv;
      // subtle chromatic aberration toward edges
      vec2 d = uv - 0.5;
      float r2 = dot(d,d);
      float ab = 0.0018 * r2 * 6.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d*ab).b;
      // warm golden grade
      col *= mix(vec3(1.0), vec3(1.06,1.0,0.9), warmth);
      // contrast & lift
      col = (col - 0.5) * 1.09 + 0.5;
      col = pow(max(col,0.0), vec3(0.96));
      // vignette
      float v = smoothstep(0.85, 0.32, length(d));
      col *= mix(1.0 - vignette*0.55, 1.0, v);
      // film grain
      float g = fract(sin(dot(uv*(time*60.0+1.0), vec2(12.9898,78.233))) * 43758.5453);
      col += (g - 0.5) * grain;
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
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  // momentary punch (e.g. explosions) — pushed back to baseline each frame
  pulseBloom(amount) { this.bloom.strength = Math.min(1.6, this.bloom.strength + amount); }

  render(dt) {
    this._t += dt;
    this.grade.uniforms.time.value = this._t;
    this.bloom.strength += (0.55 - this.bloom.strength) * Math.min(1, dt * 4); // ease back
    this.composer.render();
  }
}
