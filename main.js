import * as THREE from 'three';
// Use the locally installed three (same version as the core import) so Vite can bundle it and we avoid CDN/CORS/version drift issues.
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* -----------------------------
   Constants & Helpers
------------------------------ */
const TILE = {
  GRASS: 0,
  ROAD: 1,
  FARM: 2,
  LUMBER: 3,
  WAREHOUSE: 4,
  WALL: 5,
  RUINS: 6,
};

const TILE_INFO = {
  [TILE.GRASS]:    { passable: true,  cost: 1,  h: 0.05, col: new THREE.Color(0.10,0.18,0.12) },
  [TILE.ROAD]:     { passable: true,  cost: 1,  h: 0.02, col: new THREE.Color(0.20,0.20,0.22) },
  [TILE.FARM]:     { passable: true,  cost: 1,  h: 0.12, col: new THREE.Color(0.22,0.28,0.10) },
  [TILE.LUMBER]:   { passable: true,  cost: 1,  h: 0.12, col: new THREE.Color(0.16,0.24,0.16) },
  [TILE.WAREHOUSE]:{ passable: true,  cost: 1,  h: 0.20, col: new THREE.Color(0.22,0.16,0.12) },
  [TILE.WALL]:     { passable: false, cost: 1,  h: 0.55, col: new THREE.Color(0.18,0.18,0.18) },
  [TILE.RUINS]:    { passable: true,  cost: 2,  h: 0.08, col: new THREE.Color(0.18,0.12,0.10) },
};

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;

function tileToWorld(ix, iz, gridW, gridH, tileSize=1){
  const x = (ix - gridW/2 + 0.5) * tileSize;
  const z = (iz - gridH/2 + 0.5) * tileSize;
  return new THREE.Vector3(x, 0, z);
}
function worldToTile(pos, gridW, gridH, tileSize=1){
  const ix = Math.floor(pos.x / tileSize + gridW/2);
  const iz = Math.floor(pos.z / tileSize + gridH/2);
  return { ix, iz };
}
function inBounds(ix, iz, gridW, gridH){
  return ix>=0 && iz>=0 && ix<gridW && iz<gridH;
}

/* -----------------------------
   A* Pathfinding on Grid (4-neighbor)
------------------------------ */
function aStar(grid, gridW, gridH, start, goal){
  // start/goal: {ix, iz}
  const sKey = start.ix + start.iz*gridW;
  const gKey = goal.ix + goal.iz*gridW;
  if(sKey === gKey) return [start];

  const open = new MinHeap();
  const cameFrom = new Int32Array(gridW*gridH).fill(-1);
  const gScore = new Float32Array(gridW*gridH);
  gScore.fill(Infinity);

  gScore[sKey] = 0;
  open.push(sKey, heuristic(start, goal));

  const dirs = [
    {dx:1,dz:0},{dx:-1,dz:0},{dx:0,dz:1},{dx:0,dz:-1},
  ];

  while(!open.isEmpty()){
    const current = open.pop();
    if(current === gKey){
      return reconstructPath(cameFrom, current, gridW);
    }
    const cx = current % gridW;
    const cz = Math.floor(current / gridW);

    for(const d of dirs){
      const nx = cx + d.dx;
      const nz = cz + d.dz;
      if(!inBounds(nx,nz,gridW,gridH)) continue;

      const nKey = nx + nz*gridW;
      const t = grid[nKey];
      if(!TILE_INFO[t].passable) continue;

      const stepCost = TILE_INFO[t].cost;
      const tentative = gScore[current] + stepCost;
      if(tentative < gScore[nKey]){
        cameFrom[nKey] = current;
        gScore[nKey] = tentative;
        const f = tentative + heuristic({ix:nx, iz:nz}, goal);
        open.push(nKey, f);
      }
    }
  }
  return null; // no path
}
function heuristic(a,b){
  // Manhattan distance
  return Math.abs(a.ix-b.ix) + Math.abs(a.iz-b.iz);
}
function reconstructPath(cameFrom, currentKey, gridW){
  const out = [];
  let cur = currentKey;
  while(cur !== -1){
    const ix = cur % gridW;
    const iz = Math.floor(cur / gridW);
    out.push({ix, iz});
    cur = cameFrom[cur];
  }
  out.reverse();
  return out;
}

