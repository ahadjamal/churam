// Sky, sun/moon, fog, valley mist, monsoon rain and time of day.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { cloudTexture } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';

const TIMES = [
  { name: 'Misty morning', h: 7.0 },
  { name: 'Midday', h: 12.5 },
  { name: 'Golden evening', h: 17.6 },
  { name: 'Night', h: 21.0 },
];

const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export class Environment {
  constructor(scene, renderer, hf) {
    this.scene = scene;
    this.renderer = renderer;
    this.hf = hf;
    this.time = 7.0;
    this.rain = 0;
    this.rainTarget = 0;
    this.timeIndex = 0;

    this.sky = new Sky();
    this.sky.scale.setScalar(14000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4e6, 0x3a4a22, 1.0);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xb8c4c4, 0.0012);
    this.sunDir = new THREE.Vector3();

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);

    this.buildStars();
    this.buildMist();
    this.buildRain();
    this.setTime(this.time);
  }

  cycleTime() {
    this.timeIndex = (this.timeIndex + 1) % TIMES.length;
    this.setTime(TIMES[this.timeIndex].h);
    return TIMES[this.timeIndex].name;
  }

  get isNight() {
    return this.time < 6.1 || this.time > 18.6;
  }

  setTime(h) {
    this.time = h;
    // Kerala (11.5°N) in late October: sunrise ~6:15, sunset ~18:05, noon sun ~65° in the south.
    const dayT = (h - 6.15) / (18.1 - 6.15);
    const elev = Math.sin(Math.PI * dayT) * 65;
    const az = Math.PI * (1 - dayT); // east -> west
    const e = THREE.MathUtils.degToRad(elev);
    this.sunDir.set(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * 0.45 + 0.1).normalize();
    if (elev < -2) this.sunDir.set(-0.3, 0.6, 0.2).normalize(); // moon

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(elev < -2 ? -1 : 1);
    this.envSky.material.uniforms.sunPosition.value.copy(u.sunPosition.value);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'])
      this.envSky.material.uniforms[k].value = u[k].value;

    const night = THREE.MathUtils.clamp((-elev + 2) / 8, 0, 1);
    const golden = THREE.MathUtils.clamp(1 - Math.abs(elev - 8) / 14, 0, 1) * (1 - night);
    const sunCol = lerpC(0xfff3e0, 0xffb066, golden);
    this.sun.color.copy(night > 0.5 ? new THREE.Color(0x8fa6d8) : sunCol);
    this.sun.intensity = night > 0.5 ? 0.45 : THREE.MathUtils.lerp(0.6, 3.2, THREE.MathUtils.clamp(elev / 35, 0, 1));
    this.hemi.intensity = THREE.MathUtils.lerp(1.1, 0.32, night);
    this.hemi.color.copy(night > 0.5 ? new THREE.Color(0x40507a) : lerpC(0xc6d8ea, 0xf0c8a0, golden));
    this.hemi.groundColor.copy(lerpC(0x3d4a24, 0x101410, night));

    this.fogBase = night > 0.5 ? new THREE.Color(0x0c1220) : h < 9 ? new THREE.Color(0xc2cbca) : lerpC(0xb6c6d0, 0xd8b896, golden);
    this.fogDensity = night > 0.5 ? 0.0011 : h < 9 ? 0.0019 : 0.00085 + golden * 0.0002;
    this.mistOpacity = h < 9.5 ? 0.85 : night > 0.5 ? 0.12 : 0.4;
    this.starsMat.opacity = night;
    this.sky.visible = night < 0.98;
    this.renderer.toneMappingExposure = night > 0.5 ? 0.55 : 0.52;
    this.night = night;

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = night > 0.5 ? 0.08 : 0.6;
    this.applyFog();
  }

  applyFog() {
    const rainMix = this.rain;
    const c = this.fogBase.clone().lerp(new THREE.Color(this.night > 0.5 ? 0x0a0e14 : 0x8e989c), rainMix * 0.8);
    this.scene.fog.color.copy(c);
    this.scene.fog.density = this.fogDensity + rainMix * 0.0028;
    this.scene.background = this.night > 0.98 ? c : null;
    this.mistMat.uniforms.uColor.value.copy(c).lerp(new THREE.Color(0xffffff), this.night > 0.5 ? 0 : 0.35);
  }

  buildStars() {
    const rnd = mulberry32(11);
    const pos = [];
    for (let i = 0; i < 2500; i++) {
      const a = rnd() * Math.PI * 2, y = rnd() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 9000, y * 9000, Math.sin(a) * r * 9000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starsMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /** Cloud banks sitting in the valleys below the ghat and low mist over the plateau. */
  buildMist() {
    const hf = this.hf;
    const rnd = mulberry32(1234);
    const items = [];
    for (let tries = 0; tries < 20000 && items.length < 260; tries++) {
      const x = hf.minX + rnd() * (hf.maxX - hf.minX);
      const z = hf.minZ + rnd() * (hf.maxZ - hf.minZ);
      const h = hf.base(x, z);
      if (h < 500 && z > -2000) {
        // valley cloud layer around 420-640 m, seen from Lakkidi
        items.push([x, 430 + rnd() * 210, z, 120 + rnd() * 160]);
      } else if (h > 690 && h < 900 && hf.slope(x, z) < 0.06 && rnd() < 0.25) {
        items.push([x, h + 6 + rnd() * 18, z, 50 + rnd() * 60]);
      }
    }
    const geo = new THREE.PlaneGeometry(1, 0.55);
    this.mistMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: cloudTexture() }, uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 0.8 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv; varying float vFade;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float s = length(instanceMatrix[0].xyz);
          c.x += sin(uTime * 0.02 + c.z * 0.01) * 20.0;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 wp = c + right * position.x * s + up * position.y * s;
          float d = distance(wp, cameraPosition);
          vFade = smoothstep(30.0, 160.0, d) * (1.0 - smoothstep(4500.0, 7000.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
        varying vec2 vUv; varying float vFade;
        void main() {
          float a = texture2D(uTex, vUv).a * uOpacity * vFade;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mist = new THREE.InstancedMesh(geo, this.mistMat, items.length);
    const m = new THREE.Matrix4();
    items.forEach(([x, y, z, s], i) => {
      m.makeScale(s, s, s).setPosition(x, y, z);
      this.mist.setMatrixAt(i, m);
    });
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 5;
    this.scene.add(this.mist);
  }

  buildRain() {
    const N = 9000, pos = new Float32Array(N * 6), seed = new Float32Array(N * 2 * 4);
    const rnd = mulberry32(77);
    for (let i = 0; i < N; i++) {
      const x = rnd() * 70, y = rnd() * 40, z = rnd() * 70;
      pos.set([x, y, z, x, y, z], i * 6);
      const r = rnd();
      seed.set([0, r, 0, 0, 1, r, 0, 0], i * 8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xaab4bc) } },
      vertexShader: `
        attribute vec4 seed; uniform float uTime; uniform vec3 uOrigin; uniform float uAmount;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 22.0, 40.0);
          p.x = mod(p.x - uOrigin.x + uTime * 2.0, 70.0);
          p.z = mod(p.z - uOrigin.z, 70.0);
          vec3 w = uOrigin + p - vec3(35.0, 20.0, 35.0);
          w.y -= seed.x * 0.7; w.x -= seed.x * 0.06;
          vA = step(seed.y, uAmount) * 0.35;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
      transparent: true,
      depthWrite: false,
    });
    this.rainMesh = new THREE.LineSegments(g, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  toggleRain() {
    this.rainTarget = this.rainTarget > 0 ? 0 : 1;
    return this.rainTarget > 0;
  }

  update(dt, camera, focus) {
    // shadow camera follows the truck
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    const t = performance.now() / 1000;
    this.mistMat.uniforms.uTime.value = t;
    this.mistMat.uniforms.uOpacity.value = this.mistOpacity * (1 - this.rain * 0.3);
    const prev = this.rain;
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.25);
    if (Math.abs(this.rain - prev) > 1e-4) this.applyFog();
    this.rainMesh.visible = this.rain > 0.02;
    this.rainMat.uniforms.uTime.value = t;
    this.rainMat.uniforms.uAmount.value = this.rain;
    this.rainMat.uniforms.uOrigin.value.copy(camera.position);
  }
}
