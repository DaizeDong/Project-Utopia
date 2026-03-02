export function createReplayService(maxEvents = 400) {
  const events = [];
  return {
    push(event) {
      events.push({
        ts: Date.now(),
        ...event,
      });
      if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    },
    list() {
      return events.slice();
    },
    clear() {
      events.length = 0;
    },
    exportJson() {
      return `${JSON.stringify(events, null, 2)}\n`;
    },
  };
}
