// Stored only as display metadata; never rewrites the source HTML.
export function validWorkFraming(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ranges = {
    width: [320, 3840],
    height: [240, 3840],
    zoom: [0.25, 4],
    offsetX: [-1, 1],
    offsetY: [-1, 1],
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(ranges, key)))
    return false;
  return (
    Object.entries(ranges).every(
      ([key, [min, max]]) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        value[key] >= min &&
        value[key] <= max,
    ) &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height)
  );
}
