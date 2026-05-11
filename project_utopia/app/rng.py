"""Seeded RNG built on ``numpy.random.Generator(PCG64)``.

This module replaces the JavaScript ``mulberry32`` PRNG (`src/app/rng.js`)
with a NumPy ``PCG64`` Generator. Cross-language bit-identical output is
**not** a goal — we adopt the weaker "Tier 1' determinism" contract spelled
out in ``docs/ai-research/python-migration-conventions.md``:

* Same seed × same scenario → bit-identical Python trajectory.
* The Python and JavaScript builds may diverge because the underlying RNG
  differs (PCG64 vs mulberry32).

The class :class:`SeededRng` exposes the small surface area used by the
simulation: a uniform ``next()``, an inclusive integer pick, a sequence
pick, namespace-derived sub-generators, and a serializable ``state``
property for snapshot/replay.

Notes
-----
``deriveRngSeed(base, namespace)`` uses ``hashlib.blake2b(digest_size=8)``
so the derived integer is stable across processes and Python versions
(Python's builtin ``hash()`` is randomized via PYTHONHASHSEED and therefore
unsuitable for reproducibility).
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from typing import Any, TypedDict

import numpy as np

__all__ = ["SeededRng", "deriveRngSeed", "RngState"]

# A 64-bit mask matching the JS `>>> 0` cast width when normalizing seeds.
# We deliberately produce a 64-bit value (vs JS 32-bit) because PCG64 is
# happiest with a wider entropy source.
_SEED_WIDTH = 64
_SEED_MASK = (1 << _SEED_WIDTH) - 1

# Fallback when the normalized seed lands on zero. Mirrors the JS sentinel
# `0x9e3779b9` (golden-ratio constant) extended to 64 bits.
_FALLBACK_SEED = 0x9E3779B97F4A7C15

# Hash personalization for blake2b — keeping it constant means
# `deriveRngSeed` output is stable across Python releases.
_BLAKE2_PERSON = b"utopia\x00\x00"


class RngState(TypedDict):
    """Serializable snapshot of a :class:`SeededRng`.

    Attributes
    ----------
    initial_seed : int
        The seed originally passed to the constructor, after normalization.
    bit_generator : str
        Name of the underlying NumPy bit generator (always ``"PCG64"``).
    state : dict
        ``Generator.bit_generator.state`` — the raw PCG state dict from
        NumPy (already JSON-serializable).
    calls : int
        Number of times :meth:`SeededRng.next` has been invoked.
    """

    initial_seed: int
    bit_generator: str
    state: dict[str, Any]
    calls: int


def _normalize_seed(seed: int | str | None) -> int:
    """Normalize ``seed`` to a stable non-zero 64-bit integer.

    Parameters
    ----------
    seed
        Integer, string, or ``None``. Strings are hashed with
        ``blake2b(digest_size=8)`` so callers may pass arbitrary names.

    Returns
    -------
    int
        A 64-bit unsigned integer suitable for ``np.random.PCG64``.
    """
    if seed is None:
        text = "utopia"
    elif isinstance(seed, (int, np.integer)):
        value = int(seed) & _SEED_MASK
        return value if value != 0 else _FALLBACK_SEED
    elif isinstance(seed, float):
        if not np.isfinite(seed):
            text = "utopia"
        else:
            value = int(seed) & _SEED_MASK
            return value if value != 0 else _FALLBACK_SEED
    else:
        text = str(seed)

    digest = hashlib.blake2b(
        text.encode("utf-8"),
        digest_size=8,
        person=_BLAKE2_PERSON,
    ).digest()
    value = int.from_bytes(digest, byteorder="big", signed=False)
    value &= _SEED_MASK
    return value if value != 0 else _FALLBACK_SEED


def deriveRngSeed(base_seed: int | str | None, namespace: str = "runtime") -> int:
    """Derive a deterministic integer sub-seed from ``(base_seed, namespace)``.

    The output is fully reproducible across processes, Python versions, and
    operating systems. The implementation is BLAKE2b-based rather than using
    Python's built-in :func:`hash` (which is randomized via
    ``PYTHONHASHSEED``).

    Parameters
    ----------
    base_seed
        Any integer or string acceptable to :func:`_normalize_seed`.
    namespace
        Short identifier such as ``"simulation"`` or ``"npc-policy"``.

    Returns
    -------
    int
        Non-zero 64-bit unsigned integer.

    Examples
    --------
    >>> deriveRngSeed(2026, "simulation") == deriveRngSeed(2026, "simulation")
    True
    >>> deriveRngSeed(2026, "simulation") != deriveRngSeed(2026, "ai")
    True
    """
    base = _normalize_seed(base_seed)
    payload = (
        base.to_bytes(8, byteorder="big", signed=False)
        + b"\x00"
        + str(namespace).encode("utf-8")
    )
    digest = hashlib.blake2b(payload, digest_size=8, person=_BLAKE2_PERSON).digest()
    value = int.from_bytes(digest, byteorder="big", signed=False) & _SEED_MASK
    return value if value != 0 else _FALLBACK_SEED


# Snake-case alias used by the rest of the Python codebase. ``deriveRngSeed``
# is kept (camelCase) because Phase-1 scope mandates it as the public
# Python-side identifier; downstream modules should prefer
# :func:`derive_rng_seed`.
derive_rng_seed = deriveRngSeed


class SeededRng:
    """Deterministic PRNG wrapping ``numpy.random.Generator(PCG64)``.

    The class mirrors the JS ``SeededRng`` surface (``next``, ``int``,
    ``pick``) and adds :meth:`derive` for namespaced sub-generators — the
    pattern used to give each subsystem (worker AI, weather, scenario
    factory…) an isolated stream while still being reproducible from a
    single root seed.

    Parameters
    ----------
    seed
        Integer or string seed. Strings are hashed with BLAKE2b so any
        readable identifier (``"utopia"``, ``"benchmark-paper"``) works.

    Examples
    --------
    >>> rng = SeededRng(seed=0xC0FFEE)
    >>> rng.next() == SeededRng(seed=0xC0FFEE).next()
    True
    """

    __slots__ = ("_initial_seed", "_generator", "_calls")

    def __init__(self, seed: int | str | None = "utopia") -> None:
        self._initial_seed: int = _normalize_seed(seed)
        self._generator: np.random.Generator = np.random.Generator(
            np.random.PCG64(self._initial_seed)
        )
        self._calls: int = 0

    # ---- core API ---------------------------------------------------------

    def next(self) -> float:
        """Return the next float uniformly drawn from ``[0, 1)``.

        Returns
        -------
        float
            A Python ``float`` (NumPy scalar coerced via ``float()``).
        """
        value = float(self._generator.random())
        self._calls += 1
        return value

    def next_int(self, lo: int, hi: int) -> int:
        """Return a uniform integer in ``[lo, hi]`` inclusive.

        Parameters
        ----------
        lo, hi
            Inclusive bounds. If ``hi <= lo``, returns ``lo`` (mirrors the
            JS behaviour of clamping degenerate ranges).
        """
        lo_i = int(lo)
        hi_i = int(hi)
        if hi_i <= lo_i:
            return lo_i
        self._calls += 1
        # ``integers(low, high)`` is half-open by default; pass ``high+1`` for
        # an inclusive sample.
        return int(self._generator.integers(lo_i, hi_i + 1))

    def pick(self, seq: Sequence[Any]) -> Any:
        """Return a uniformly chosen element from ``seq``.

        Raises
        ------
        ValueError
            If ``seq`` is empty.
        """
        n = len(seq)
        if n == 0:
            raise ValueError("SeededRng.pick: sequence must be non-empty")
        idx = self.next_int(0, n - 1)
        return seq[idx]

    # ---- ergonomic helpers (parity with JS) ------------------------------

    def chance(self, probability: float) -> bool:
        """Return ``True`` with probability ``probability`` (clamped to [0,1])."""
        p = max(0.0, min(1.0, float(probability)))
        return self.next() < p

    def range(self, low: float, high: float) -> float:
        """Return a uniform float in ``[low, high)``."""
        return float(low) + (float(high) - float(low)) * self.next()

    def jitter(self, amount: float) -> float:
        """Return a symmetric uniform offset in ``[-amount, +amount)``."""
        return (self.next() * 2.0 - 1.0) * float(amount)

    # ---- derivation -------------------------------------------------------

    def derive(self, namespace: str) -> SeededRng:
        """Return a fresh :class:`SeededRng` namespaced under ``namespace``.

        The derived seed is computed from ``(initial_seed, namespace)`` via
        :func:`deriveRngSeed`, so distinct namespaces yield distinct streams
        but the same namespace under the same root reproduces exactly.
        """
        return SeededRng(seed=deriveRngSeed(self._initial_seed, namespace))

    # ---- introspection ----------------------------------------------------

    @property
    def initial_seed(self) -> int:
        """The normalized seed used to construct this RNG."""
        return self._initial_seed

    @property
    def calls(self) -> int:
        """Number of ``next()`` invocations so far."""
        return self._calls

    @property
    def generator(self) -> np.random.Generator:
        """The underlying ``numpy.random.Generator``.

        Exposed so callers needing NumPy-native helpers
        (``permutation``, ``choice``, ``normal``, vectorized
        ``random(size=N)``…) can draw from the same seeded stream
        without bypassing the deterministic contract. Any draw made
        through this generator advances the shared state but is **not**
        reflected in :attr:`calls` (which counts only ``next()``).
        """
        return self._generator

    @property
    def state(self) -> RngState:
        """Return a JSON-serializable snapshot of the internal state."""
        bg_state = self._generator.bit_generator.state
        return RngState(
            initial_seed=self._initial_seed,
            bit_generator=str(bg_state.get("bit_generator", "PCG64")),
            state=dict(bg_state),
            calls=self._calls,
        )

    def snapshot(self) -> RngState:
        """Alias for :attr:`state` matching the JS method name."""
        return self.state

    def restore(self, snapshot: RngState) -> None:
        """Restore the generator from a :meth:`snapshot`.

        Parameters
        ----------
        snapshot
            A previously returned ``state`` dict. Missing keys fall back to
            the current state (mirrors the JS lenient ``restore``).
        """
        if "state" in snapshot and snapshot["state"]:
            self._generator.bit_generator.state = snapshot["state"]
        if "initial_seed" in snapshot:
            self._initial_seed = int(snapshot["initial_seed"])
        if "calls" in snapshot:
            self._calls = max(0, int(snapshot["calls"]))

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return f"SeededRng(initial_seed={self._initial_seed}, calls={self._calls})"
