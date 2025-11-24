import process from 'node:process';

export function formatMessage(input, options = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('message is required');
  }
  // BUG: ignores uppercase option
  const rendered = input;
  return options.prefix ? `${options.prefix}${rendered}` : rendered;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const text = args.join(' ');
  console.log(formatMessage(text, {}));
}
