const DEFAULT_STATE_HOLD_SEC = 0.35;

export const GROUP_STATE_GRAPH = Object.freeze({
  workers: Object.freeze({
    idle: ["seek_food", "seek_task", "wander"],
    seek_food: ["eat", "seek_task"],
    eat: ["seek_task", "wander", "idle"],
    seek_task: ["harvest", "deliver", "wander", "process"],
    harvest: ["deliver", "seek_food", "seek_task"],
    deliver: ["seek_task", "seek_food", "idle"],
    process: ["seek_task", "seek_food", "idle"],
    wander: ["seek_task", "seek_food", "idle"],
  }),
  traders: Object.freeze({
    idle: ["seek_trade", "seek_food", "wander"],
    seek_trade: ["trade", "seek_food", "wander"],
    trade: ["seek_trade", "seek_food", "idle"],
    seek_food: ["eat", "seek_trade"],
    eat: ["seek_trade", "wander", "idle"],
    wander: ["seek_trade", "seek_food", "idle"],
  }),
  saboteurs: Object.freeze({
    idle: ["scout", "seek_food", "wander"],
    scout: ["sabotage", "evade", "seek_food", "wander"],
    sabotage: ["evade", "scout", "seek_food"],
    evade: ["scout", "seek_food", "wander"],
    seek_food: ["eat", "scout"],
    eat: ["scout", "evade", "idle"],
    wander: ["scout", "seek_food", "idle"],
  }),
  herbivores: Object.freeze({
    idle: ["graze", "wander", "regroup"],
    graze: ["flee", "regroup", "wander"],
    flee: ["regroup", "graze", "wander"],
    regroup: ["graze", "wander", "idle"],
    wander: ["graze", "regroup", "idle"],
  }),
  predators: Object.freeze({
    idle: ["stalk", "roam", "rest"],
    stalk: ["hunt", "roam", "rest"],
    hunt: ["feed", "roam", "stalk"],
    feed: ["stalk", "rest", "roam"],
    roam: ["stalk", "rest", "idle"],
    rest: ["stalk", "roam", "idle"],
  }),
});

export const GROUP_DEFAULT_STATE = Object.freeze({
  workers: "idle",
  traders: "idle",
  saboteurs: "idle",
  herbivores: "idle",
  predators: "idle",
});

const LABELS = Object.freeze({
  workers: {
    idle: "Idle",
    seek_food: "Seek Food",
    eat: "Eat",
    seek_task: "Seek Task",
    harvest: "Harvest",
    deliver: "Deliver",
    process: "Process",
    wander: "Wander",
  },
  traders: {
    idle: "Idle",
    seek_trade: "Seek Trade",
    trade: "Trade",
    seek_food: "Seek Food",
    eat: "Eat",
    wander: "Wander",
  },
  saboteurs: {
    idle: "Idle",
    scout: "Scout",
    sabotage: "Sabotage",
    evade: "Evade",
    seek_food: "Seek Food",
    eat: "Eat",
    wander: "Wander",
  },
  herbivores: {
    idle: "Idle",
    graze: "Graze",
    flee: "Flee",
    regroup: "Regroup",
    wander: "Wander",
  },
  predators: {
    idle: "Idle",
    stalk: "Stalk",
    hunt: "Hunt",
    feed: "Feed",
    roam: "Roam",
    rest: "Rest",
  },
});

function getGraph(groupId) {
  return GROUP_STATE_GRAPH[groupId] ?? null;
}

function normalizeState(groupId, state) {
  const graph = getGraph(groupId);
  const fallback = GROUP_DEFAULT_STATE[groupId] ?? "idle";
  if (!graph) return fallback;
  if (state && Object.hasOwn(graph, state)) return state;
  return fallback;
}

function shortestPath(groupId, fromState, toState) {
  const graph = getGraph(groupId);
  if (!graph) return [];
  const from = normalizeState(groupId, fromState);
  const to = normalizeState(groupId, toState);
  if (from === to) return [from];

  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const neighbors = graph[current] ?? [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      visited.add(next);
      queue.push(nextPath);
    }
  }
  return [from];
}

