function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, override) {
  if (!isObject(base)) return override;
  if (!isObject(override)) return base;

  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      out[key] = value.slice();
      continue;
    }
    if (isObject(value)) {
      out[key] = deepMerge(isObject(base[key]) ? base[key] : {}, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}
