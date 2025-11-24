import { StateGraph, START, END } from '@langchain/langgraph';
import { KotefConfig } from '../../core/config.js';
import { callChat } from '../../core/llm.js';
import { renderBrainTemplate, loadBrainTemplate } from '../../sdd/template_driver.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ChatMessage } from '../../core/llm.js';

export interface SddOrchestratorState {
    goal: string;
    rootDir: string;
    config: KotefConfig;
    researchContent?: string;
    architectContent?: string;
    ticketsCreated?: string[];
}

async function sddResearch(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running SDD Research...');
    const { goal, rootDir, config } = state;

    // 1. Render prompt
    const prompt = renderBrainTemplate('research', {
        projectName: path.basename(rootDir),
        domain: 'Software Engineering', // Default, could be inferred
        techStack: 'TypeScript, Node.js', // Default, could be inferred or passed
        year: new Date().getFullYear(),
        goal: goal
    });

    // 2. Call LLM
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software researcher.' },
        { role: 'user', content: prompt }
    ];

    const response = await callChat(config, messages);
    const content = response.messages[response.messages.length - 1].content || '';

    // 3. Write file
    const sddDir = path.join(rootDir, '.sdd');
    await fs.mkdir(sddDir, { recursive: true });
    await fs.writeFile(path.join(sddDir, 'best_practices.md'), content);

    return { researchContent: content };
}

async function sddArchitect(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running SDD Architect...');
    const { goal, rootDir, config, researchContent } = state;

    // 1. Render prompt
    // Architect template refers to .sdd/best_practices.md, so we don't need to inject it if the LLM can read files.
    // But here we are just prompting.
    // We should probably inject the research content into the prompt context if the LLM can't read files yet.
    // Or we assume the LLM "knows" it via context injection.
    // The template has `Best practices: see .sdd/best_practices.md`.
    // We will inject it as context for better results.

    const prompt = renderBrainTemplate('architect', {
        projectName: path.basename(rootDir),
        domain: 'Software Engineering',
        techStack: 'TypeScript, Node.js',
        year: new Date().getFullYear(),
        goal: goal,
        research: researchContent // Injecting research content if template supports it or we append it
    });

    // Append research content if not in template (template refers to file, but LLM needs context)
    const fullPrompt = `${prompt}\n\n## Context from Research\n${researchContent}`;

    // 2. Call LLM
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software architect.' },
        { role: 'user', content: fullPrompt }
    ];

    const response = await callChat(config, messages);
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

    const response = await callChat(config, messages, { response_format: { type: 'json_object' } });
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
        const filePath = path.join(ticketsDir, ticket.filename);
        await fs.writeFile(filePath, ticket.content);
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
