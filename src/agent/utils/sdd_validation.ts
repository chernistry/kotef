import { createLogger } from '../../core/logger.js';

export interface SddDocValidationResult {
    ok: boolean;
    missingSections: string[];
    truncated?: boolean;
    warnings: string[];
}

const BEST_PRACTICES_HEADINGS = [
    '# Best Practices & Research',
    '## 1. TL;DR',
    '## 2. Landscape',
    '## 3. Architecture Patterns',
    '## 4. Conflicting Practices & Alternatives',
    '## 5. References'
];

const ARCHITECT_HEADINGS = [
    '# Architect Specification',
    '## 1. Overview',
    '## 2. Hard Constraints & Preconditions',
    '## 4. Alternatives',
    '## 5. Architecture Overview',
    '## 6. Component Specifications',
    '## 7. Code Standards & Conventions',
    '## 8. Implementation Plan',
    '## 9. Decision Log'
];

export function validateBestPracticesDoc(content: string): SddDocValidationResult {
    return validateDoc(content, BEST_PRACTICES_HEADINGS, 'best_practices.md');
}

export function validateArchitectDoc(content: string): SddDocValidationResult {
    return validateDoc(content, ARCHITECT_HEADINGS, 'architect.md');
}

function validateDoc(content: string, requiredHeadings: string[], docName: string): SddDocValidationResult {
    const log = createLogger('sdd-validation');
    const missingSections: string[] = [];
    const warnings: string[] = [];
    let truncated = false;

    const lines = content.trim().split('\n');

    // Check for required headings
    for (const heading of requiredHeadings) {
        // Relaxed check: case-insensitive, allows extra spaces/markdown chars
        // e.g. "## 1. TL;DR" matches "## 1. TL;DR", "## 1. tl;dr", "##   1. TL;DR  "
        // We strip special regex chars from the heading first, then build a flexible regex.

        // 1. Remove markdown header markers (#) and trim to get the core text
        const coreText = heading.replace(/^#+\s*/, '').trim();

        // 2. Build regex: 
        // ^\s*#+\s*  -> start of line, optional space, one or more #, optional space
        // ...core text... -> the text we are looking for (escaped)
        // .*$ -> allow trailing chars on the line
        // Simple line-based check to avoid regex complexity/fragility
        const coreTextLower = coreText.toLowerCase();
        const found = lines.some(line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('#')) return false;
            return trimmed.toLowerCase().includes(coreTextLower);
        });

        if (!found) {
            missingSections.push(heading);
        }
    }

    // Check for truncation
    const lastLine = lines[lines.length - 1].trim();

    // Heuristic 1: Last line is a header (starts with #)
    // If a doc ends exactly on a header, it's likely missing the content for that section.
    if (lastLine.startsWith('#')) {
        truncated = true;
        warnings.push('Document ends on a header line.');
    }
    // Heuristic 1b: Last line looks like an empty bullet or number
    else if (lastLine.match(/^(-|\d+\.)\s*$/)) {
        truncated = true;
        warnings.push('Document ends with an incomplete list item.');
    }

    // Heuristic 2: Document ends abruptly in the middle of a sentence (no punctuation)
    // We check if it ends with a word character or comma, and NOT a sentence-ending punctuation.
    // Valid endings: . ! ? ) } ] " ` '
    if (lastLine.length > 0 && !/[.!?)}\]"`']$/.test(lastLine)) {
        // It might be code, so check if we are inside a code block
        const codeBlockCount = (content.match(/```/g) || []).length;
        if (codeBlockCount % 2 !== 0) {
            truncated = true;
            warnings.push('Document ends inside an unclosed code block.');
        } else {
            // Weak heuristic, but often true for prose
            truncated = true;
            warnings.push('Document ends without punctuation, possibly truncated.');
        }
    }

    if (missingSections.length > 0) {
        log.warn(`Validation failed for ${docName}`, { missingSections });
    }

    if (truncated) {
        log.warn(`Possible truncation detected in ${docName}`);
    }

    return {
        ok: missingSections.length === 0 && !truncated,
        missingSections,
        truncated,
        warnings
    };
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
