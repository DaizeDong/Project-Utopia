"""Lean entity factory (port of ``src/entities/EntityFactory.js``).

The JS source carries ~600 LOC of cosmetic name pools (WORKER_NAME_BANK,
TRADER_NAME_BANK, SABOTEUR_NAME_BANK, lineage tags, backstory builders).
RC3 flagged those for removal in the academic harness — the benchmark
metrics only need structural fields. This module keeps:

- ID generation (a seeded monotone counter)
- Worker, Visitor, Animal dataclasses with the minimum field set required
  by Boids + the FSM + Navigation
- ``create_worker``, ``create_predator``, ``create_herbivore``,
  ``create_saboteur``, ``create_trader`` constructors
- ``EntityFactory`` aggregator that exposes the above via a single object
  for the harness

Drops vs JS (~600 LOC):
- name banks + ``pick_worker_name`` / ``pick_visitor_name``
- ``buildWorkerBackstory`` + lineage / kinship metadata
- Animal species variants, raider-beast stat envelopes, ANIMAL_SPECIES_HP
  per-species table, predator weighting RNG
- biome-aware spawn-tile pickers (port lives in scenarios when we need it)
- ``createInitialGameState`` resource/world bootstrap (handled by
  ``app.services.create_services`` in Phase 2)
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "Animal",
    "EntityFactory",
    "IdGenerator",
    "Visitor",
    "Worker",
]


# ---- id generator -----------------------------------------------------------


class IdGenerator:
    """Thread-safe seeded ID generator (port of ``src/app/id.js``).

    Determinism: a fresh generator is constructed per harness run, so the
    monotone sequence ``worker_1 → worker_2 → ...`` is reproducible. Reset
    is provided primarily for unit tests; production code should
    ``IdGenerator(seed=0)`` once and reuse the instance.
    """

    __slots__ = ("_seq", "_lock")

    def __init__(self, *, start: int = 1) -> None:
        self._seq: int = int(start)
        self._lock = threading.Lock()

    def next(self, prefix: str = "id") -> str:
        """Mint the next ``{prefix}_{seq}`` id."""
        with self._lock:
            seq = self._seq
            self._seq += 1
        return f"{prefix}_{seq}"

    def reset(self, *, start: int = 1) -> None:
        with self._lock:
            self._seq = int(start)

    @property
    def current(self) -> int:
        """Inspect the next sequence number without consuming it."""
        return self._seq


# ---- dataclasses ------------------------------------------------------------


@dataclass(slots=True)
class Worker:
    """Worker entity — the colony's labour pool."""

    id: str
    x: float
    z: float
    vx: float = 0.0
    vz: float = 0.0
    hunger: float = 1.0
    role: str = "FARM"
    fsm_state: str = "IDLE"
    faction: str = "colony"
    group_id: str = "workers"
    type: str = "WORKER"
    alive: bool = True
    rest: float = 1.0
    hp: float = 100.0
    max_hp: float = 100.0
    carry: dict[str, float] = field(
        default_factory=lambda: {"food": 0.0, "wood": 0.0, "stone": 0.0}
    )
    target_tile: tuple[int, int] | None = None
    path: list[tuple[int, int]] | None = None
    path_index: int = 0
    path_grid_version: int = -1
    desired_vel: dict[str, float] = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    blackboard: dict[str, Any] = field(default_factory=dict)
    fsm: dict[str, Any] = field(default_factory=dict)
    state_label: str = "Idle"
    _role_changed_at_sec: float = float("-inf")


@dataclass(slots=True)
class Visitor:
    """Visitor entity — traders (colony) and saboteurs (hostile)."""

    id: str
    x: float
    z: float
    kind: str  # "TRADER" or "SABOTEUR"
    vx: float = 0.0
    vz: float = 0.0
    hunger: float = 1.0
    faction: str = "colony"
    group_id: str = "traders"
    type: str = "VISITOR"
    alive: bool = True
    hp: float = 100.0
    max_hp: float = 100.0
    target_tile: tuple[int, int] | None = None
    path: list[tuple[int, int]] | None = None
    path_index: int = 0
    path_grid_version: int = -1
    desired_vel: dict[str, float] = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    blackboard: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Animal:
    """Animal entity — predators (hostile) and herbivores (neutral)."""

    id: str
    x: float
    z: float
    kind: str  # "PREDATOR" or "HERBIVORE"
    vx: float = 0.0
    vz: float = 0.0
    hunger: float = 1.0
    faction: str = "neutral"
    group_id: str = "herbivores"
    type: str = "ANIMAL"
    alive: bool = True
    hp: float = 80.0
    max_hp: float = 80.0
    target_tile: tuple[int, int] | None = None
    path: list[tuple[int, int]] | None = None
    path_index: int = 0
    path_grid_version: int = -1
    desired_vel: dict[str, float] = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    blackboard: dict[str, Any] = field(default_factory=dict)


