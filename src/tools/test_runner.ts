import { runCommandSafe } from './command_runner.js';
import { KotefConfig } from '../core/config.js';

export type FailureKind = 'compilation' | 'test_failure' | 'timeout' | 'runtime_error' | 'unknown';

export interface TestRunResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    passed: boolean;
    failureKind?: FailureKind;
    failureSummary?: string;
}

interface FailureClassifier {
    classify(stdout: string, stderr: string, exitCode: number, timedOut: boolean): { kind: FailureKind; summary: string } | null;
}

const classifiers: FailureClassifier[] = [
    // Timeout Classifier
    {
        classify: (stdout, stderr, exitCode, timedOut) => {
            const combined = (stdout + '\n' + stderr).toLowerCase();
            if (timedOut || combined.includes('etimedout') || combined.includes('timed out')) {
                return { kind: 'timeout', summary: 'Process timed out.' };
            }
            return null;
        }
    },
    // Pytest Classifier
    {
        classify: (stdout, stderr) => {
            const combined = stdout + '\n' + stderr;
            if (combined.includes('ERRORS =') || combined.includes('FAILED (')) {
                return { kind: 'test_failure', summary: 'Pytest failures detected.' };
            }
            if (combined.includes('E   AssertionError') || combined.includes('E   TypeError')) {
                return { kind: 'test_failure', summary: 'Pytest assertion/type error.' };
            }
            return null;
        }
    },
    // Go Test Classifier
    {
        classify: (stdout, stderr) => {
            const combined = stdout + '\n' + stderr;
            if (combined.includes('FAIL\t') || combined.includes('--- FAIL:')) {
                return { kind: 'test_failure', summary: 'Go test failed.' };
            }
            if (combined.includes('build failed') || combined.includes('undefined:')) {
                return { kind: 'compilation', summary: 'Go build failed.' };
            }
            return null;
        }
    },
    // Cargo Test Classifier
    {
        classify: (stdout, stderr) => {
            const combined = stdout + '\n' + stderr;
            if (combined.includes('test result: FAILED')) {
                return { kind: 'test_failure', summary: 'Rust test failed.' };
            }
            if (combined.includes('error[E') || combined.includes('error: could not compile')) {
                return { kind: 'compilation', summary: 'Rust compilation error.' };
            }
            return null;
        }
    },
    // Maven/Gradle Classifier
    {
        classify: (stdout, stderr) => {
            const combined = stdout + '\n' + stderr;
            if (combined.includes('BUILD FAILURE') || combined.includes('Task failed with an exception')) {
                // Could be compilation or test
                if (combined.includes('Compilation failure')) {
                    return { kind: 'compilation', summary: 'Java compilation failed.' };
                }
                return { kind: 'test_failure', summary: 'Java build/test failed.' };
            }
            if (combined.includes('Tests run:') && combined.includes('Failures:')) {
                const match = combined.match(/Failures: (\d+)/);
                if (match && parseInt(match[1], 10) > 0) {
                    return { kind: 'test_failure', summary: 'Java tests failed.' };
                }
            }
            return null;
        }
    },
    // Default/Generic Classifier
    {
        classify: (stdout, stderr, exitCode) => {
            const combined = (stdout + '\n' + stderr).toLowerCase();

            if (combined.includes('typescript error') || combined.includes('ts2') || combined.includes('syntaxerror')) {
                return { kind: 'compilation', summary: 'Compilation or syntax error detected.' };
            }

            if (combined.includes('failed') && combined.includes('test')) {
                return { kind: 'test_failure', summary: 'One or more tests failed.' };
            }

            if (exitCode !== 0) {
                return { kind: 'runtime_error', summary: `Process exited with code ${exitCode}.` };
            }

            return { kind: 'unknown', summary: 'Unknown failure.' };
        }
    }
];

function classifyFailure(stdout: string, stderr: string, exitCode: number, timedOut: boolean): { kind: FailureKind; summary: string } {
    for (const classifier of classifiers) {
        const result = classifier.classify(stdout, stderr, exitCode, timedOut);
        if (result) {
            return result;
        }
    }
    return { kind: 'unknown', summary: 'Unknown failure.' };
}

/**
 * Executes a shell command (e.g., test runner) within the project root.
 * Enforces a timeout to prevent hanging processes.
 * Uses CommandRunner for robust execution.
 */
export async function runCommand(
    cfg: KotefConfig,
    command: string,
    timeoutMs: number = 30000
): Promise<TestRunResult> {
    if (cfg.mockMode) {
        return {
            command,
            exitCode: 0,
            stdout: 'Mock test passed',
            stderr: '',
            passed: true
        };
    }

    const result = await runCommandSafe(command, {
        cwd: cfg.rootDir,
        timeoutMs
    });

    if (result.exitCode === 0) {
        return {
            command,
            exitCode: 0,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
            passed: true
        };
    } else {
        const { kind, summary } = classifyFailure(result.stdout, result.stderr, result.exitCode, result.timedOut);
        return {
            command,
            exitCode: result.exitCode,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
            passed: false,
            failureKind: kind,
            failureSummary: summary
        };
    }
}
