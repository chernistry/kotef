import { StateGraph, START, END } from '@langchain/langgraph';
import { KotefConfig } from '../../core/config.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { renderBrainTemplate, loadBrainTemplate } from '../../sdd/template_driver.js';
import { deepResearch, DeepResearchFinding } from '../../tools/deep_research.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface SddOrchestratorState {
    goal: string;
    rootDir: string;
    config: KotefConfig;
    researchContent?: string;
    architectContent?: string;
    ticketsCreated?: string[];
}

interface ProjectMetadata {
    techStack: string;
    domain: string;
    projectDescription: string;
}

async function loadProjectMetadata(rootDir: string, goal: string): Promise<ProjectMetadata> {
    const sddProjectPath = path.join(rootDir, '.sdd', 'project.md');

    let techStack = 'Unknown stack (infer from goal and project.md)';
    let domain = 'Software Engineering';
    let projectDescription = `Goal:\n${goal}`;

    try {
        const content = await fs.readFile(sddProjectPath, 'utf-8');
        projectDescription = content;

        // Heuristic: extract bullet list under "## Tech Stack"
        const techHeader = '## Tech Stack';
        const techIdx = content.indexOf(techHeader);
        if (techIdx !== -1) {
            const after = content.slice(techIdx + techHeader.length).split('\n');
            const items: string[] = [];
            for (const line of after) {
                const trimmed = line.trim();
                if (trimmed.startsWith('## ')) break;
                if (trimmed.startsWith('- ')) {
                    items.push(trimmed.slice(2).trim());
                }
            }
            if (items.length > 0) {
                techStack = items.join(', ');
            }
        }

        // Optional: extract a "## Domain" section if present
        const domainHeader = '## Domain';
        const domainIdx = content.indexOf(domainHeader);
        if (domainIdx !== -1) {
            const after = content.slice(domainIdx + domainHeader.length).split('\n');
            for (const line of after) {
                const trimmed = line.trim();
                if (trimmed.startsWith('## ')) break;
                if (trimmed.length > 0) {
                    domain = trimmed.replace(/^[-*]\s*/, '').trim();
                    break;
                }
            }
        }
    } catch {
        // If project.md is missing or unparsable, fall back to goal-based defaults.
    }

    return { techStack, domain, projectDescription };
}

async function sddResearch(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running SDD Research...');
    const { goal, rootDir, config } = state;

    // 1. Run web-backed deep research (Tavily + fetchPage + LLM summarization)
    console.log(`Starting deep research for goal: "${goal}"`);
    let findings: DeepResearchFinding[] = [];
    try {
        findings = await deepResearch(config, goal);
        console.log(`Deep research completed. Found ${findings.length} findings.`);
    } catch (e) {
        console.warn('Deep research failed, falling back to model-only research:', e);
        findings = [];
    }

    const findingsContext =
        findings.length === 0
            ? 'No external web findings were available. Base recommendations on up-to-date, conservative defaults for this stack, and clearly mark low-confidence areas.'
            : findings
                  .map((f, idx) => {
                      const sources = f.citations
                          .map(c => `- ${c.url}${c.title ? ` — ${c.title}` : ''}`)
                          .join('\n');
                      return `(${idx + 1}) ${f.statement}\nSources:\n${sources}`;
                  })
                  .join('\n\n');

    console.log('Generating best_practices.md with LLM...');
    
    const { techStack, domain, projectDescription } = await loadProjectMetadata(rootDir, goal);

    // 2. Render prompt with web research injected as additional context
    const prompt = renderBrainTemplate('research', {
        projectName: path.basename(rootDir),
        domain,
        techStack,
        projectDescription,
        year: new Date().getFullYear(),
        goal,
        additionalContext: `Web research findings for goal "${goal}":\n\n${findingsContext}`
    });

    // 3. Call LLM to synthesize best_practices.md from template + findings
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software researcher.' },
        { role: 'user', content: prompt }
    ];

    const response = await callChat(config, messages, {
        model: config.modelFast,
        temperature: 0,
        // Best practices doc: target ~15–20k chars (~3.5k tokens).
        maxTokens: 3500
    });
    const content = response.messages[response.messages.length - 1].content || '';

    // 4. Write file
    const sddDir = path.join(rootDir, '.sdd');
    await fs.mkdir(sddDir, { recursive: true });
    await fs.writeFile(path.join(sddDir, 'best_practices.md'), content);

    return { researchContent: content };
}

