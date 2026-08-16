/*
 * Shared storage helper — plain global script, no build step, matching the
 * rest of this repo's convention (see solace/data.js, solace/app.js).
 *
 * Every consumer namespaces its own keys (e.g. "blake_command_tasks",
 * "solace.settings") — this just centralizes the try/catch-around-
 * localStorage boilerplate so a private-mode browser or a quota error
 * degrades to "nothing persisted" instead of a thrown exception.
 */
const SharedStorage = (function () {
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return { read, write, remove };
})();
