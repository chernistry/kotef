export type TaskScope = 'tiny' | 'normal' | 'large';

function containsKeyword(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
}

export function estimateTaskScope(goal?: string, ticket?: string, architect?: string): TaskScope {
    const goalText = (goal ?? '').toLowerCase();
    const ticketText = (ticket ?? '').toLowerCase();
    const blob = `${goalText}\n${ticketText}`;
    const wordCount = blob.split(/\s+/).filter(Boolean).length;

    const projectCreationSignals = [
        'create a new',
        'create new',
        'build a new',
        'scaffold',
        'bootstrap',
        'greenfield',
        'from scratch',
        'portfolio',
        'landing page',
        'landing-page',
        'fullstack app',
        'full-stack app',
        'react app',
        'vite app',
        // Russian equivalents commonly used in goals
        'создай',
        'создать',
        'сделай',
        'сделать',
        'построй',
        'новый проект',
        'новое приложение',
        'портфолио-сайт',
        'портфолио сайт'
    ];

    const tinyChangeSignals = [
        'typo',
        'misspell',
        'rename variable',
        'rename method',
        'rename function',
        'comment only',
        'docs only',
        'documentation only',
        'readme',
        'changelog',
        'small tweak',
        'one-liner',
        'one line',
        'formatting',
        'prettier',
        'eslint fix'
    ];

    const heavyKeywords = [
        'architecture',
        'platform',
        'database',
        'schema',
        'migrate',
        'migration',
        'orchestrator',
        'service',
        'api',
        'microservice',
        'monolith',
        'bootstrap',
        'infrastructure',
        'auth',
        'ci',
        'cd',
        'deploy',
        'container',
        'docker',
        'kubernetes'
    ];

    // Obvious architecture / platform work → large
    if (containsKeyword(blob, heavyKeywords)) {
        return 'large';
    }

    // Greenfield / new app creation goals without an explicit ticket → at least normal
    if (!ticket && containsKeyword(goalText, projectCreationSignals)) {
        return 'normal';
    }

    // Very long specs or architect docs imply multi-step / large work
    if (wordCount >= 200 || (architect ?? '').length > 20000) {
        return 'large';
    }

    // Tiny, text-level tweaks with explicit tiny signals
    if (wordCount <= 80 && containsKeyword(blob, tinyChangeSignals)) {
        return 'tiny';
    }

    // Default: treat as normal-sized coding task
    return 'normal';
}