function recordInvalidTransition(entity, groupId, fromState, toState, nowSec) {
  entity.debug ??= {};
  entity.debug.invalidTransitionCount = Number(entity.debug.invalidTransitionCount ?? 0) + 1;
  entity.debug.lastInvalidTransition = {
    groupId,
    from: fromState,
    to: toState,
    atSec: nowSec,
  };
}

function ensureFsm(entity, groupId, nowSec = 0) {
  entity.blackboard ??= {};
  const fsm = entity.blackboard.fsm ?? {
    state: GROUP_DEFAULT_STATE[groupId] ?? "idle",
    previousState: null,
    changedAtSec: nowSec,
    reason: "bootstrap",
    history: [],
    path: [],
  };
  fsm.state = normalizeState(groupId, fsm.state);
  fsm.path = Array.isArray(fsm.path) ? fsm.path : [];
  fsm.history = Array.isArray(fsm.history) ? fsm.history : [];
  entity.blackboard.fsm = fsm;
  return fsm;
}

function formatState(groupId, state) {
  return LABELS[groupId]?.[state] ?? state ?? "Idle";
}

export function listGroupStates(groupId) {
  const graph = getGraph(groupId);
  return graph ? Object.keys(graph) : [];
}

export function listGroupTransitions(groupId) {
  const graph = getGraph(groupId);
  if (!graph) return [];
  const edges = [];
  for (const [from, tos] of Object.entries(graph)) {
    for (const to of tos) edges.push({ from, to });
  }
  return edges;
}

export function getEntityState(entity, groupId, nowSec = 0) {
  const fsm = ensureFsm(entity, groupId, nowSec);
  return fsm.state;
}

export function transitionEntityState(entity, groupId, desiredState, nowSec, reason = "", options = {}) {
  const fsm = ensureFsm(entity, groupId, nowSec);
  const holdSec = Number(options.holdSec ?? DEFAULT_STATE_HOLD_SEC);
  const force = Boolean(options.force);
  const desired = normalizeState(groupId, desiredState);
  const current = normalizeState(groupId, fsm.state);

  if (!force && holdSec > 0 && Number.isFinite(fsm.changedAtSec) && nowSec - fsm.changedAtSec < holdSec) {
    entity.stateLabel = formatState(groupId, current);
    entity.blackboard.intent = current;
    entity.debug ??= {};
    entity.debug.lastIntent = current;
    return current;
  }

  let nextState = current;
  if (desired !== current) {
    const path = shortestPath(groupId, current, desired);
    if (path.length <= 1 && desired !== current) {
      recordInvalidTransition(entity, groupId, current, desired, nowSec);
    }
    nextState = path.length >= 2 ? path[1] : current;
    fsm.path = path.slice(1, 6);
  } else {
    fsm.path = [];
  }

  if (nextState !== current) {
    fsm.previousState = current;
    fsm.state = nextState;
    fsm.changedAtSec = nowSec;
    fsm.reason = reason || "transition";
    fsm.history.unshift({
      from: current,
      to: nextState,
      atSec: nowSec,
      reason: fsm.reason,
    });
    fsm.history = fsm.history.slice(0, 8);
  } else if (reason) {
    fsm.reason = reason;
  }

  const finalState = normalizeState(groupId, fsm.state);
  entity.stateLabel = formatState(groupId, finalState);
  entity.blackboard.intent = finalState;
  entity.debug ??= {};
  entity.debug.lastIntent = finalState;
  entity.debug.stateReason = fsm.reason;
  entity.debug.lastStateChangeSec = Number(fsm.changedAtSec ?? nowSec);
  entity.debug.statePath = [...(fsm.path ?? [])];
  return finalState;
}

export function mapStateToDisplayLabel(groupId, state) {
  return formatState(groupId, normalizeState(groupId, state));
}