// Tiny heap for A*
class MinHeap {
  constructor(){ this.items = []; } // {key, pri}
  isEmpty(){ return this.items.length===0; }
  push(key, pri){
    const it = {key, pri};
    this.items.push(it);
    this.bubbleUp(this.items.length-1);
  }
  pop(){
    const root = this.items[0];
    const last = this.items.pop();
    if(this.items.length>0){
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return root.key;
  }
  bubbleUp(i){
    while(i>0){
      const p = (i-1)>>1;
      if(this.items[p].pri <= this.items[i].pri) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  bubbleDown(i){
    const n = this.items.length;
    while(true){
      let l = i*2+1, r=i*2+2, m=i;
      if(l<n && this.items[l].pri < this.items[m].pri) m=l;
      if(r<n && this.items[r].pri < this.items[m].pri) m=r;
      if(m===i) break;
      [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
      i = m;
    }
  }
}

/* -----------------------------
   Minimal “BT-like” Agent Logic
   (Priority-based, easy to replace with full BT nodes later)
------------------------------ */
const ROLE = { FARM:"FARM", WOOD:"WOOD" };

class Agent {
  constructor(type, pos){
    this.type = type; // "WORKER" | "NEUTRAL"
    this.pos = pos.clone();
    this.vel = new THREE.Vector3((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5);
    this.path = null;         // array of tiles
    this.pathIndex = 0;
    this.targetTile = null;

    this.bb = {
      role: ROLE.FARM,
      hunger: 1.0,
      carry: { food:0, wood:0 },
      stateLabel: "Idle",
      cooldown: 0,
      sabotageCooldown: 5 + Math.random()*8,
    };
  }
}

/* -----------------------------
   Three.js Setup
------------------------------ */
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  canvas.clientWidth/canvas.clientHeight,
  0.1,
  500
);
camera.position.set(0, 42, 42);
camera.lookAt(0,0,0);

const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 18;
controls.maxDistance = 140;
controls.target.set(0,0,0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.75);
dir.position.set(30, 60, 20);
scene.add(dir);

/* -----------------------------
   World Grid
------------------------------ */
const gridW = 36, gridH = 28, tileSize = 1;
const grid = new Uint8Array(gridW*gridH);
grid.fill(TILE.GRASS);

// some initial roads (purely to make it look alive fast)
for(let x=4;x<gridW-4;x++){
  grid[x + Math.floor(gridH/2)*gridW] = TILE.ROAD;
}
for(let z=3;z<gridH-3;z++){
  grid[Math.floor(gridW/2) + z*gridW] = TILE.ROAD;
}

// Resources (start with enough wood to build)
let resources = { food: 40, wood: 50 };

// Instanced tiles
const tileGeom = new THREE.BoxGeometry(tileSize, 1, tileSize);
const tileMat = new THREE.MeshLambertMaterial({ vertexColors:true });
const tileMesh = new THREE.InstancedMesh(tileGeom, tileMat, gridW*gridH);
tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(gridW*gridH*3), 3);

scene.add(tileMesh);

function updateTileInstance(ix, iz){
  const idx = ix + iz*gridW;
  const t = grid[idx];
  const info = TILE_INFO[t];
  const p = tileToWorld(ix, iz, gridW, gridH, tileSize);

  // set height by scaling Y
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3(1, info.h, 1);
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3(p.x, info.h/2, p.z);
  m.compose(v, q, s);
  tileMesh.setMatrixAt(idx, m);
  tileMesh.setColorAt(idx, info.col);
}

function rebuildAllTiles(){
  for(let iz=0; iz<gridH; iz++){
    for(let ix=0; ix<gridW; ix++){
      updateTileInstance(ix, iz);
    }
  }
  tileMesh.instanceMatrix.needsUpdate = true;
  tileMesh.instanceColor.needsUpdate = true;
}
rebuildAllTiles();

const gridHelper = new THREE.GridHelper(gridW*tileSize, gridW, 0xffffff, 0xffffff);
gridHelper.position.y = 0.001;
gridHelper.material.opacity = 0.12;
gridHelper.material.transparent = true;
scene.add(gridHelper);

/* -----------------------------
   Agents (Instanced Spheres)
------------------------------ */
const workersN = 70;
const neutralN = 36;

const agents = [];

function randomPassableTile(){
  for(let tries=0; tries<2000; tries++){
    const ix = Math.floor(Math.random()*gridW);
    const iz = Math.floor(Math.random()*gridH);
    const t = grid[ix+iz*gridW];
    if(TILE_INFO[t].passable && t !== TILE.WALL){
      return {ix, iz};
    }
  }
  return {ix:Math.floor(gridW/2), iz:Math.floor(gridH/2)};
}

function spawnAgents(){
  for(let i=0;i<workersN;i++){
    const tile = randomPassableTile();
    const p = tileToWorld(tile.ix, tile.iz, gridW, gridH, tileSize);
    p.y = 0.45;
    agents.push(new Agent("WORKER", p));
  }
  for(let i=0;i<neutralN;i++){
    const tile = randomPassableTile();
    const p = tileToWorld(tile.ix, tile.iz, gridW, gridH, tileSize);
    p.y = 0.45;
    agents.push(new Agent("NEUTRAL", p));
  }
}
spawnAgents();

const sphereGeom = new THREE.SphereGeometry(0.34, 14, 14);
const workerMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness:0.7, metalness:0.0 });
const neutralMat= new THREE.MeshStandardMaterial({ color: 0xffd18a, roughness:0.75, metalness:0.0 });

const workerMesh = new THREE.InstancedMesh(sphereGeom, workerMat, workersN);
const neutralMesh= new THREE.InstancedMesh(sphereGeom, neutralMat, neutralN);
scene.add(workerMesh, neutralMesh);

/* -----------------------------
   UI Wiring
------------------------------ */
const farmRatio = document.getElementById("farmRatio");
const farmRatioLabel = document.getElementById("farmRatioLabel");

const foodVal = document.getElementById("foodVal");
const woodVal = document.getElementById("woodVal");
const foodBar = document.getElementById("foodBar");
const woodBar = document.getElementById("woodBar");

const workersVal = document.getElementById("workersVal");
const neutralVal = document.getElementById("neutralVal");
const farmersVal = document.getElementById("farmersVal");
const loggersVal = document.getElementById("loggersVal");

const inspect = document.getElementById("inspect");

let tool = "road";
document.querySelectorAll("button[data-tool]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll("button[data-tool]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    tool = btn.dataset.tool;
  });
});

