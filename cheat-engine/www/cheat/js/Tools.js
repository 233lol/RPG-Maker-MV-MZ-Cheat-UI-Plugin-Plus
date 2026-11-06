// @ts-check
export function cloneObject(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  const clone = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === "object") {
      clone[key] = cloneObject(val);
    } else {
      clone[key] = val;
    }
  }

  return clone;
}
