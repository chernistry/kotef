export function average(nums) {
  if (!Array.isArray(nums)) {
    throw new TypeError('nums must be an array');
  }
  if (nums.length === 0) {
    return 0; // BUG: should probably throw or return null per ticket
  }

  const sum = nums.reduce((acc, n) => acc + n, 0);
  return sum / nums.length;
}
