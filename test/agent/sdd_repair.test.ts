import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateBestPracticesDoc } from '../../src/agent/utils/sdd_validation.js';
import { runSddOrchestration } from '../../src/agent/graphs/sdd_orchestrator.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { KotefConfig } from '../../src/core/config.js';

// Mock dependencies
vi.mock('../../src/core/llm.js', () => ({
    callChat: vi.fn().mockResolvedValue({
        messages: [{ content: 'Mocked LLM response' }]
    })
}));

vi.mock('../../src/tools/deep_research.js', () => ({
    deepResearch: vi.fn().mockResolvedValue({
        findings: [],
        quality: { relevance: 1, confidence: 1, coverage: 1 }
    })
}));

describe('SDD Validation & Repair', () => {
    const testDir = path.join(process.cwd(), 'temp-sdd-test');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
        // Create dummy project.md
        await fs.mkdir(path.join(testDir, '.sdd'), { recursive: true });
        await fs.writeFile(path.join(testDir, '.sdd', 'project.md'), '# Project\n## Tech Stack\n- Node.js');
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('should validate best_practices.md with case-insensitive headers', () => {
        const validContent = `
# Best Practices & Research
## 1. TL;DR
## 2. Landscape
## 3. Architecture Patterns
## 4. Conflicting Practices & Alternatives
## 5. References
End of document.
        `;
        expect(validateBestPracticesDoc(validContent).ok).toBe(true);

        const mixedCaseContent = `
# BEST PRACTICES & RESEARCH
## 1. tl;dr
## 2. LANDSCAPE
## 3. Architecture Patterns
## 4. Conflicting Practices & Alternatives
## 5. References
End of document.
        `;
        expect(validateBestPracticesDoc(mixedCaseContent).ok).toBe(true);

        const missingContent = `
# Best Practices & Research
## 1. TL;DR
        `;
        const res = validateBestPracticesDoc(missingContent);
        expect(res.ok).toBe(false);
        expect(res.missingSections).toContain('## 2. Landscape');
    });

    it('should use existing valid best_practices.md if present', async () => {
        const validContent = `
# Best Practices & Research
## 1. TL;DR
## 2. Landscape
## 3. Architecture Patterns
## 4. Conflicting Practices & Alternatives
## 5. References
Valid content.
End of document.
        `;
        const sddDir = path.join(testDir, '.sdd');
        await fs.writeFile(path.join(sddDir, 'best_practices.md'), validContent);

        const config = { rootDir: testDir } as KotefConfig;

        // We can't easily spy on the internal logic of runSddOrchestration without exporting more,
        // but we can check if the file content remains unchanged (mock LLM returns "Mocked LLM response").

        await runSddOrchestration(config, testDir, 'Goal');

        const contentAfter = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8');
        expect(contentAfter).toBe(validContent);
    });
});