farmRatio.addEventListener("input", ()=>{
  farmRatioLabel.textContent = `${farmRatio.value}%`;
});

function renderHUD(){
  foodVal.textContent = Math.floor(resources.food);
  woodVal.textContent = Math.floor(resources.wood);
  foodBar.style.width = `${clamp(resources.food/120, 0, 1)*100}%`;
  woodBar.style.width = `${clamp(resources.wood/120, 0, 1)*100}%`;

  workersVal.textContent = workersN;
  neutralVal.textContent = neutralN;

  let farmCount=0, woodCount=0;
  for(const a of agents){
    if(a.type!=="WORKER") continue;
    if(a.bb.role===ROLE.FARM) farmCount++;
    else woodCount++;
  }
  farmersVal.textContent = farmCount;
  loggersVal.textContent = woodCount;
}

/* -----------------------------
   Building Costs + Placement
------------------------------ */
function costForTool(t){
  switch(t){
    case "road": return { wood:1 };
    case "farm": return { wood:5 };
    case "lumber": return { wood:5 };
    case "warehouse": return { wood:10 };
    case "wall": return { wood:2 };
    default: return { wood:0 };
  }
}
function tileTypeForTool(t){
  switch(t){
    case "road": return TILE.ROAD;
    case "farm": return TILE.FARM;
    case "lumber": return TILE.LUMBER;
    case "warehouse": return TILE.WAREHOUSE;
    case "wall": return TILE.WALL;
    case "erase": return TILE.GRASS;
    default: return TILE.GRASS;
  }
}
function canAfford(cost){
  return (resources.wood >= (cost.wood||0)) && (resources.food >= (cost.food||0));
}
function pay(cost){
  resources.wood -= (cost.wood||0);
  resources.food -= (cost.food||0);
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedAgent = null;

// invisible plane for picking
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(200,200),
  new THREE.MeshBasicMaterial({ visible:false })
);
pickPlane.rotation.x = -Math.PI/2;
scene.add(pickPlane);

