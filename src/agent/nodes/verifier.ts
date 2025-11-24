import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES } from '../profiles.js';
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
            async function detectTestCommand(projectContext: string = '', rootDir: string = '.'): Promise<string> {
                // Heuristic 1: Check for package.json scripts
                try {
                    const pkgJsonPath = path.join(rootDir, 'package.json');
                    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
                    if (pkgJson.scripts && pkgJson.scripts.test) {
                        return 'npm test';
                    }
                } catch (e) {
                    // No package.json or error reading it
                }

                // Heuristic 2: Check for python tests
                if (projectContext.includes('Python') || projectContext.includes('pytest')) {
                    return 'pytest';
                }

                // Heuristic 3: Check for go tests
                if (projectContext.includes('Go')) {
                    return 'go test ./...';
                }

                // Final fallback: generic command.
                return 'npm test';
            }
            const executionProfile = resolveExecutionProfile(state);
            const policy = PROFILE_POLICIES[executionProfile];

            // In smoke profile, we might skip tests if we just want a quick check,
            // but usually verifier IS the check.
            // However, if we have limited test runs, we should respect that.
            // For now, we will just log the profile.
            log.info('Verifier starting', { executionProfile, policy });

            // If we have already exceeded maxTestRuns in the coder phase (tracked via state? no, coder tracks its own),
            // but here we are in verifier. Verifier should always run AT LEAST one test run if possible,
            // unless we are in a super strict mode or budget is globally exhausted.
            // For now, let's just run the test.

            // Detect test command
            const testCommand = await detectTestCommand(state.sdd.project, cfg.rootDir!);
            log.info('Detected test command', { testCommand });

            if (executionProfile === 'smoke' && !policy.allowAppRun) {
                // In smoke mode, maybe we only run lint? Or just fast unit tests?
                // For now, we proceed but maybe we limit the scope if we could.
            }

            const result = await runCommand(cfg, testCommand);
            log.info('Tests completed', { passed: result.passed });

            return {
                testResults: result,
                done: result.passed
            };
        };
    }
