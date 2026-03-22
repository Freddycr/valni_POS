const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_CACHE_MAX_ENTRIES = 200;

function nowMs() {
  return Date.now();
}

export function createQueryCache(options = {}) {
  const ttlMs = Number(options.ttlMs || DEFAULT_CACHE_TTL_MS);
  const maxEntries = Number(options.maxEntries || DEFAULT_CACHE_MAX_ENTRIES);
  const store = new Map();
  const inFlight = new Map();

  const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    inflightHits: 0,
  };

  function pruneExpired() {
    const now = nowMs();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  function pruneOverflow() {
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey == null) break;
      store.delete(oldestKey);
      stats.evictions += 1;
    }
  }

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      stats.misses += 1;
      return null;
    }
    if (entry.expiresAt <= nowMs()) {
      store.delete(key);
      stats.misses += 1;
      return null;
    }
    // Refresh LRU order.
    store.delete(key);
    store.set(key, entry);
    stats.hits += 1;
    return entry.value;
  }

  function set(key, value) {
    const entry = {
      value,
      expiresAt: nowMs() + ttlMs,
    };
    if (store.has(key)) {
      store.delete(key);
    }
    store.set(key, entry);
    stats.sets += 1;
    pruneOverflow();
  }

  function getInFlight(key) {
    const pending = inFlight.get(key) || null;
    if (pending) stats.inflightHits += 1;
    return pending;
  }

  function setInFlight(key, promise) {
    inFlight.set(key, promise);
  }

  function clearInFlight(key) {
    inFlight.delete(key);
  }

  function getStats() {
    pruneExpired();
    return {
      ...stats,
      size: store.size,
      inFlight: inFlight.size,
      ttlMs,
      maxEntries,
    };
  }

  return {
    get,
    set,
    getInFlight,
    setInFlight,
    clearInFlight,
    getStats,
    pruneExpired,
  };
}

export { DEFAULT_CACHE_TTL_MS, DEFAULT_CACHE_MAX_ENTRIES };