# ---- factory ---------------------------------------------------------------


class EntityFactory:
    """Aggregates the per-entity constructors.

    Holds a single :class:`IdGenerator` so every entity created by the
    same factory shares one monotonic ID space.
    """

    __slots__ = ("ids",)

    def __init__(self, ids: IdGenerator | None = None) -> None:
        self.ids: IdGenerator = ids or IdGenerator()

    # ---- workers ----------------------------------------------------------

    def create_worker(
        self,
        *,
        position: tuple[float, float],
        faction: str = "colony",
        role: str = "FARM",
        group_id: str = "workers",
        rng: Any = None,
    ) -> Worker:
        """Create a colony worker at ``position`` with default health/stats.

        ``rng`` is accepted (for API parity with the JS source) but only
        consumed when the caller asks for jittered initial velocity via
        ``rng.jitter`` — otherwise we leave ``vx, vz = 0`` so the boids
        step is fully deterministic on its first tick.
        """
        x, z = float(position[0]), float(position[1])
        vx = vz = 0.0
        if rng is not None and hasattr(rng, "jitter"):
            vx = float(rng.jitter(0.15))
            vz = float(rng.jitter(0.15))
        return Worker(
            id=self.ids.next("worker"),
            x=x,
            z=z,
            vx=vx,
            vz=vz,
            role=role,
            faction=faction,
            group_id=group_id,
        )

    # ---- visitors ---------------------------------------------------------

    def create_trader(
        self,
        *,
        position: tuple[float, float],
        rng: Any = None,
    ) -> Visitor:
        """Create a wandering trader (colony faction)."""
        x, z = float(position[0]), float(position[1])
        vx = vz = 0.0
        if rng is not None and hasattr(rng, "jitter"):
            vx = float(rng.jitter(0.15))
            vz = float(rng.jitter(0.15))
        return Visitor(
            id=self.ids.next("visitor"),
            x=x,
            z=z,
            kind="TRADER",
            faction="colony",
            group_id="traders",
            vx=vx,
            vz=vz,
        )

    def create_saboteur(
        self,
        *,
        position: tuple[float, float],
        rng: Any = None,
    ) -> Visitor:
        """Create a hostile saboteur (hostile faction, lower HP)."""
        x, z = float(position[0]), float(position[1])
        vx = vz = 0.0
        if rng is not None and hasattr(rng, "jitter"):
            vx = float(rng.jitter(0.15))
            vz = float(rng.jitter(0.15))
        return Visitor(
            id=self.ids.next("visitor"),
            x=x,
            z=z,
            kind="SABOTEUR",
            faction="hostile",
            group_id="saboteurs",
            hp=65.0,
            max_hp=65.0,
            vx=vx,
            vz=vz,
        )

    # ---- animals ----------------------------------------------------------

    def create_predator(
        self,
        *,
        position: tuple[float, float],
        rng: Any = None,
    ) -> Animal:
        """Create a hostile predator (animal/hostile)."""
        x, z = float(position[0]), float(position[1])
        vx = vz = 0.0
        if rng is not None and hasattr(rng, "jitter"):
            vx = float(rng.jitter(0.12))
            vz = float(rng.jitter(0.12))
        return Animal(
            id=self.ids.next("animal"),
            x=x,
            z=z,
            kind="PREDATOR",
            faction="hostile",
            group_id="predators",
            hp=90.0,
            max_hp=90.0,
            vx=vx,
            vz=vz,
        )

    def create_herbivore(
        self,
        *,
        position: tuple[float, float],
        rng: Any = None,
    ) -> Animal:
        """Create a neutral herbivore."""
        x, z = float(position[0]), float(position[1])
        vx = vz = 0.0
        if rng is not None and hasattr(rng, "jitter"):
            vx = float(rng.jitter(0.12))
            vz = float(rng.jitter(0.12))
        return Animal(
            id=self.ids.next("animal"),
            x=x,
            z=z,
            kind="HERBIVORE",
            faction="neutral",
            group_id="herbivores",
            hp=70.0,
            max_hp=70.0,
            vx=vx,
            vz=vz,
        )
