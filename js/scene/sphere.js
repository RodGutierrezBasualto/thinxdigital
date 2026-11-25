// Dashboard ("vr") section: a sphere of 56 curved ad tiles + the white veil that hands the page back to white.
//
// The tiles are ONE InstancedMesh: a slightly curved plane (bent onto the sphere surface) instanced 56× on a
// Fibonacci sphere, each facing outward, each with its own cell of the ads atlas (8 × 7 tiles of 256 × 320) chosen by
// a per-instance attribute. `uPush` scales the instance positions outward in the vertex shader (the "dive": the viewer
// ends up inside the shell); from inside, back faces are shown with their UVs mirrored so the ads still read correctly.

import * as THREE from 'three';
import { WORLD } from './config.js';

const RADIUS = 10;

const vertexShader = /* glsl */ `
attribute vec2 aTile;
uniform float uPush;
varying vec2 vUv;
varying vec2 vTile;
varying float vFacing;
void main() {
  vUv = uv;
  vTile = aTile;
  vec4 local = instanceMatrix * vec4(position, 1.0);
  local.xyz += instanceMatrix[3].xyz * (uPush - 1.0); // push the whole tile outward along its radius
  vec4 mv = modelViewMatrix * local;
  vec3 n = normalize(normalMatrix * (mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0)));
  vFacing = dot(n, normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uGrid;       // atlas columns, rows
uniform vec2 uTileSize;   // tile width, height (world units) for the rounded corners
uniform float uInside;    // 0 = looking at the sphere from outside, 1 = from inside
varying vec2 vUv;
varying vec2 vTile;
varying float vFacing;

void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;

  // rounded-rectangle cut-out
  vec2 p = (uv - 0.5) * uTileSize;
  float r = 0.16;
  vec2 q = abs(p) - (uTileSize * 0.5 - r);
  if (length(max(q, 0.0)) > r) discard;

  vec2 cell = uv * 0.97 + 0.015; // stay clear of the neighbouring tiles' pixels in small mip levels
  vec2 auv = vec2((vTile.x + cell.x) / uGrid.x, (uGrid.y - vTile.y - 1.0 + cell.y) / uGrid.y);
  vec3 col = texture2D(uAtlas, auv).rgb;

  float facing = gl_FrontFacing ? vFacing : -vFacing;
  float shade = mix(0.22, 1.0, smoothstep(-0.05, 0.55, facing)); // tiles turning away fall into shadow
  if (!gl_FrontFacing) shade *= mix(0.3, 1.0, uInside);           // far side of the sphere seen through the gaps
  gl_FragColor = vec4(col * shade, 1.0);
  #include <colorspace_fragment>
}`;

export function createSphere(atlas, info) {
  const cols = info.cols || 8;
  const rows = info.rows || 7;
  const count = info.count || cols * rows;
  const tileW = 2.75;
  const tileH = tileW * ((info.tileHeight || 320) / (info.tileWidth || 256));

  // A tile bent onto the sphere surface, centred on z = 0 (the sphere point it is instanced at).
  const geometry = new THREE.PlaneGeometry(tileW, tileH, 6, 8);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), RADIUS).normalize().multiplyScalar(RADIUS);
    pos.setXYZ(i, v.x, v.y, v.z - RADIUS);
  }
  geometry.computeBoundingSphere();

  const tiles = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    tiles[i * 2] = i % cols;
    tiles[i * 2 + 1] = Math.floor(i / cols);
  }
  geometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas },
      uGrid: { value: new THREE.Vector2(cols, rows) },
      uTileSize: { value: new THREE.Vector2(tileW, tileH) },
      uPush: { value: 1 },
      uInside: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // instances move in the shader
  const golden = Math.PI * (3 - Math.sqrt(5));
  const m = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // Shuffle which ad goes where (a fixed permutation) so neighbouring atlas cells don't end up side by side.
  const order = Array.from({ length: count }, (_, i) => (i * 23) % count);
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    v.set(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(RADIUS);
    m.lookAt(v, origin, up); // +z of the tile points away from the centre
    m.setPosition(v);
    mesh.setMatrixAt(order[i], m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'ad-sphere';
  group.add(mesh);
  group.visible = false;

  // White veil: a camera-attached plane that fades the screen to white at the end of the section.
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
  );
  veil.position.z = -1;
  veil.renderOrder = 999;
  veil.frustumCulled = false;
  veil.visible = false;

  function layout(aspect) {
    const hh = Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2)) * 1.05;
    veil.scale.set(hh * aspect, hh, 1);
  }

  /**
   * @param {{visible:boolean, position:THREE.Vector3, scale:number, spin:number, tilt:number, push:number, inside:number}} st
   * @param {number} veilOpacity
   */
  function update(st, veilOpacity) {
    group.visible = st.visible && st.scale > 0.001;
    if (group.visible) {
      group.position.copy(st.position);
      group.scale.setScalar(st.scale);
      group.rotation.set(st.tilt, st.spin, 0.12);
      material.uniforms.uPush.value = st.push;
      material.uniforms.uInside.value = st.inside;
    }
    veil.visible = veilOpacity > 0.001;
    veil.material.opacity = veilOpacity;
  }

  return { group, veil, layout, update, radius: RADIUS };
}
