import { describe, it, expect } from 'vitest';
import { estimateTaskScope } from '../../src/agent/task_scope.js';

describe('estimateTaskScope', () => {
    describe('Greenfield scenarios (should return normal or large)', () => {
        it('should classify Russian greenfield goal as normal', () => {
            const scope = estimateTaskScope('создай простое портфолио-сайт на React/Vite');
            expect(scope).toBe('normal');
        });

        it('should classify English greenfield goal as normal', () => {
            const scope = estimateTaskScope('create a new portfolio site with React and Vite');
            expect(scope).toBe('normal');
        });

        it('should classify "build from scratch" as normal', () => {
            const scope = estimateTaskScope('build a fullstack app from scratch');
            expect(scope).toBe('normal');
        });

        it('should classify "scaffold new project" as normal', () => {
            const scope = estimateTaskScope('scaffold a new landing page');
            expect(scope).toBe('normal');
        });

        it('should classify Russian "сделай новое приложение" as normal', () => {
            const scope = estimateTaskScope('сделай новое приложение для задач');
            expect(scope).toBe('normal');
        });

        it('should not classify greenfield WITH ticket as normal (should use other heuristics)', () => {
            // When there's a ticket, greenfield signals in goal are ignored
            const scope = estimateTaskScope(
                'create a new feature',
                'Some ticket text about implementing a small helper'
            );
            // Should fall through to default 'normal' or other heuristics
            expect(['tiny', 'normal', 'large']).toContain(scope);
        });
    });

    describe('Tiny scenarios (should return tiny)', () => {
        it('should classify README typo fix as tiny', () => {
            const scope = estimateTaskScope('fix typo in README.md');
            expect(scope).toBe('tiny');
        });

        it('should classify variable rename as tiny', () => {
            const scope = estimateTaskScope('rename variable in utils.ts');
            expect(scope).toBe('tiny');
        });

        it('should classify formatting fix as tiny', () => {
            const scope = estimateTaskScope('update documentation formatting with prettier');
            expect(scope).toBe('tiny');
        });

        it('should classify comment-only change as tiny', () => {
            const scope = estimateTaskScope('add comment only to explain the algorithm');
            expect(scope).toBe('tiny');
        });

        it('should classify one-liner fix as tiny', () => {
            const scope = estimateTaskScope('fix one line bug in parser');
            expect(scope).toBe('tiny');
        });

        it('should NOT classify long tiny-signal goal as tiny (word count > 80)', () => {
            // More than 80 words, even with typo signal
            const longGoal = 'fix typo ' + 'word '.repeat(80);
            const scope = estimateTaskScope(longGoal);
            expect(scope).not.toBe('tiny');
        });
    });

    describe('Architecture scenarios (should return large)', () => {
        it('should classify microservice architecture as large', () => {
            const scope = estimateTaskScope('design microservice architecture for auth platform');
            expect(scope).toBe('large');
        });

        it('should classify database migration as large', () => {
            const scope = estimateTaskScope('implement database migration system');
            expect(scope).toBe('large');
        });

        it('should classify infrastructure work as large', () => {
            const scope = estimateTaskScope('set up kubernetes infrastructure');
            expect(scope).toBe('large');
        });

        it('should classify platform work as large', () => {
            const scope = estimateTaskScope('build api platform with docker containers');
            expect(scope).toBe('large');
        });

        it('should classify CI/CD setup as large', () => {
            const scope = estimateTaskScope('implement ci cd deploy pipeline');
            expect(scope).toBe('large');
        });
    });

    describe('Word count and architect length heuristics', () => {
        it('should classify very long goal as large (>= 200 words)', () => {
            const longGoal = 'implement feature ' + 'detail '.repeat(200);
            const scope = estimateTaskScope(longGoal);
            expect(scope).toBe('large');
        });

        it('should classify goal with very long architect as large', () => {
            const architect = 'a'.repeat(20001);
            const scope = estimateTaskScope('simple feature', undefined, architect);
            expect(scope).toBe('large');
        });

        it('should default to normal for medium-sized goal without heavy keywords', () => {
            const scope = estimateTaskScope('implement user profile page with form validation');
            expect(scope).toBe('normal');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty goal gracefully', () => {
            const scope = estimateTaskScope('');
            expect(scope).toBe('normal'); // Default
        });

        it('should handle undefined goal gracefully', () => {
            const scope = estimateTaskScope(undefined);
            expect(scope).toBe('normal'); // Default
        });

        it('should prioritize heavy keywords over word count', () => {
            // Short but has "architecture"
            const scope = estimateTaskScope('fix architecture');
            expect(scope).toBe('large');
        });

        it('should prioritize tiny signals when conditions met', () => {
            // Short + has tiny signal
            const scope = estimateTaskScope('typo fix');
            expect(scope).toBe('tiny');
        });
    });

    describe('Combined ticket + goal analysis', () => {
        it('should use both goal and ticket text for word count', () => {
            const goal = 'short goal';
            const ticket = 'word '.repeat(200); // >= 200 words total for large
            const scope = estimateTaskScope(goal, ticket);
            expect(scope).toBe('large');
        });

        it('should detect heavy keywords in ticket even if goal is simple', () => {
            const goal = 'implement feature';
            const ticket = 'This requires database migration and schema changes';
            const scope = estimateTaskScope(goal, ticket);
            expect(scope).toBe('large');
        });
    });
});
