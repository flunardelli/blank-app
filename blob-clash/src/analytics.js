// Analytics hook: every gameplay event goes through track(). Events are kept in a small
// in-memory ring buffer and logged to the console with ?debug. To measure the real funnel
// (where players drop, which mechanic kills them), connect a backend in `send`.
const DEBUG = new URLSearchParams(location.search).has('debug');
const buffer = [];

function send(_event) {
  // e.g. gtag('event', event.name, event) or posthog.capture(event.name, event)
}

export function track(name, props = {}) {
  const event = { name, t: Date.now(), ...props };
  buffer.push(event);
  if (buffer.length > 200) buffer.shift();
  if (DEBUG) console.debug('[track]', name, props);
  send(event);
}

export const recentEvents = () => [...buffer];