canvas.addEventListener("pointerdown", (e)=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX-rect.left)/rect.width)*2 - 1;
  mouse.y = -(((e.clientY-rect.top)/rect.height)*2 - 1);

  // 1) Try select agent first
  raycaster.setFromCamera(mouse, camera);
  const hitsW = raycaster.intersectObject(workerMesh, true);
  const hitsN = raycaster.intersectObject(neutralMesh, true);
  const hit = (hitsW[0] && (!hitsN[0] || hitsW[0].distance < hitsN[0].distance)) ? hitsW[0] : hitsN[0];

  if(hit){
    const idx = hit.instanceId;
    // map instanceId to agent
    if(hit.object === workerMesh){
      selectedAgent = agents.filter(a=>a.type==="WORKER")[idx];
    } else {
      selectedAgent = agents.filter(a=>a.type==="NEUTRAL")[idx];
    }
    renderInspect();
    return;
  }

  // 2) Place tile
  const planeHit = raycaster.intersectObject(pickPlane, true)[0];
  if(!planeHit) return;
  const worldP = planeHit.point;
  const { ix, iz } = worldToTile(worldP, gridW, gridH, tileSize);
  if(!inBounds(ix,iz,gridW,gridH)) return;

  const idxTile = ix + iz*gridW;

  const newType = tileTypeForTool(tool);
  const oldType = grid[idxTile];

  if(tool !== "erase"){
    // ignore if no change
    if(oldType === newType) return;

    const cost = costForTool(tool);
    if(!canAfford(cost)) return;
    pay(cost);
  }

  grid[idxTile] = newType;
  updateTileInstance(ix, iz);
  tileMesh.instanceMatrix.needsUpdate = true;
  tileMesh.instanceColor.needsUpdate = true;

  // If you erase a WALL, it becomes passable immediately (nice for demo iteration)
  renderHUD();
});

function renderInspect(){
  if(!selectedAgent){
    inspect.innerHTML = `<div><b>Selected Agent</b></div><div class="small muted">Click a sphere in the scene.</div>`;
    return;
  }
  const a = selectedAgent;
  const type = a.type;
  inspect.innerHTML = `
    <div><b>Selected Agent</b> <span class="muted">(${type})</span></div>
    <div class="small" style="margin-top:6px;"><b>State:</b> ${a.bb.stateLabel}</div>
    <div class="small"><b>Role:</b> ${a.type==="WORKER" ? a.bb.role : "N/A"}</div>
    <div class="small"><b>Hunger:</b> ${a.bb.hunger.toFixed(2)}</div>
    <div class="small"><b>Carry:</b> food=${a.bb.carry.food}, wood=${a.bb.carry.wood}</div>
    <div class="small"><b>Target Tile:</b> ${a.targetTile ? `(${a.targetTile.ix},${a.targetTile.iz})` : "none"}</div>
    <div class="hint muted">
      Priority (BT-style): Hungry→Eat, Carry→Deliver, Role→Work, else Wander.
    </div>
  `;
}

/* -----------------------------
   Global “Resource Manager” (Auto Assign)
------------------------------ */
let managerTimer = 0;
function managerTick(dt){
  managerTimer -= dt;
  if(managerTimer > 0) return;
  managerTimer = 1.2; // reassign every ~1s

  // desired ratio from UI
  const targetFarm = Number(farmRatio.value)/100;

  // emergency override: if food critically low, force more farmers
  const emergency = (resources.food < 12);

  // collect workers list
  const workers = agents.filter(a=>a.type==="WORKER");
  const n = workers.length;
  let farmN = Math.round(n * (emergency ? Math.max(0.85, targetFarm) : targetFarm));
  farmN = clamp(farmN, 0, n);

  // assign first farmN as FARM, rest as WOOD (cheap & deterministic)
  // (You can later improve: assign by distance to job sites, skill, etc.)
  for(let i=0;i<n;i++){
    workers[i].bb.role = (i<farmN) ? ROLE.FARM : ROLE.WOOD;
  }
}

