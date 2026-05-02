import * as THREE from "three";

export class FogOverlay {
  constructor(grid) {
    this.grid = grid;
    this.mesh = null;
    this.material = null;
    this.texture = null;
    this.scene = null;
    this.visibilityData = null;
    this.lastFogVersion = -1;
    this.lastVisibilityLength = 0;
  }

  attach(scene) {
    if (!scene || !this.grid || this.mesh) return;
    this.scene = scene;
    const width = Math.max(1, Number(this.grid.width) || 1);
    const height = Math.max(1, Number(this.grid.height) || 1);
    const tileSize = Math.max(0.01, Number(this.grid.tileSize) || 1);
    this.visibilityData = new Uint8Array(width * height);
    this.texture = new THREE.DataTexture(
      this.visibilityData,
      width,
      height,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.needsUpdate = true;
    // LinearFilter enables GPU bilinear interpolation between fog texels, smoothing
    // hard pixelated tile-border transitions. The DataTexture stores enum values
    // (0=HIDDEN, 1=EXPLORED, 2=VISIBLE) which are safely interpolated for display
    // purposes only — game logic still reads the raw Uint8Array.
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.flipY = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tVisibility: { value: this.texture },
        fogColor: { value: new THREE.Color(0x0b141c) },
        // edgeSoftness drives a smoothstep blend between explored (0.35 alpha) and
        // hidden (0.88 alpha) zones. 0.15 gives a ~1-tile soft border without
        // washing out unexplored territory.
        // v0.10.1-r4-A3 (F1) — hidden alpha bumped 0.75 → 0.88 (~17%) so
        // unexplored terrain reads as "definitely darker" rather than the
        // previous "barely tinted" state. A3 reviewer (00:00-03:00 timeline)
        // could not visually locate the fog boundary, leading to repeated
        // "Cannot build on unexplored terrain" toasts on what looked like
        // visible ground. Explored alpha (0.35) preserved so the soft-edge
        // memory zone still reads.
        edgeSoftness: { value: 0.15 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tVisibility;
        uniform vec3 fogColor;
        uniform float edgeSoftness;
        varying vec2 vUv;
        void main() {
          // LinearFilter returns interpolated values, so visibility is now a
          // continuous float in [0, 255] rather than a hard enum integer.
          float visibility = texture2D(tVisibility, vUv).r * 255.0;
          // VISIBLE zone (raw value ~2): fully transparent — discard fragment.
          // Use 1.5 threshold so interpolated edge pixels between VISIBLE and
          // EXPLORED still render rather than popping to invisible.
          if (visibility > 1.5) discard;
          // Smooth transition: at visibility=0 (HIDDEN) alpha=0.88,
          // at visibility=1 (EXPLORED boundary) alpha=0.35.
          // smoothstep gives a gentle S-curve around the EXPLORED/HIDDEN edge.
          float t = smoothstep(0.5 - edgeSoftness, 0.5 + edgeSoftness, visibility);
          float alpha = mix(0.88, 0.35, t);
          gl_FragColor = vec4(fogColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(width * tileSize, height * tileSize);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.045;
    // renderOrder must exceed the highest entity renderOrder (SELECTION_RING=38) so
    // the fog occludes 3D entities in HIDDEN zones. depthTest:false + renderOrder=42
    // ensures the fog quad composites on top of all scene geometry without a depth fight.
    this.mesh.renderOrder = 42;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(state) {
    const fog = state?.fog;
    const visibility = fog?.visibility;
    if (!this.texture || !this.visibilityData || !(visibility instanceof Uint8Array)) return;
    const version = Number(fog.version ?? 0);
    if (version === this.lastFogVersion && visibility.length === this.lastVisibilityLength) return;

    const copyLength = Math.min(this.visibilityData.length, visibility.length);
    this.visibilityData.fill(0);
    this.visibilityData.set(visibility.subarray(0, copyLength));
    this.texture.needsUpdate = true;
    this.lastFogVersion = version;
    this.lastVisibilityLength = visibility.length;
  }

  dispose() {
    if (this.scene && this.mesh) {
      this.scene.remove(this.mesh);
    }
    this.mesh?.geometry?.dispose?.();
    this.material?.dispose?.();
    this.texture?.dispose?.();
    this.mesh = null;
    this.material = null;
    this.texture = null;
    this.visibilityData = null;
    this.scene = null;
  }
}
