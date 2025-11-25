import { describe, it } from 'node:test';
import assert from 'node:assert';
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
            assert.strictEqual(actual, expected, `Failed for "${cmd}"`);
        }
    });

    it('should record probes correctly', () => {
        const result = { exitCode: 0, stdout: 'Server running', stderr: '' };
        const checks = recordFunctionalProbe('npm run dev', result, 'coder');

        assert.strictEqual(checks.length, 1);
        assert.strictEqual(checks[0].command, 'npm run dev');
        assert.strictEqual(checks[0].exitCode, 0);
        assert.strictEqual(checks[0].node, 'coder');
    });

    it('should not record non-probes', () => {
        const result = { exitCode: 0, stdout: 'Tests passed', stderr: '' };
        const checks = recordFunctionalProbe('npm test', result, 'coder');
        assert.strictEqual(checks.length, 0);
    });

    it('should derive functional status correctly', () => {
        assert.strictEqual(deriveFunctionalStatus([]), false);
        assert.strictEqual(deriveFunctionalStatus(undefined), false);
        assert.strictEqual(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 0, timestamp: 1, node: 'coder' }
        ]), true);
        assert.strictEqual(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 1, timestamp: 1, node: 'coder' }
        ]), false);
        assert.strictEqual(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 1, timestamp: 1, node: 'coder' },
            { command: 'npm run dev', exitCode: 0, timestamp: 2, node: 'coder' }
        ]), true);
        assert.strictEqual(deriveFunctionalStatus([
            { command: 'npm run dev', exitCode: 0, timestamp: 1, node: 'coder' },
            { command: 'npm run dev', exitCode: 1, timestamp: 2, node: 'coder' }
        ]), true);
    });
});
