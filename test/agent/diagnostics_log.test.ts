import { describe, it, expect } from 'vitest';
import { parseDiagnostics, mergeDiagnostics, summarizeDiagnostics, DiagnosticsEntry } from '../../src/agent/utils/diagnostics.js';

describe('Diagnostics Log', () => {
    describe('parseDiagnostics', () => {
        it('should parse TypeScript errors', () => {
            const output = `
src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts:20:1 - error TS1234: Something wrong.
            `;
            const entries = parseDiagnostics(output, 'build');
            expect(entries.length).toBe(2);

            expect(entries[0].file).toBe('src/foo.ts');
            expect(entries[0].location?.line).toBe(10);
            expect(entries[0].location?.column).toBe(5);
            expect(entries[0].message).toBe("Type 'string' is not assignable to type 'number'.");

            expect(entries[1].file).toBe('src/bar.ts');
            expect(entries[1].location?.line).toBe(20);
        });

        it('should parse Test failures', () => {
            const output = `
FAIL src/foo.test.ts
● Test Suite Name › Test Case Name
            `;
            const entries = parseDiagnostics(output, 'test');
            expect(entries.length).toBe(2);

            expect(entries[0].file).toBe('src/foo.test.ts');
            expect(entries[0].source).toBe('test');

            expect(entries[1].message).toBe('Test Suite Name › Test Case Name');
        });
    });

    describe('mergeDiagnostics', () => {
        it('should merge duplicates and increment counts', () => {
            const existing: DiagnosticsEntry[] = [{
                source: 'build',
                file: 'src/foo.ts',
                message: 'Error 1',
                firstSeenAt: 1000,
                lastSeenAt: 1000,
                occurrenceCount: 1
            }];

            const newEntries: DiagnosticsEntry[] = [{
                source: 'build',
                file: 'src/foo.ts',
                message: 'Error 1',
                firstSeenAt: 2000,
                lastSeenAt: 2000,
                occurrenceCount: 1
            }, {
                source: 'build',
                file: 'src/bar.ts',
                message: 'Error 2',
                firstSeenAt: 2000,
                lastSeenAt: 2000,
                occurrenceCount: 1
            }];

            const merged = mergeDiagnostics(existing, newEntries);
            expect(merged.length).toBe(2);

            const error1 = merged.find(e => e.message === 'Error 1');
            expect(error1).toBeDefined();
            expect(error1?.occurrenceCount).toBe(2);
            expect(error1?.lastSeenAt).toBe(2000);

            const error2 = merged.find(e => e.message === 'Error 2');
            expect(error2).toBeDefined();
            expect(error2?.occurrenceCount).toBe(1);
        });
    });

    describe('summarizeDiagnostics', () => {
        it('should summarize top entries', () => {
            const log: DiagnosticsEntry[] = [
                { source: 'build', file: 'a.ts', message: 'Err A', occurrenceCount: 5, firstSeenAt: 0, lastSeenAt: 0 },
                { source: 'test', file: 'b.ts', message: 'Err B', occurrenceCount: 2, firstSeenAt: 0, lastSeenAt: 0 },
            ];

            const summary = summarizeDiagnostics(log);
            expect(summary).toContain('Top 2 Diagnostics');
            expect(summary).toContain('Err A (x5)');
            expect(summary).toContain('Err B (x2)');
        });
    });
});