/* -----------------------------
   Find Nearest Tile of a Type
------------------------------ */
function findNearestTileOfTypes(fromPos, types){
  const {ix: sx, iz: sz} = worldToTile(fromPos, gridW, gridH, tileSize);
  let best = null;
  let bestD = Infinity;

  // quick scan (for prototype). If you scale up later, build an index.
  for(let iz=0; iz<gridH; iz++){
    for(let ix=0; ix<gridW; ix++){
      const t = grid[ix + iz*gridW];
      if(!types.includes(t)) continue;
      const d = Math.abs(ix-sx) + Math.abs(iz-sz);
      if(d < bestD){
        bestD = d;
        best = {ix, iz};
      }
    }
  }
  return best;
}

/* -----------------------------
   Boids (with spatial hash)
------------------------------ */
const neighborR = 1.8;
const sepR = 0.9;

function buildSpatialHash(list){
  const cell = 2.0; // ~neighborR
  const map = new Map();
  function key(cx,cz){ return (cx<<16) ^ (cz & 0xffff); }
  for(const a of list){
    const cx = Math.floor(a.pos.x / cell);
    const cz = Math.floor(a.pos.z / cell);
    const k = key(cx,cz);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  return { map, cell, key };
}
function queryNeighbors(hash, a){
  const { map, cell, key } = hash;
  const cx = Math.floor(a.pos.x / cell);
  const cz = Math.floor(a.pos.z / cell);
  const out = [];
  for(let dx=-1; dx<=1; dx++){
    for(let dz=-1; dz<=1; dz++){
      const k = key(cx+dx, cz+dz);
      const cellList = map.get(k);
      if(cellList) out.push(...cellList);
    }
  }
  return out;
}

function boidsSteer(a, neighbors, desiredVel){
  // only flock with same type (worker with worker, neutral with neutral)
  let sep = new THREE.Vector3();
  let ali = new THREE.Vector3();
  let coh = new THREE.Vector3();
  let count=0, countSep=0;

  for(const b of neighbors){
    if(b===a) continue;
    if(b.type !== a.type) continue;

    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if(d <= 0) continue;

    if(d < neighborR){
      ali.add(b.vel);
      coh.add(b.pos);
      count++;

      if(d < sepR){
        sep.add(new THREE.Vector3(-dx/d, 0, -dz/d).multiplyScalar(1/(d+0.001)));
        countSep++;
      }
    }
  }

  if(count>0){
    ali.multiplyScalar(1/count);
    coh.multiplyScalar(1/count).sub(a.pos);
  }
  // weights tuned for stability
  const wSep = 1.4, wAli=0.55, wCoh=0.35, wSeek=1.25;

  // convert to steering (roughly)
  let steer = new THREE.Vector3();
  steer.add(sep.multiplyScalar(wSep));
  steer.add(ali.multiplyScalar(wAli));
  steer.add(coh.multiplyScalar(wCoh));
  steer.add(desiredVel.clone().multiplyScalar(wSeek));

  return steer;
}

/* -----------------------------
   Agent “BT-like” Decision + Actions
------------------------------ */
function setTargetAndPath(a, targetTile){
  if(!targetTile) return false;
  // if already targeting same tile and still has path, keep it
  if(a.targetTile && a.targetTile.ix===targetTile.ix && a.targetTile.iz===targetTile.iz && a.path && a.pathIndex < a.path.length){
    return true;
  }
  const start = worldToTile(a.pos, gridW, gridH, tileSize);
  const path = aStar(grid, gridW, gridH, start, targetTile);
  if(!path){
    a.path = null;
    a.pathIndex = 0;
    a.targetTile = null;
    return false;
  }
  a.path = path;
  a.pathIndex = 0;
  a.targetTile = targetTile;
  return true;
}

function followPath(a, dt){
  if(!a.path || a.pathIndex >= a.path.length) return { done:true, desiredVel:new THREE.Vector3() };

  const tile = a.path[a.pathIndex];
  const wp = tileToWorld(tile.ix, tile.iz, gridW, gridH, tileSize);
  wp.y = a.pos.y;

  const to = wp.clone().sub(a.pos);
  const dist = Math.hypot(to.x, to.z);

  if(dist < 0.15){
    a.pathIndex++;
    if(a.pathIndex >= a.path.length){
      return { done:true, desiredVel:new THREE.Vector3() };
    }
  }

  const speed = (a.type==="WORKER") ? 2.2 : 1.9;
  const desired = new THREE.Vector3(to.x, 0, to.z).normalize().multiplyScalar(speed);
  return { done:false, desiredVel: desired };
}

function workerDecision(a, dt){
  // decay hunger
  a.bb.hunger = clamp(a.bb.hunger - dt*0.015, 0, 1);

  // Priority 1: Hungry -> go warehouse and consume food
  if(a.bb.hunger < 0.30 && resources.food > 0){
    a.bb.stateLabel = "Eat (Go Warehouse)";
    const wh = findNearestTileOfTypes(a.pos, [TILE.WAREHOUSE]);
    if(wh && setTargetAndPath(a, wh)){
      const step = followPath(a, dt);
      // if reached warehouse, eat
      if(step.done){
        const eat = Math.min(6*dt, resources.food);
        resources.food -= eat;
        a.bb.hunger = clamp(a.bb.hunger + eat*0.04, 0, 1);
      }
      return step.desiredVel;
    }
  }

  // Priority 2: If carrying something -> deliver to warehouse
  if(a.bb.carry.food + a.bb.carry.wood > 0){
    a.bb.stateLabel = "Deliver (Warehouse)";
    const wh = findNearestTileOfTypes(a.pos, [TILE.WAREHOUSE]);
    if(wh && setTargetAndPath(a, wh)){
      const step = followPath(a, dt);
      if(step.done){
        resources.food += a.bb.carry.food;
        resources.wood += a.bb.carry.wood;
        a.bb.carry.food = 0;
        a.bb.carry.wood = 0;
      }
      return step.desiredVel;
    }
  }

  // Priority 3: Work by assigned role
  if(a.bb.role === ROLE.FARM){
    a.bb.stateLabel = "Work (Farm)";
    const farm = findNearestTileOfTypes(a.pos, [TILE.FARM]);
    if(farm && setTargetAndPath(a, farm)){
      const step = followPath(a, dt);
      if(step.done){
        // harvest food
        if(a.bb.cooldown <= 0){
          a.bb.cooldown = 0.6 + Math.random()*0.4;
        } else {
          a.bb.cooldown -= dt;
          if(a.bb.cooldown <= 0){
            a.bb.carry.food += 1;
          }
        }
      }
      return step.desiredVel;
    }
  } else {
    a.bb.stateLabel = "Work (Lumber)";
    const lumber = findNearestTileOfTypes(a.pos, [TILE.LUMBER]);
    if(lumber && setTargetAndPath(a, lumber)){
      const step = followPath(a, dt);
      if(step.done){
        // harvest wood
        if(a.bb.cooldown <= 0){
          a.bb.cooldown = 0.6 + Math.random()*0.4;
        } else {
          a.bb.cooldown -= dt;
          if(a.bb.cooldown <= 0){
            a.bb.carry.wood += 1;
          }
        }
      }
      return step.desiredVel;
    }
  }

  // Fallback: wander
  a.bb.stateLabel = "Wander";
  if(!a.targetTile || !a.path || a.pathIndex >= a.path.length){
    const t = randomPassableTile();
    setTargetAndPath(a, t);
  }
  return followPath(a, dt).desiredVel;
}

function neutralDecision(a, dt){
  // neutrals: wander + occasional sabotage
  a.bb.sabotageCooldown -= dt;

  // choose sabotage target sometimes
  if(a.bb.sabotageCooldown <= 0){
    a.bb.sabotageCooldown = 6 + Math.random()*10;
    // pick a random building tile
    const candidates = [];
    for(let iz=0; iz<gridH; iz++){
      for(let ix=0; ix<gridW; ix++){
        const t = grid[ix+iz*gridW];
        if(t===TILE.FARM || t===TILE.LUMBER || t===TILE.WAREHOUSE){
          candidates.push({ix, iz});
        }
      }
    }
    if(candidates.length>0){
      const target = candidates[Math.floor(Math.random()*candidates.length)];
      setTargetAndPath(a, target);
      a.bb.stateLabel = "Sabotage (Target Building)";
    }
  }

  // if has a target, move; if reached, apply effect
  if(a.targetTile && a.path && a.pathIndex < a.path.length){
    const step = followPath(a, dt);
    if(step.done){
      // apply sabotage if on a building tile
      const idx = a.targetTile.ix + a.targetTile.iz*gridW;
      const t = grid[idx];
      if(t===TILE.WAREHOUSE){
        // steal/destroy some stock (non-graphic, just numbers)
        resources.food = Math.max(0, resources.food - (3 + Math.random()*6));
        resources.wood = Math.max(0, resources.wood - (3 + Math.random()*6));
      }
      if(t===TILE.FARM || t===TILE.LUMBER || t===TILE.WAREHOUSE){
        grid[idx] = TILE.RUINS;
        updateTileInstance(a.targetTile.ix, a.targetTile.iz);
        tileMesh.instanceMatrix.needsUpdate = true;
        tileMesh.instanceColor.needsUpdate = true;
      }
      a.targetTile = null; a.path = null; a.pathIndex = 0;
    }
    return step.desiredVel;
  }

  // wander
  a.bb.stateLabel = "Wander (Herd)";
  if(!a.targetTile || !a.path || a.pathIndex >= a.path.length){
    const t = randomPassableTile();
    setTargetAndPath(a, t);
  }
  return followPath(a, dt).desiredVel;
}

/* -----------------------------
   Main Loop
------------------------------ */
let last = performance.now();
renderHUD();

function animate(now){
  const dt = Math.min(0.033, (now-last)/1000);
  last = now;

  controls.update();

  managerTick(dt);

  // spatial hash (for boids)
  const hash = buildSpatialHash(agents);

  // update agents
  for(const a of agents){
    let desiredVel;
    if(a.type==="WORKER") desiredVel = workerDecision(a, dt);
    else desiredVel = neutralDecision(a, dt);

    const neighbors = queryNeighbors(hash, a);
    const steer = boidsSteer(a, neighbors, desiredVel);

    // integrate velocity (simple)
    a.vel.lerp(steer, 0.12); // damping-ish steering
    const maxV = (a.type==="WORKER") ? 2.3 : 2.0;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if(speed > maxV){
      a.vel.multiplyScalar(maxV/(speed+1e-6));
    }

    a.pos.add(a.vel.clone().multiplyScalar(dt));
    a.pos.y = 0.45;

    // keep in bounds by soft clamp
    const boundsX = (gridW*tileSize)/2 - 0.5;
    const boundsZ = (gridH*tileSize)/2 - 0.5;
    a.pos.x = clamp(a.pos.x, -boundsX, boundsX);
    a.pos.z = clamp(a.pos.z, -boundsZ, boundsZ);
  }

  // render instanced spheres
  let wi=0, ni=0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1,1,1);
  for(const a of agents){
    m.compose(a.pos, q, s);
    if(a.type==="WORKER"){
      workerMesh.setMatrixAt(wi++, m);
    } else {
      neutralMesh.setMatrixAt(ni++, m);
    }
  }
  workerMesh.instanceMatrix.needsUpdate = true;
  neutralMesh.instanceMatrix.needsUpdate = true;

  // HUD
  renderHUD();
  if(selectedAgent) renderInspect();

  // resize
  if(renderer.domElement.width !== canvas.clientWidth || renderer.domElement.height !== canvas.clientHeight){
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth/canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
