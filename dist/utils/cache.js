/**
 * Simple Memory Cache
 * Basic 5-minute caching as specified in enhancement prompt
 * LLM-First Approach: Simple and reliable
 */

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes only

/**
 * Get item from cache
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() < item.expires) {
    return item.value;
  }
  cache.delete(key);
  return null;
}

/**
 * Set item in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds (optional, defaults to 5 minutes)
 */
function setCached(key, value, ttl = CACHE_TTL) {
  cache.set(key, {
    value,
    expires: Date.now() + ttl
  });
}

/**
 * Clear specific cache key
 * @param {string} key - Cache key to clear
 */
function clearCached(key) {
  cache.delete(key);
}

/**
 * Clear all cache
 */
function clearAllCache() {
  cache.clear();
}

/**
 * Get cache statistics
 * @returns {object} - Cache stats
 */
function getCacheStats() {
  const now = Date.now();
  let validItems = 0;
  let expiredItems = 0;
  
  for (const [key, item] of cache.entries()) {
    if (now < item.expires) {
      validItems++;
    } else {
      expiredItems++;
    }
  }
  
  return {
    totalItems: cache.size,
    validItems,
    expiredItems,
    hitRate: getCacheHitRate()
  };
}

// Simple hit rate tracking
let cacheHits = 0;
let cacheMisses = 0;

function getCacheHitRate() {
  const total = cacheHits + cacheMisses;
  return total > 0 ? (cacheHits / total * 100).toFixed(2) : 0;
}

/**
 * Wrapped cache function that tracks hits/misses
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null
 */
function getCachedWithStats(key) {
  const result = getCached(key);
  if (result !== null) {
    cacheHits++;
  } else {
    cacheMisses++;
  }
  return result;
}

/**
 * Cache cleanup - remove expired items
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now >= item.expires) {
      cache.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupCache, 60 * 1000);

export {
  getCached,
  setCached,
  clearCached,
  clearAllCache,
  getCacheStats,
  getCachedWithStats,
  cleanupCache
}; 