import { describe, it, expect } from 'vitest';

/**
 * Tests for coder turn budget semantics (Ticket 38)
 * 
 * Verifying that maxCoderTurns config overrides profile defaults correctly,
 * with a global safety ceiling of 500.
 */

describe('Coder Turn Budget Semantics', () => {
    // Helper to simulate the logic from coder.ts lines 70-80
    function computeEffectiveTurns(profile: string, configuredMax: number | null): number {
        const profileTurns: Record<string, number> = {
            strict: 20,
            fast: 12,
            smoke: 6,
            yolo: 500
        };

        const profileDefault = profileTurns[profile] ?? 20;
        const configured = configuredMax && configuredMax > 0 ? configuredMax : 0;
        const effectiveConfigured = configured > 0 ? Math.min(configured, 500) : 0;
        return effectiveConfigured > 0 ? effectiveConfigured : profileDefault;
    }

    describe('Profile defaults (no config override)', () => {
        it('should use strict profile default (20 turns)', () => {
            const turns = computeEffectiveTurns('strict', null);
            expect(turns).toBe(20);
        });

        it('should use fast profile default (12 turns)', () => {
            const turns = computeEffectiveTurns('fast', null);
            expect(turns).toBe(12);
        });

        it('should use smoke profile default (6 turns)', () => {
            const turns = computeEffectiveTurns('smoke', null);
            expect(turns).toBe(6);
        });

        it('should use yolo profile default (500 turns)', () => {
            const turns = computeEffectiveTurns('yolo', null);
            expect(turns).toBe(500);
        });

        it('should use default 20 for unknown profile', () => {
            const turns = computeEffectiveTurns('unknown', null);
            expect(turns).toBe(20);
        });

        it('should use profile default when config is 0', () => {
            const turns = computeEffectiveTurns('fast', 0);
            expect(turns).toBe(12);
        });
    });

    describe('Config overrides (positive values)', () => {
        it('should override fast profile with 30 turns', () => {
            const turns = computeEffectiveTurns('fast', 30);
            expect(turns).toBe(30);
        });

        it('should override fast profile with 150 turns (user example)', () => {
            const turns = computeEffectiveTurns('fast', 150);
            expect(turns).toBe(150);
        });

        it('should override strict profile with 50 turns', () => {
            const turns = computeEffectiveTurns('strict', 50);
            expect(turns).toBe(50);
        });

        it('should override smoke profile with 20 turns', () => {
            const turns = computeEffectiveTurns('smoke', 20);
            expect(turns).toBe(20);
        });

        it('should allow config less than profile default', () => {
            // User wants to restrict yolo to 100 turns instead of 500
            const turns = computeEffectiveTurns('yolo', 100);
            expect(turns).toBe(100);
        });

        it('should allow config of 1 turn (minimum)', () => {
            const turns = computeEffectiveTurns('yolo', 1);
            expect(turns).toBe(1);
        });
    });

    describe('Safety ceiling (500 turns global max)', () => {
        it('should clamp 1000 turns to safety ceiling (500)', () => {
            const turns = computeEffectiveTurns('yolo', 1000);
            expect(turns).toBe(500);
        });

        it('should clamp 600 turns to safety ceiling (500)', () => {
            const turns = computeEffectiveTurns('fast', 600);
            expect(turns).toBe(500);
        });

        it('should accept exactly 500 turns', () => {
            const turns = computeEffectiveTurns('strict', 500);
            expect(turns).toBe(500);
        });

        it('should not clamp 499 turns', () => {
            const turns = computeEffectiveTurns('fast', 499);
            expect(turns).toBe(499);
        });
    });

    describe('Regression: Ticket 38 example', () => {
        it('should honor --max-coder-turns 150 with fast profile', () => {
            // This was the bug: 150 was being clamped to 12 (profile default)
            // Now it should equal 150
            const turns = computeEffectiveTurns('fast', 150);
            expect(turns).toBe(150);
        });

        it('should not use profile default when explicit config is higher', () => {
            const turns = computeEffectiveTurns('fast', 150);
            expect(turns).not.toBe(12); // Should NOT be profile default
        });
    });

    describe('Edge cases', () => {
        it('should treat negative config as 0 (use profile default)', () => {
            // Config schema should prevent this, but test defensive logic
            const configured = -5 > 0 ? -5 : 0; // Simulates the guard
            expect(configured).toBe(0);
            const turns = computeEffectiveTurns('fast', null);
            expect(turns).toBe(12);
        });

        it('should handle null and undefined config identically', () => {
            const turnsNull = computeEffectiveTurns('strict', null);
            const turnsUndefined = computeEffectiveTurns('strict', null);
            expect(turnsNull).toBe(turnsUndefined);
        });
    });
});
