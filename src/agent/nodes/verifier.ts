import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { runCommand } from '../../tools/test_runner.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export function verifierNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('verifier');
        log.info('Verifier node started');

        const profile = state.runProfile || 'fast';

        // Cheap profile: optionally skip heavy tests and just report.
        if (profile === 'smoke') {
            log.info('Smoke profile detected; skipping automated tests.');
            return {
                testResults: {
                    command: 'SKIPPED (smoke profile)',
                    exitCode: 0,
                    stdout: 'Tests not run in smoke profile; user should run primary test command manually.',
                    stderr: '',
                    passed: true
                },
                done: true
            };
        }

        async function detectTestCommand(): Promise<string> {
            const rootDir = cfg.rootDir;

            // If Python-style project is detected, prefer pytest.
            try {
                const pyprojectPath = path.join(rootDir, 'pyproject.toml');
                await fs.access(pyprojectPath);
                return 'pytest';
            } catch {
                // ignore
            }

            try {
                const testsDir = path.join(rootDir, 'tests');
                await fs.access(testsDir);
                return 'pytest';
            } catch {
                // ignore
            }

            // Fallback to npm if package.json exists.
            try {
                const pkgPath = path.join(rootDir, 'package.json');
                await fs.access(pkgPath);
                return 'npm test';
            } catch {
                // ignore
            }

            // Final fallback: generic command.
            return 'npm test';
        }

        const testCmd = await detectTestCommand();

        log.info('Running tests', { command: testCmd, profile });
        const result = await runCommand(cfg, testCmd);
        log.info('Tests completed', { passed: result.passed });

        return {
            testResults: result,
            done: result.passed
        };
    };
}
