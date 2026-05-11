"""Tests for :mod:`project_utopia.app.math_utils`.

These mirror the ad-hoc JS expectations from the math helpers in
``src/app/math.js``: clamp/lerp boundary behaviour, 2D vector helpers,
and zero-length normalize fallback.
"""

from __future__ import annotations

import math

from project_utopia.app.math_utils import (
    add_2d,
    clamp,
    distance_2d,
    lerp,
    normalize_2d,
    scale_2d,
    sub_2d,
)


class TestClamp:
    def test_within_range(self) -> None:
        assert clamp(5, 0, 10) == 5

    def test_below_min(self) -> None:
        assert clamp(-3, 0, 10) == 0

    def test_above_max(self) -> None:
        assert clamp(11, 0, 10) == 10

    def test_negative_range(self) -> None:
        assert clamp(-5, -10, -1) == -5
        assert clamp(-20, -10, -1) == -10
        assert clamp(0, -10, -1) == -1

    def test_float_range(self) -> None:
        assert clamp(0.5, 0.0, 1.0) == 0.5
        assert clamp(1.2, 0.0, 1.0) == 1.0


class TestLerp:
    def test_endpoints(self) -> None:
        assert lerp(0, 10, 0) == 0
        assert lerp(0, 10, 1) == 10

    def test_midpoint(self) -> None:
        assert lerp(0, 10, 0.5) == 5

    def test_extrapolation_not_clamped(self) -> None:
        # JS source explicitly does not clamp t.
        assert lerp(0, 10, 2) == 20
        assert lerp(0, 10, -1) == -10


class TestDistance2D:
    def test_axis_aligned(self) -> None:
        assert distance_2d({"x": 0, "z": 0}, {"x": 3, "z": 0}) == 3.0
        assert distance_2d({"x": 0, "z": 0}, {"x": 0, "z": 4}) == 4.0

    def test_pythagorean(self) -> None:
        assert distance_2d({"x": 0, "z": 0}, {"x": 3, "z": 4}) == 5.0

    def test_zero(self) -> None:
        assert distance_2d({"x": 1.5, "z": -2.0}, {"x": 1.5, "z": -2.0}) == 0.0


class TestNormalize2D:
    def test_unit_vector_stays_unit(self) -> None:
        v = normalize_2d({"x": 1.0, "z": 0.0})
        assert math.isclose(v["x"], 1.0)
        assert math.isclose(v["z"], 0.0)

    def test_arbitrary_vector_rescaled_to_one(self) -> None:
        v = normalize_2d({"x": 3.0, "z": 4.0})
        length = math.hypot(v["x"], v["z"])
        assert math.isclose(length, 1.0, rel_tol=1e-9)

    def test_zero_vector_returns_zero(self) -> None:
        v = normalize_2d({"x": 0.0, "z": 0.0})
        assert v == {"x": 0.0, "z": 0.0}

    def test_near_zero_returns_zero(self) -> None:
        v = normalize_2d({"x": 1e-10, "z": -1e-10})
        assert v == {"x": 0.0, "z": 0.0}


class TestVectorOps:
    def test_add(self) -> None:
        assert add_2d({"x": 1.0, "z": 2.0}, {"x": 3.0, "z": 4.0}) == {"x": 4.0, "z": 6.0}

    def test_sub(self) -> None:
        assert sub_2d({"x": 1.0, "z": 2.0}, {"x": 3.0, "z": 4.0}) == {"x": -2.0, "z": -2.0}

    def test_scale(self) -> None:
        assert scale_2d({"x": 1.0, "z": 2.0}, 3.0) == {"x": 3.0, "z": 6.0}

    def test_scale_by_zero(self) -> None:
        assert scale_2d({"x": 5.0, "z": -7.0}, 0.0) == {"x": 0.0, "z": -0.0}
