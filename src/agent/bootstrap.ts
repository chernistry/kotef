import path from 'node:path';
import { KotefConfig } from '../core/config.js';
import { listFiles, readFile, resolvePath } from '../tools/fs.js';
import { callChat } from '../core/llm.js';
import { promises as fs } from 'node:fs';
import { runSddOrchestration } from './graphs/sdd_orchestrator.js';
import { renderBrainTemplate } from '../sdd/template_driver.js';
import { fileURLToPath } from 'url';
import { createLogger } from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('bootstrap');

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
    log.info(`Bootstrapping SDD for ${rootDir} with goal: "${goal}"`);

    // Helper to safe write
    const safeWrite = async (relPath: string, content: string) => {
        const absPath = resolvePath({ rootDir }, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content);
    };

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
            log.warn("Failed to read package.json", { error: e });
        }
    }

    // 2. Synthesize Project Spec (project.md)
    log.info('Synthesizing project.md...');
    const projectPrompt = await renderBrainTemplate('bootstrap_project', {
        projectName: path.basename(rootDir),
        domain: 'general',
        techStack: stackHints,
        year: new Date().getFullYear(),
        goal
    });

    const projectResponse = await callChat(
        cfg,
        [{ role: 'system', content: projectPrompt }],
        {
            model: cfg.modelFast, // Use fast model for project spec
        }
    );

    let projectMdContent = projectResponse.messages[projectResponse.messages.length - 1].content || '';
    // Strip markdown code blocks if present
    projectMdContent = projectMdContent.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

    const sddDir = path.join(rootDir, '.sdd');

    // Write project.md if not exists
    const projectMdPath = path.join(sddDir, 'project.md');
    try {
        await fs.access(projectMdPath);
        log.info('Skipping .sdd/project.md (already exists)');
    } catch {
        await safeWrite('.sdd/project.md', projectMdContent);
        log.info('Created: .sdd/project.md');
    }

    // 3. Seed implementing agent spec from SDDRush agent template (agent.md)
    try {
        const agentMdPath = path.join(sddDir, 'agent.md');
        await fs.access(agentMdPath);
        log.info('Skipping .sdd/agent.md (already exists)');
    } catch {
        log.info('Seeding .sdd/agent.md from brain agent_template.md...');
        const agentSpec = await renderBrainTemplate('agent', {
            projectName: path.basename(rootDir),
            domain: 'general',
            techStack: stackHints,
            year: new Date().getFullYear()
        });
        await safeWrite('.sdd/agent.md', agentSpec);
        log.info('Created: .sdd/agent.md');
    }

    // 4. Run SDD Orchestration
    // This will generate best_practices.md, architect.md, and tickets.
    await runSddOrchestration(cfg, rootDir, goal);
}
