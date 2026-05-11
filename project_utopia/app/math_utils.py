"""Small numeric helpers (port of ``src/app/math.js``).

The module is named ``math_utils`` to avoid shadowing the stdlib
``math`` module. All routines operate on plain Python scalars / dicts so
they remain hot-path-friendly without importing NumPy.

The 2D vectors use the simulation's tile coordinate convention ``(x, z)``
(matching the JS source).
"""

from __future__ import annotations

import math
from typing import TypedDict

__all__ = [
    "Vec2",
    "clamp",
    "lerp",
    "distance_2d",
    "normalize_2d",
    "add_2d",
    "sub_2d",
    "scale_2d",
]


class Vec2(TypedDict):
    """2D vector in the simulation's ``(x, z)`` plane."""

    x: float
    z: float


def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp ``value`` to the closed interval ``[lo, hi]``.

    Examples
    --------
    >>> clamp(5, 0, 10)
    5
    >>> clamp(-1, 0, 10)
    0
    >>> clamp(11, 0, 10)
    10
    """
    return max(lo, min(hi, value))


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation: ``a + (b - a) * t``.

    ``t`` is **not** clamped — pass ``clamp(t, 0, 1)`` if you need that.
    """
    return a + (b - a) * t


def distance_2d(a: Vec2, b: Vec2) -> float:
    """Euclidean distance between two ``(x, z)`` points."""
    dx = a["x"] - b["x"]
    dz = a["z"] - b["z"]
    return math.hypot(dx, dz)


def normalize_2d(v: Vec2) -> Vec2:
    """Return ``v`` rescaled to unit length, or ``{x:0,z:0}`` if near zero."""
    length = math.hypot(v["x"], v["z"])
    if length < 1e-8:
        return {"x": 0.0, "z": 0.0}
    return {"x": v["x"] / length, "z": v["z"] / length}


def add_2d(a: Vec2, b: Vec2) -> Vec2:
    """Component-wise sum."""
    return {"x": a["x"] + b["x"], "z": a["z"] + b["z"]}


def sub_2d(a: Vec2, b: Vec2) -> Vec2:
    """Component-wise difference (``a - b``)."""
    return {"x": a["x"] - b["x"], "z": a["z"] - b["z"]}


def scale_2d(v: Vec2, s: float) -> Vec2:
    """Multiply each component of ``v`` by scalar ``s``."""
    return {"x": v["x"] * s, "z": v["z"] * s}
