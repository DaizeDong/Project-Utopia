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
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tVisibility: { value: this.texture },
        fogColor: { value: new THREE.Color(0x0b141c) },
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
        varying vec2 vUv;
        void main() {
          float visibility = texture2D(tVisibility, vUv).r * 255.0;
          if (visibility > 1.5) discard;
          float alpha = visibility > 0.5 ? 0.35 : 0.75;
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
    this.mesh.renderOrder = 3;
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
