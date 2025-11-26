import { describe, it, expect } from 'vitest';
import { isFunctionalProbe, recordFunctionalProbe, deriveFunctionalStatus } from '../../src/agent/utils/functional_checks.js';

describe('Functional Probes', () => {
    it('should identify functional probes correctly', () => {
        const cases = [
            ['npm run dev', true],
            ['python app.py', true],
            ['go run .', true],
            ['vite', true],
            ['npm test', false],
            ['npm run lint', false],
            ['npm run build', false],
            ['pytest', false]
        ] as const;

        for (const [cmd, expected] of cases) {
            const actual = isFunctionalProbe(cmd);
            expect(actual).toBe(expected);
        }
    });

    it('should record probes correctly', () => {
        const result = { exitCode: 0, stdout: 'Server running', stderr: '' };
        const checks = recordFunctionalProbe('npm run dev', result, 'coder');

        expect(checks.length).toBe(1);
        expect(checks[0].command).toBe('npm run dev');
        expect(checks[0].exitCode).toBe(0);
        expect(checks[0].node).toBe('coder');
    });

    it('should not record non-probes', () => {
        const result = { exitCode: 0, stdout: 'Tests passed', stderr: '' };
        const checks = recordFunctionalProbe('npm test', result, 'coder');
        expect(checks.length).toBe(0);
    });

    it('should derive functional status correctly', () => {
        expect(deriveFunctionalStatus([])).toBe(false);
        expect(deriveFunctionalStatus(undefined)).toBe(false);
        expect(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 0, timestamp: 1, node: 'coder' }
        ])).toBe(true);
        expect(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 1, timestamp: 1, node: 'coder' }
        ])).toBe(false);
        expect(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 1, timestamp: 1, node: 'coder' },
            { command: 'npm run dev', exitCode: 0, timestamp: 2, node: 'coder' }
        ])).toBe(true);
        expect(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 0, timestamp: 1, node: 'coder' },
            { command: 'npm run dev', exitCode: 1, timestamp: 2, node: 'coder' }
        ])).toBe(true);
    });
});
