export type TaskScope = 'tiny' | 'normal' | 'large';

function containsKeyword(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
}

export function estimateTaskScope(goal?: string, ticket?: string, architect?: string): TaskScope {
    const blob = `${goal ?? ''}\n${ticket ?? ''}`.toLowerCase();
    const wordCount = blob.split(/\s+/).filter(Boolean).length;
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

    if (containsKeyword(blob, heavyKeywords)) {
        return 'large';
    }
    if (wordCount <= 80) {
        return 'tiny';
    }
    if (wordCount >= 200) {
        return 'large';
    }
    if ((architect ?? '').length > 20000) {
        return 'large';
    }
    return 'normal';
}
