import { AgentState, FunctionalCheck } from '../state.js';

export function isFunctionalProbe(command: string): boolean {
    const lower = command.toLowerCase();
    // Common patterns for "running the app" rather than just testing it
    const probePatterns = [
        /\bnpm\s+run\s+dev\b/,
        /\bnpm\s+start\b/,
        /\byarn\s+dev\b/,
        /\byarn\s+start\b/,
        /\bpnpm\s+dev\b/,
        /\bpnpm\s+start\b/,
        /\bpython\s+app\.py\b/,
        /\bpython\s+main\.py\b/,
        /\bpython\s+-m\s+[\w.]+\b/,
        /\bflet\s+run\b/,
        /\bgo\s+run\s+\./, // dot is not a word char, so \b at end fails if string ends there
        /\bcargo\s+run\b/,
        /\bnode\s+[\w/]+\.js\b/,
        /\bts-node\s+[\w/]+\.ts\b/,
        /\bvite\b/ // bare vite command
    ];

    // Exclude obvious test/lint commands even if they match above (unlikely but safe)
    if (lower.includes('test') || lower.includes('lint') || lower.includes('build')) {
        return false;
    }

    return probePatterns.some(p => p.test(lower));
}

export function recordFunctionalProbe(
    command: string,
    result: { exitCode: number; stdout: string; stderr: string },
    node: 'coder' | 'verifier'
): FunctionalCheck[] {
    if (!isFunctionalProbe(command)) {
        return [];
    }

    return [{
        command,
        exitCode: result.exitCode,
        timestamp: Date.now(),
        node,
        stdoutSample: result.stdout ? result.stdout.slice(0, 200) : undefined,
        stderrSample: result.stderr ? result.stderr.slice(0, 200) : undefined
    }];
}

export function deriveFunctionalStatus(checks: FunctionalCheck[] | undefined): boolean {
    if (!checks || checks.length === 0) return false;

    // Look at recent checks (last 3)
    const recent = checks.slice(-3);

    // If any recent check passed (exit 0), we consider it functionally OK-ish,
    // UNLESS there are obvious crash markers in stderr of the *passing* check (rare)
    // or if the *latest* check failed.
    // Actually, let's be more lenient: if ANY of the last 3 passed, it's good.
    // This accounts for flakiness or user trying different commands.
    const hasSuccess = recent.some(c => c.exitCode === 0);

    if (!hasSuccess) return false;

    // Optional: Check for crash markers even in success (some apps exit 0 but log errors)
    // For now, trust exit code 0.
    return true;
}
