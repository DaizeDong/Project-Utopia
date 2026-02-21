import { nextId } from "../../app/id.js";

export function enqueueEvent(state, type, payload = {}, durationSec = 18, intensity = 1) {
  state.events.queue.push({
    id: nextId("event"),
    type,
    status: "prepare",
    elapsedSec: 0,
    durationSec,
    intensity,
    payload,
  });
}
