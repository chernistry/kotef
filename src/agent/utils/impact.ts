
import { execa } from 'execa';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { GitHotspot } from '../../tools/git.js';

export interface ImpactAnalysis {
    impactMap: {
        files: string[];
        modules: string[];
    };
    riskMap: {
        level: 'low' | 'medium' | 'high';
        factors: string[];
        hotspots: string[];
    };
}

export async function analyzeImpact(
    goal: string,
    rootDir: string,
    hotspots: GitHotspot[] = []
): Promise<ImpactAnalysis> {
    const impactMap: ImpactAnalysis['impactMap'] = { files: [], modules: [] };
    const riskMap: ImpactAnalysis['riskMap'] = { level: 'low', factors: [], hotspots: [] };

    // 1. Keyword Search (grep)
    // Extract keywords from goal (simple heuristic: words > 3 chars, ignore common stop words)
    const stopWords = new Set(['fix', 'update', 'change', 'add', 'remove', 'delete', 'implement', 'the', 'and', 'for', 'with']);
    const keywords = goal.split(/\s+/)
        .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 3 && !stopWords.has(w));

    if (keywords.length > 0) {
        try {
            // Grep for keywords (case insensitive)
            // Limit to 100 matches
            const { stdout } = await execa('grep', ['-r', '-i', '-l', '-E', keywords.join('|'), '.', '--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=.sdd', '--exclude-dir=dist', '--exclude-dir=build', '--exclude-dir=coverage'], { cwd: rootDir, reject: false });
            if (stdout) {
                impactMap.files = stdout.split('\n').filter(Boolean).slice(0, 100);
            }
        } catch (e) {
            // Grep failed or no matches
        }
    }

    // 2. Risk Assessment
    // Check for hotspots in impacted files
    const hotspotFiles = new Set(hotspots.map(h => h.file));
    for (const file of impactMap.files) {
        // Normalize paths for comparison
        const normalizedFile = file.replace(/^\.\//, '');
        if (hotspotFiles.has(normalizedFile)) {
            riskMap.hotspots.push(normalizedFile);
            riskMap.factors.push(`Modifies hotspot: ${normalizedFile}`);
        }

        // Check for sensitive keywords in filename
        if (file.includes('auth') || file.includes('security') || file.includes('payment') || file.includes('crypto')) {
            riskMap.factors.push(`Modifies sensitive module: ${file}`);
            riskMap.level = 'high';
        }
    }

    // Check for "High Risk" keywords in goal
    const highRiskKeywords = ['auth', 'login', 'password', 'secret', 'key', 'token', 'payment', 'billing', 'database', 'schema', 'migration'];
    if (highRiskKeywords.some(k => goal.toLowerCase().includes(k))) {
        riskMap.factors.push('Goal implies high-risk domain');
        if (riskMap.level !== 'high') riskMap.level = 'medium'; // Upgrade to at least medium
    }

    // Determine final level
    if (riskMap.hotspots.length > 0) {
        riskMap.level = 'high'; // Touching hotspots is high risk
    } else if (impactMap.files.length > 20) {
        riskMap.factors.push('Wide impact (> 20 files)');
        if (riskMap.level === 'low') riskMap.level = 'medium';
    }

    return { impactMap, riskMap };
}
