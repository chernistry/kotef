export const HEAVY_COMMAND_PATTERNS = [
    /\bpytest\b/i,
    /\bnpm\s+test\b/i,
    /\bpnpm\s+test\b/i,
    /\byarn\s+test\b/i,
    /\bmypy\b/i,
    /\bpylint\b/i,
    /\bruff\b/i,
    /\bbandit\b/i,
    /\bflake8\b/i,
    /\bblack\b/i,
    /\bpre-commit\b/i,
    /\bflet\s+run\b/i,
    /\bplaywright\b/i
];

export const LOOKS_HEAVY_COMMAND = (cmd: string) => HEAVY_COMMAND_PATTERNS.some((regex) => regex.test(cmd));
