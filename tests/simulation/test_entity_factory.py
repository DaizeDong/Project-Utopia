"""Entity factory + ID-generator tests."""

from __future__ import annotations

import pytest

from project_utopia.app.rng import SeededRng
from project_utopia.entities.entity_factory import (
    Animal,
    EntityFactory,
    IdGenerator,
    Visitor,
    Worker,
)


def test_id_generator_monotonic() -> None:
    """Sequential calls yield strictly increasing sequence numbers."""
    gen = IdGenerator()
    a = gen.next("worker")
    b = gen.next("worker")
    c = gen.next("animal")
    assert a == "worker_1"
    assert b == "worker_2"
    assert c == "animal_3"


def test_id_generator_reset() -> None:
    """``reset()`` rewinds the counter."""
    gen = IdGenerator()
    gen.next("a")
    gen.reset()
    assert gen.next("a") == "a_1"


def test_create_worker_returns_valid_entity() -> None:
    """A freshly-created worker has every benchmark-required field."""
    factory = EntityFactory()
    worker = factory.create_worker(position=(1.0, 2.0))
    assert isinstance(worker, Worker)
    assert worker.id.startswith("worker_")
    assert worker.x == 1.0
    assert worker.z == 2.0
    assert worker.faction == "colony"
    assert worker.group_id == "workers"
    assert worker.alive is True
    assert worker.role == "FARM"
    assert worker.type == "WORKER"
    assert worker.fsm_state == "IDLE"
    # Carry shape matches the JS 4-tuple resource space.
    assert set(worker.carry.keys()) == {"food", "wood", "stone", "herbs"}


def test_sequential_workers_have_monotonic_ids() -> None:
    """Sequential ``create_worker`` calls produce monotonic IDs."""
    factory = EntityFactory()
    ids = [factory.create_worker(position=(0.0, 0.0)).id for _ in range(5)]
    seqs = [int(i.split("_")[1]) for i in ids]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == 5  # all distinct


def test_create_predator() -> None:
    """Predators land in the hostile faction with the predator group_id."""
    factory = EntityFactory()
    animal = factory.create_predator(position=(0.0, 0.0))
    assert isinstance(animal, Animal)
    assert animal.kind == "PREDATOR"
    assert animal.faction == "hostile"
    assert animal.group_id == "predators"


def test_create_herbivore() -> None:
    """Herbivores are neutral."""
    factory = EntityFactory()
    animal = factory.create_herbivore(position=(0.0, 0.0))
    assert animal.kind == "HERBIVORE"
    assert animal.faction == "neutral"
    assert animal.group_id == "herbivores"


def test_create_saboteur() -> None:
    """Saboteurs are hostile visitors with reduced HP."""
    factory = EntityFactory()
    saboteur = factory.create_saboteur(position=(0.0, 0.0))
    assert isinstance(saboteur, Visitor)
    assert saboteur.kind == "SABOTEUR"
    assert saboteur.faction == "hostile"
    assert saboteur.group_id == "saboteurs"
    # Saboteur HP is 65 in the JS source.
    assert saboteur.hp == 65.0
    assert saboteur.max_hp == 65.0


def test_create_trader() -> None:
    """Traders are colony-faction visitors."""
    factory = EntityFactory()
    trader = factory.create_trader(position=(0.0, 0.0))
    assert trader.kind == "TRADER"
    assert trader.faction == "colony"
    assert trader.group_id == "traders"


def test_rng_jitter_injects_velocity() -> None:
    """When ``rng`` is supplied, initial velocity gets jitter (non-zero)."""
    factory = EntityFactory()
    rng = SeededRng(seed=42)
    worker = factory.create_worker(position=(0.0, 0.0), rng=rng)
    # Jitter range is ±0.15 → non-zero with overwhelming probability.
    assert worker.vx != 0.0 or worker.vz != 0.0


def test_no_rng_means_zero_velocity() -> None:
    """No rng → first tick is fully deterministic (v = 0)."""
    factory = EntityFactory()
    worker = factory.create_worker(position=(0.0, 0.0))
    assert worker.vx == 0.0
    assert worker.vz == 0.0


def test_factory_isolated_id_spaces() -> None:
    """Two EntityFactory instances do not share IDs."""
    a = EntityFactory()
    b = EntityFactory()
    a_id = a.create_worker(position=(0.0, 0.0)).id
    b_id = b.create_worker(position=(0.0, 0.0)).id
    # Each factory starts at 1 → both yield "worker_1".
    assert a_id == b_id == "worker_1"