async function sddArchitect(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running SDD Architect...');
    const { goal, rootDir, config, researchContent } = state;

    const { techStack, domain, projectDescription } = await loadProjectMetadata(rootDir, goal);

    // 1. Render prompt
    // Architect template refers to .sdd/best_practices.md, so we don't need to inject it if the LLM can read files.
    // But here we are just prompting.
    // We should probably inject the research content into the prompt context if the LLM can't read files yet.
    // Or we assume the LLM "knows" it via context injection.
    // The template has `Best practices: see .sdd/best_practices.md`.
    // We will inject it as context for better results.

    const prompt = renderBrainTemplate('architect', {
        projectName: path.basename(rootDir),
        domain,
        techStack,
        projectDescription,
        year: new Date().getFullYear(),
        goal,
        research: researchContent // Injecting research content if template supports it or we append it
    });

    // Append research content if not in template (template refers to file, but LLM needs context)
    const fullPrompt = `${prompt}\n\n## Context from Research\n${researchContent}`;

    // 2. Call LLM
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software architect.' },
        { role: 'user', content: fullPrompt }
    ];

    const response = await callChat(config, messages, {
        model: config.modelFast,
        temperature: 0,
        // Architecture spec: also ~15–20k chars, allow a bit more.
        maxTokens: 4000
    });
    const content = response.messages[response.messages.length - 1].content || '';

    // 3. Write file
    const sddDir = path.join(rootDir, '.sdd');
    await fs.mkdir(sddDir, { recursive: true });
    await fs.writeFile(path.join(sddDir, 'architect.md'), content);

    return { architectContent: content };
}

async function sddTickets(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running SDD Tickets...');
    const { goal, rootDir, config, architectContent } = state;

    // 1. Construct Prompt
    const ticketTemplate = loadBrainTemplate('ticket');
    const prompt = `
You are an expert Project Manager.
Based on the Architecture Plan below, break down the implementation into sequential tickets.

## Architecture Plan
${architectContent}

## Output Format
Return a JSON object with a 'tickets' array. Each item must have:
- filename: string (e.g., "01-setup-core.md")
- content: string (the full markdown content of the ticket)

Use the following Ticket Template for the content:
\`\`\`markdown
${ticketTemplate}
\`\`\`

Ensure tickets are granular, have clear dependencies, and cover the entire MVP.
`;

    // 2. Call LLM
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert Project Manager.' },
        { role: 'user', content: prompt }
    ];

    const response = await callChat(config, messages, {
        model: config.modelFast,
        temperature: 0,
        maxTokens: 2000,
        response_format: { type: 'json_object' }
    });
    const content = response.messages[response.messages.length - 1].content || '{}';

    let tickets: { filename: string; content: string }[] = [];
    try {
        const parsed = JSON.parse(content);
        tickets = parsed.tickets || [];
    } catch (e) {
        console.error('Failed to parse tickets JSON:', e);
        // Fallback or throw? For now, log and continue.
    }

    // 3. Write files
    const ticketsDir = path.join(rootDir, '.sdd/backlog/tickets/open');
    await fs.mkdir(ticketsDir, { recursive: true });

    const createdFiles: string[] = [];
    for (const ticket of tickets) {
        if (!ticket || typeof ticket.filename !== 'string') {
            console.warn('Skipping malformed ticket entry', ticket);
            continue;
        }
        const filePath = path.join(ticketsDir, ticket.filename);
        const contentToWrite =
            typeof ticket.content === 'string'
                ? ticket.content
                : `# Ticket: ${ticket.filename}\n\n> WARNING: LLM did not provide explicit content for this ticket. Please regenerate or edit manually.\n`;
        await fs.writeFile(filePath, contentToWrite);
        createdFiles.push(ticket.filename);
    }

    return { ticketsCreated: createdFiles };
}

// Define the graph
const workflow = new StateGraph<SddOrchestratorState>({
    channels: {
        goal: { value: (x: string, y: string) => y ?? x, default: () => '' },
        rootDir: { value: (x: string, y: string) => y ?? x, default: () => '' },
        config: { value: (x: KotefConfig, y: KotefConfig) => y ?? x, default: () => ({} as any) },
        researchContent: { value: (x: string, y: string) => y ?? x, default: () => '' },
        architectContent: { value: (x: string, y: string) => y ?? x, default: () => '' },
        ticketsCreated: { value: (x: string[], y: string[]) => y ?? x, default: () => [] }
    }
})
    .addNode('sdd_research', sddResearch)
    .addNode('sdd_architect', sddArchitect)
    .addNode('sdd_tickets', sddTickets)
    .addEdge(START, 'sdd_research')
    .addEdge('sdd_research', 'sdd_architect')
    .addEdge('sdd_architect', 'sdd_tickets')
    .addEdge('sdd_tickets', END);

const app = workflow.compile();

export async function runSddOrchestration(
    cfg: KotefConfig,
    rootDir: string,
    goal: string
): Promise<void> {
    console.log(`Starting SDD Orchestration for goal: "${goal}"`);

    await app.invoke({
        goal,
        rootDir,
        config: cfg
    });

    console.log('SDD Orchestration completed.');
}
