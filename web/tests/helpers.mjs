// Birim testleri için bellek içi depolama (util.storage ile aynı arayüz; JSON gidiş-dönüşüyle gerçekçi)
export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    get(key, fallback) {
      if (!map.has(key)) return fallback;
      try {
        return JSON.parse(map.get(key));
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      map.set(key, JSON.stringify(value));
    },
    raw(key) {
      return map.has(key) ? JSON.parse(map.get(key)) : undefined;
    },
  };
}
