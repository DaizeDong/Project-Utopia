"""Tests for the pure-Python pub/sub bus."""

from __future__ import annotations

import pytest

from project_utopia.simulation.meta.game_event_bus import (
    EVENT_TYPES,
    MAX_EVENTS,
    emit_event,
    get_event_log,
    init_event_bus,
    on_event,
)


def _empty_state() -> dict:
    return {"metrics": {"timeSec": 0.0}}


class TestInitAndEmit:
    def test_init_creates_shape(self) -> None:
        state = _empty_state()
        init_event_bus(state)
        assert "events_bus" in state
        assert state["events_bus"]["log"] == []
        assert state["events_bus"]["listeners"] == {}

    def test_emit_appends_to_log(self) -> None:
        state = _empty_state()
        emit_event(state, EVENT_TYPES["WORKER_DIED"], {"id": "w1"})
        log = get_event_log(state)
        assert len(log) == 1
        assert log[0]["type"] == "worker_died"
        assert log[0]["detail"]["id"] == "w1"

    def test_emit_caps_log_at_max_events(self) -> None:
        state = _empty_state()
        for _ in range(MAX_EVENTS + 50):
            emit_event(state, EVENT_TYPES["WORKER_DIED"])
        assert len(get_event_log(state)) == MAX_EVENTS


class TestSubscribe:
    def test_handler_receives_event(self) -> None:
        state = _empty_state()
        received: list[dict] = []
        on_event(state, EVENT_TYPES["FOOD_SHORTAGE"], received.append)
        emit_event(state, EVENT_TYPES["FOOD_SHORTAGE"], {"food": 5})
        assert len(received) == 1
        assert received[0]["detail"]["food"] == 5

    def test_duplicate_subscribe_is_idempotent(self) -> None:
        """T1-3 fix: registering the same handler twice does NOT duplicate it."""
        state = _empty_state()
        calls = [0]

        def handler(_evt: dict) -> None:
            calls[0] += 1

        on_event(state, EVENT_TYPES["FOOD_SHORTAGE"], handler)
        on_event(state, EVENT_TYPES["FOOD_SHORTAGE"], handler)
        emit_event(state, EVENT_TYPES["FOOD_SHORTAGE"])
        assert calls[0] == 1

    def test_unsubscribe(self) -> None:
        state = _empty_state()
        received: list[dict] = []
        unsub = on_event(state, EVENT_TYPES["FOOD_SHORTAGE"], received.append)
        emit_event(state, EVENT_TYPES["FOOD_SHORTAGE"])
        unsub()
        emit_event(state, EVENT_TYPES["FOOD_SHORTAGE"])
        assert len(received) == 1

    def test_handler_order_is_registration_order(self) -> None:
        """Deterministic delivery — sorted by registration order, not callable identity."""
        state = _empty_state()
        order: list[str] = []
        on_event(state, EVENT_TYPES["DAY_BEGAN"], lambda _e: order.append("zzz_late"))
        on_event(state, EVENT_TYPES["DAY_BEGAN"], lambda _e: order.append("aaa_early"))
        emit_event(state, EVENT_TYPES["DAY_BEGAN"])
        assert order == ["zzz_late", "aaa_early"]
