// v0.9.0-c — JobBuildSite: walk-to + apply work at a `state.constructionSites`
// entry. canTake passes for BUILDER always; for HAUL/FARM only when
// `sitesCount > activeWorkers` (v0.8.11 noEconomyBootstrap parity).
// findTarget delegates to `findOrReserveBuilderSite` so claim semantics
// (builderId on the index entry + the construction overlay) stay in one
// place. tick mirrors handleSeekConstruct/handleConstruct: walk to site,
// then call applyConstructionWork while standing on it.

import { clamp } from "../../../app/math.js";
import { ROLE } from "../../../config/constants.js";
import {
  applyConstructionWork,
  findOrReserveBuilderSite,
  releaseBuilderSite,
} from "../../construction/ConstructionSites.js";
import { worldToTile } from "../../../world/grid/Grid.js";
import {
  executeMovement,
  setIdleDesired,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

function activeWorkerCount(state) {
  if (!Array.isArray(state?.agents)) return 0;
  let n = 0;
  for (const a of state.agents) if (a?.type === "WORKER" && a.alive !== false) n += 1;
  return n;
}

function manhattan(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0))
    + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

export class JobBuildSite extends Job {
  static id = "build_site";
  static priority = 30;

  canTake(worker, state, _services) {
    const sites = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
    if (sites.length <= 0) return false;
    const role = String(worker?.role ?? "").toUpperCase();
    if (role === ROLE.BUILDER) return true;
    if (role === ROLE.HAUL || role === ROLE.FARM) {
      return sites.length > activeWorkerCount(state);
    }
    return false;
  }

  findTarget(worker, state, _services) {
    const site = findOrReserveBuilderSite(state, worker);
    if (!site) return null;
    return { ix: site.ix, iz: site.iz, meta: { siteKey: `${site.ix},${site.iz}` } };
  }

  score(worker, state, _services, target) {
    if (!target) return 0;
    const role = String(worker?.role ?? "").toUpperCase();
    let base;
    if (role === ROLE.BUILDER) base = 0.85;
    else if (role === ROLE.HAUL || role === ROLE.FARM) base = 0.35;
    else base = 0;
    // v0.9.0-d bugfix — convert worker world coords to tile coords before
    // computing manhattan distance (see JobHarvestBase.score).
    const here = state?.grid
      ? worldToTile(Number(worker?.x ?? 0), Number(worker?.z ?? 0), state.grid)
      : { ix: 0, iz: 0 };
    const distFactor = 1 / (1 + manhattan(target, here) * 0.05);
    return clamp(base * distFactor, 0, 0.95);
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    const target = worker.currentJob?.target ?? null;
    if (!target) { setIdleDesired(worker); return; }
    if (!worker.targetTile
        || worker.targetTile.ix !== target.ix
        || worker.targetTile.iz !== target.iz) {
      worker.targetTile = { ix: target.ix, iz: target.iz };
    }
    const here = state?.grid ? worldToTile(worker.x, worker.z, state.grid) : null;
    const onTile = here && here.ix === target.ix && here.iz === target.iz;
    if (!onTile) {
      worker.blackboard.intent = "seek_construct";
      worker.stateLabel = "Seek Construct";
      tryAcquirePath(worker, target, state, services);
      executeMovement(worker, state, dt);
      return;
    }
    worker.blackboard.intent = "construct";
    worker.stateLabel = "Construct";
    setIdleDesired(worker);
    // TODO v0.9.0-d: dedupe with handleConstruct after legacy retired.
    const site = findOrReserveBuilderSite(state, worker);
    if (!site) return;
    applyConstructionWork(state, site.ix, site.iz, dt);
    if (worker.debug) worker.debug.lastConstructApplySec = Number(state.metrics?.timeSec ?? 0);
  }

  isComplete(worker, state, _services) {
    const target = worker?.currentJob?.target;
    if (!target) return true;
    const arr = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
    for (const s of arr) if (s && s.ix === target.ix && s.iz === target.iz) return false;
    return true;
  }

  onAbandon(worker, state, _services) {
    releaseBuilderSite(state, worker);
  }
}
