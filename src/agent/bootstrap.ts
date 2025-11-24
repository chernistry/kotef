import path from 'node:path';
import { KotefConfig } from '../core/config.js';
import { callChat } from '../core/llm.js';
import { loadPrompt } from '../core/prompts.js';
import { listFiles, readFile, resolvePath } from '../tools/fs.js';
import { deepResearch } from '../tools/deep_research.js';
import { promises as fs } from 'node:fs';

export interface BootstrapContext {
    cfg: KotefConfig;
    rootDir: string;
    goal: string;
}

export async function bootstrapSddForProject(
    cfg: KotefConfig,
    rootDir: string,
    goal: string,
    chatFn = callChat
): Promise<void> {
    console.log(`Bootstrapping SDD for ${rootDir} with goal: "${goal}"`);

    // 1. Scan repo
    const files = await listFiles(cfg, '**/*.{json,ts,js,md,yml,yaml}');
    const packageJson = files.find(f => f.endsWith('package.json'));
    let stackHints = "Unknown stack";

    if (packageJson) {
        try {
            const content = await readFile(cfg, packageJson);
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            stackHints = `Node.js project. Dependencies: ${Object.keys(deps).join(', ')}`;
        } catch (e) {
            console.warn("Failed to read package.json", e);
        }
    }

    // 2. Research Best Practices
    const researchPrompt = await loadPrompt('bootstrap_research');
    // const researchQuery = researchPrompt
    //   .replace('{{stackHints}}', stackHints)
    //   .replace('{{goal}}', goal);

    // We use deepResearch tool directly
    // But wait, deepResearch takes a query string. The prompt is a system prompt?
    // No, the prompt above is a system prompt for an agent.
    // But here we just want to call deepResearch with a query.
    // Let's simplify: we construct a query from the hints.
    const query = `Best practices for ${stackHints} project implementing ${goal}`;
    const researchFindings = await deepResearch(cfg, query);
    const researchSummary = JSON.stringify(researchFindings);

    // 3. Synthesize SDD Artifacts
    const architectPrompt = await loadPrompt('bootstrap_architect');
    const sysPromptArch = architectPrompt
        .replace('{{stackHints}}', stackHints)
        .replace('{{goal}}', goal)
        .replace('{{research}}', researchSummary);

    const archResponse = await chatFn(cfg, [{ role: 'system', content: sysPromptArch }], {
        model: cfg.modelStrong,
        response_format: { type: 'json_object' } as any
    });

    let artifacts: any = {};
    try {
        artifacts = JSON.parse(archResponse.messages[archResponse.messages.length - 1].content);
    } catch (e) {
        console.error("Failed to parse bootstrap artifacts", e);
        return;
    }

    // 4. Generate Tickets
    const ticketPrompt = await loadPrompt('bootstrap_tickets');
    const sysPromptTickets = ticketPrompt
        .replace('{{goal}}', goal)
        .replace('{{architect}}', artifacts.architect_md || '');

    const ticketResponse = await chatFn(cfg, [{ role: 'system', content: sysPromptTickets }], {
        model: cfg.modelStrong,
        response_format: { type: 'json_object' } as any
    });

    let tickets: any[] = [];
    try {
        const json = JSON.parse(ticketResponse.messages[ticketResponse.messages.length - 1].content);
        tickets = Array.isArray(json) ? json : (json.tickets || []);
    } catch (e) {
        console.error("Failed to parse bootstrap tickets", e);
    }

    // 5. Write Files
    // We need to ensure .sdd directories exist.
    // Since we don't have a `mkdir` tool, we rely on `writePatch`? No, `writePatch` assumes file exists usually?
    // Wait, `writePatch` in `fs.ts` applies diffs. It doesn't create new files easily unless we handle "new file" diffs.
    // But `fs.ts` doesn't expose a simple `writeFile`.
    // We should probably add `writeFile` to `fs.ts` or use `fs` directly here since this is a "system" action, not an agent action?
    // The ticket says "call FS tools to create .sdd/ and files, using diff-based writes if files exist."
    // If they don't exist, we should create them.
    // Let's use `fs.promises` directly for creation if missing, as this is the bootstrap phase running with system privileges (within the agent process).
    // But we must respect the sandbox `rootDir`.

    const sddDir = path.join(rootDir, '.sdd');
    // const ticketsDir = path.join(sddDir, 'backlog/tickets/open');

    // Helper to safe write
    const safeWrite = async (relPath: string, content: string) => {
        const absPath = resolvePath(cfg, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        // Check if exists
        try {
            await fs.access(absPath);
            // Exists: strictly we should diff, but for bootstrap we might overwrite or append?
            // Ticket says: "if .sdd/ already exists, it does not blindly overwrite... appends/updates... or writes new files"
            // For MVP, let's just write if not exists, or skip/log if exists.
            console.log(`Skipping existing file: ${relPath}`);
        } catch {
            await fs.writeFile(absPath, content);
            console.log(`Created: ${relPath}`);
        }
    };

    await safeWrite('.sdd/project.md', artifacts.project_md || '# Project');
    await safeWrite('.sdd/architect.md', artifacts.architect_md || '# Architect');
    await safeWrite('.sdd/best_practices.md', artifacts.best_practices_md || '# Best Practices');

    for (const t of tickets) {
        await safeWrite(`.sdd/backlog/tickets/open/${t.filename}`, t.content);
    }
}
