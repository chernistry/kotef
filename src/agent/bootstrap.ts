import path from 'node:path';
import { KotefConfig } from '../core/config.js';
import { listFiles, readFile, resolvePath } from '../tools/fs.js';
import { callChat } from '../core/llm.js';
import { promises as fs } from 'node:fs';
import { runSddOrchestration } from './graphs/sdd_orchestrator.js';
import { renderBrainTemplate } from '../sdd/template_driver.js';

export interface BootstrapContext {
    cfg: KotefConfig;
    rootDir: string;
    goal: string;
}

export async function bootstrapSddForProject(
    cfg: KotefConfig,
    rootDir: string,
    goal: string
): Promise<void> {
    console.log(`Bootstrapping SDD for ${rootDir} with goal: "${goal}"`);

    // 1. Scan repo
    const files = await listFiles({ rootDir }, '**/*.{json,ts,js,md,yml,yaml}');
    const packageJson = files.find(f => f.endsWith('package.json'));
    let stackHints = "Unknown stack";

    if (packageJson) {
        try {
            const content = await readFile({ rootDir }, packageJson);
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            stackHints = `Node.js project. Dependencies: ${Object.keys(deps).join(', ')}`;
        } catch (e) {
            console.warn("Failed to read package.json", e);
        }
    }

    // 2. Synthesize Project Spec (project.md)
    console.log('Synthesizing project.md...');
    const projectPrompt = await renderBrainTemplate('bootstrap_project', {
        goal,
        stackHints
    });

    const projectResponse = await callChat(cfg, [{ role: 'system', content: projectPrompt }], {
        model: cfg.modelFast, // Use fast model for project spec
    });

    let projectMdContent = projectResponse.messages[projectResponse.messages.length - 1].content;
    // Strip markdown code blocks if present
    projectMdContent = projectMdContent.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

    // Helper to safe write
    const safeWrite = async (relPath: string, content: string) => {
        const absPath = resolvePath({ rootDir }, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content);
    };

    const sddDir = path.join(rootDir, '.sdd');
    // await fs.mkdir(sddDir, { recursive: true }); // This is now handled by safeWrite

    // Write project.md if not exists
    const projectMdPath = path.join(sddDir, 'project.md');
    try {
        await fs.access(projectMdPath);
        console.log('Skipping .sdd/project.md (already exists)');
    } catch {
        await safeWrite('.sdd/project.md', projectMdContent);
        console.log('Created: .sdd/project.md');
    }

    // 3. Run SDD Orchestration
    // This will generate best_practices.md, architect.md, and tickets.
    await runSddOrchestration(cfg, rootDir, goal);
}
