export function range(start, end) {
  // Expected: inclusive of start, exclusive of end, ascending only.
  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new TypeError('start and end must be numbers');
  }

  const out = [];
  for (let i = start; i <= end; i++) { // BUG: off-by-one, includes end
    out.push(i);
  }
  return out;
}
