import { LONG_RUN_PROFILE } from "../config/longRunProfile.js";

const SEGMENT_ACTIONS = Object.freeze([
  Object.freeze({ offsetSec: 5, type: "start_segment" }),
  Object.freeze({ offsetSec: 30, type: "survey_pan_zoom" }),
  Object.freeze({ offsetSec: 70, type: "inspect_worker" }),
  Object.freeze({ offsetSec: 100, type: "inspect_frontier" }),
  Object.freeze({ offsetSec: 150, type: "repair_primary_route" }),
  Object.freeze({ offsetSec: 290, type: "support_depot_lane" }),
  Object.freeze({ offsetSec: 500, type: "address_shortage" }),
  Object.freeze({ offsetSec: 770, type: "fortify_corridor" }),
  Object.freeze({ offsetSec: 990, type: "observe_ai_panels" }),
  Object.freeze({ offsetSec: 1040, type: "snapshot_roundtrip" }),
  Object.freeze({ offsetSec: 1120, type: "final_segment_observe" }),
]);

export function buildOperatorActionSchedule(profile = LONG_RUN_PROFILE.operator) {
  const defaultSegmentDurationSec = Number(LONG_RUN_PROFILE.operator.segmentDurationSec);
  const segmentDurationSec = Number(profile.segmentDurationSec ?? LONG_RUN_PROFILE.operator.segmentDurationSec);
  const scale = defaultSegmentDurationSec > 0 ? segmentDurationSec / defaultSegmentDurationSec : 1;
  const configuredSegments = Array.isArray(profile.segments) && profile.segments.length > 0
    ? profile.segments
    : LONG_RUN_PROFILE.operator.segments;
  const durationSec = Number(profile.durationSec ?? configuredSegments.length * segmentDurationSec);
  const segments = configuredSegments.filter((_segment, segmentIndex) => segmentIndex * segmentDurationSec < durationSec);
  const schedule = [];
  segments.forEach((segment, segmentIndex) => {
    const segmentStartSec = segmentIndex * segmentDurationSec;
    for (const action of SEGMENT_ACTIONS) {
      schedule.push({
        atSec: segmentStartSec + Math.max(1, Math.round(action.offsetSec * scale)),
        segmentIndex,
        templateId: segment.templateId,
        segmentLabel: segment.label,
        type: action.type,
      });
    }
  });
  return schedule.sort((a, b) => a.atSec - b.atSec);
}

export function drainDueOperatorActions(schedule, elapsedSec, cursor = 0) {
  const due = [];
  let nextCursor = cursor;
  while (nextCursor < schedule.length && schedule[nextCursor].atSec <= elapsedSec) {
    due.push(schedule[nextCursor]);
    nextCursor += 1;
  }
  return {
    due,
    nextCursor,
    done: nextCursor >= schedule.length,
  };
}
