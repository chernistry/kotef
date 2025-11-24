import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts', 'test/**/*.test.js'],
        exclude: ['dist/**', 'node_modules/**'],
        globals: true,
        environment: 'node',
    },
});
