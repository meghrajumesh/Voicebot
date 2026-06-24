const rateMap = new Map();
const CLEANUP_INTERVAL = 60_000;

let lastCleanup = Date.now();

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    for (const [key, entry] of rateMap) {
        if (now - entry.windowStart > entry.windowMs) {
            rateMap.delete(key);
        }
    }
    lastCleanup = now;
}

export function rateLimit({ windowMs, max, key }) {
    cleanup();

    const now = Date.now();
    const entry = rateMap.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
        rateMap.set(key, { count: 1, windowStart: now, windowMs });
        return { allowed: true, remaining: max - 1 };
    }

    entry.count += 1;
    if (entry.count > max) {
        return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: max - entry.count };
}
