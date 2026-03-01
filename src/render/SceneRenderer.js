import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TILE_INFO, ENTITY_TYPE, ANIMAL_KIND } from "../config/constants.js";
import { tileToWorld, worldToTile, inBounds } from "../world/grid/Grid.js";

function matrixAtPos(x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(sx, sy, sz);
  const p = new THREE.Vector3(x, y, z);
  m.compose(p, q, s);
  return m;
}

export class SceneRenderer {
  constructor(canvas, state, buildSystem, onSelectEntity) {
    this.canvas = canvas;
    this.state = state;
    this.buildSystem = buildSystem;
    this.onSelectEntity = onSelectEntity;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1017);

    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(0, 44, 46);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 170;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.78);
    sun.position.set(26, 58, 18);
    this.scene.add(sun);

    this.lastGridVersion = -1;
    this.#setupTileMesh();
    this.#setupEntityMeshes();
    this.#setupDebugPath();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);

    const gridHelper = new THREE.GridHelper(state.grid.width * state.grid.tileSize, state.grid.width, 0xffffff, 0xffffff);
    gridHelper.position.y = 0.001;
    gridHelper.material.opacity = 0.09;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    this.canvas.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
  }

  #setupTileMesh() {
    const count = this.state.grid.width * this.state.grid.height;
    this.tileMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(this.state.grid.tileSize, 1, this.state.grid.tileSize),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      count,
    );
    this.tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.scene.add(this.tileMesh);
  }

  #setupEntityMeshes() {
    const sphere = new THREE.SphereGeometry(0.34, 14, 14);
    const maxWorkers = 900;
    const maxVisitors = 120;
    const maxHerbivores = 200;
    const maxPredators = 80;

    this.workerMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.7 }), maxWorkers);
    this.visitorMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xf2b56e, roughness: 0.74 }), maxVisitors);
    this.herbivoreMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0x8fd18f, roughness: 0.78 }), maxHerbivores);
    this.predatorMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xd67878, roughness: 0.78 }), maxPredators);

    this.scene.add(this.workerMesh, this.visitorMesh, this.herbivoreMesh, this.predatorMesh);
  }

  #setupDebugPath() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x6cc3ff, transparent: true, opacity: 0.9 });
    this.pathLine = new THREE.Line(geom, mat);
    this.scene.add(this.pathLine);
  }

  #updatePathLine() {
    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      this.pathLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      return;
    }

    const selected = [...this.state.agents, ...this.state.animals].find((e) => e.id === selectedId);
    if (!selected?.path || selected.pathIndex >= selected.path.length) {
      this.pathLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      return;
    }

    const verts = [];
    for (let i = selected.pathIndex; i < selected.path.length; i += 1) {
      const node = selected.path[i];
      const p = tileToWorld(node.ix, node.iz, this.state.grid);
      verts.push(p.x, 0.16, p.z);
    }

    this.pathLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    this.pathLine.geometry.computeBoundingSphere();
  }

  #rebuildTilesIfNeeded() {
    if (this.lastGridVersion === this.state.grid.version) return;
    this.lastGridVersion = this.state.grid.version;

    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const idx = ix + iz * this.state.grid.width;
        const tile = this.state.grid.tiles[idx];
        const info = TILE_INFO[tile];
        const p = tileToWorld(ix, iz, this.state.grid);
        const m = matrixAtPos(p.x, info.height / 2, p.z, 1, info.height, 1);

        this.tileMesh.setMatrixAt(idx, m);
        this.tileMesh.setColorAt(idx, new THREE.Color(info.color));
      }
    }

    this.tileMesh.instanceMatrix.needsUpdate = true;
    this.tileMesh.instanceColor.needsUpdate = true;
  }

  #updateEntityMeshes() {
    const workers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER);
    const visitors = this.state.agents.filter((a) => a.type === ENTITY_TYPE.VISITOR);
    const herbivores = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE);
    const predators = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR);

    let i = 0;
    for (const e of workers) {
      this.workerMesh.setMatrixAt(i, matrixAtPos(e.x, 0.45, e.z));
      i += 1;
    }
    this.workerMesh.count = Math.max(1, workers.length);
    this.workerMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    for (const e of visitors) {
      this.visitorMesh.setMatrixAt(i, matrixAtPos(e.x, 0.45, e.z));
      i += 1;
    }
    this.visitorMesh.count = Math.max(1, visitors.length);
    this.visitorMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    for (const e of herbivores) {
      this.herbivoreMesh.setMatrixAt(i, matrixAtPos(e.x, 0.45, e.z));
      i += 1;
    }
    this.herbivoreMesh.count = Math.max(1, herbivores.length);
    this.herbivoreMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    for (const e of predators) {
      this.predatorMesh.setMatrixAt(i, matrixAtPos(e.x, 0.45, e.z));
      i += 1;
    }
    this.predatorMesh.count = Math.max(1, predators.length);
    this.predatorMesh.instanceMatrix.needsUpdate = true;

    this.renderEntityLookup = {
      workers,
      visitors,
      herbivores,
      predators,
    };
  }

  #pickEntity(mouse) {
    this.raycaster.setFromCamera(mouse, this.camera);
    const workerHit = this.raycaster.intersectObject(this.workerMesh, true)[0];
    const visitorHit = this.raycaster.intersectObject(this.visitorMesh, true)[0];
    const herbivoreHit = this.raycaster.intersectObject(this.herbivoreMesh, true)[0];
    const predatorHit = this.raycaster.intersectObject(this.predatorMesh, true)[0];

    const hits = [workerHit, visitorHit, herbivoreHit, predatorHit].filter(Boolean);
    if (hits.length === 0) return null;

    hits.sort((a, b) => a.distance - b.distance);
    const hit = hits[0];

    if (hit.object === this.workerMesh) return this.renderEntityLookup.workers[hit.instanceId] ?? null;
    if (hit.object === this.visitorMesh) return this.renderEntityLookup.visitors[hit.instanceId] ?? null;
    if (hit.object === this.herbivoreMesh) return this.renderEntityLookup.herbivores[hit.instanceId] ?? null;
    if (hit.object === this.predatorMesh) return this.renderEntityLookup.predators[hit.instanceId] ?? null;

    return null;
  }

  #onPointerDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    const selected = this.#pickEntity(this.mouse);
    if (selected) {
      this.state.controls.selectedEntityId = selected.id;
      this.onSelectEntity?.(selected.id);
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const planeHit = this.raycaster.intersectObject(this.pickPlane, true)[0];
    if (!planeHit) return;

    const tile = worldToTile(planeHit.point.x, planeHit.point.z, this.state.grid);
    if (!inBounds(tile.ix, tile.iz, this.state.grid)) return;

    this.buildSystem.placeToolAt(this.state, this.state.controls.tool, tile.ix, tile.iz);
  }

  render(dt) {
    this.controls.update();

    this.#rebuildTilesIfNeeded();
    this.#updateEntityMeshes();
    this.#updatePathLine();

    if (
      this.renderer.domElement.width !== this.canvas.clientWidth ||
      this.renderer.domElement.height !== this.canvas.clientHeight
    ) {
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
      this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.camera.updateProjectionMatrix();
    }

    const alpha = Math.min(1, Math.max(0, dt * 1.6));
    this.scene.fog = new THREE.Fog(0x0b1017, 40 - 8 * alpha, 120 - 14 * alpha);

    this.renderer.render(this.scene, this.camera);
  }
}
