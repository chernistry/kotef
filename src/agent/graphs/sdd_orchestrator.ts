import { StateGraph, START, END } from '@langchain/langgraph';
import { KotefConfig } from '../../core/config.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { renderBrainTemplate, loadBrainTemplate } from '../../sdd/template_driver.js';
import { deepResearch, DeepResearchFinding } from '../../tools/deep_research.js';
import { loadPrompt, loadRuntimePrompt } from '../../core/prompts.js';
import { jsonrepair } from 'jsonrepair';
import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBestPracticesDoc, validateArchitectDoc } from '../utils/sdd_validation.js';

export interface SddOrchestratorState {
    goal: string;
    rootDir: string;
    config: KotefConfig;
    researchContent?: string;
    architectContent?: string;
    ticketsCreated?: string[];
}

export interface ProjectMetadata {
    techStack: string;
    domain: string;
    projectDescription: string;
}

export async function loadProjectMetadata(rootDir: string, goal: string): Promise<ProjectMetadata> {
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
    const metadata = await loadProjectMetadata(rootDir, goal);
    // 1. Run web-backed deep research (Tavily + fetchPage + LLM summarization)
    console.log(`Starting deep research for goal: "${goal}"`);

    let findings: DeepResearchFinding[] = [];
    try {
        const result = await deepResearch(config, goal, {
            originalGoal: goal,
            maxAttempts: 3,
            techStackHint: metadata.techStack
        });
        findings = result.findings;
        console.log(`Deep research completed. Found ${findings.length} findings.`);
        if (result.quality) {
            console.log(`Research Quality: Relevance=${result.quality.relevance}, Confidence=${result.quality.confidence}, Coverage=${result.quality.coverage}`);
        }

        // Ticket 65: Persist raw context
        if (result.rawSearchResults || result.rawPagesSample) {
            const contextDir = path.join(rootDir, '.sdd', 'context');
            await fs.mkdir(contextDir, { recursive: true });

            // Simple hash of goal to avoid filename issues
            const goalHash = Buffer.from(goal).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
            const contextFile = path.join(contextDir, `deep_research_${goalHash}.json`);

            await fs.writeFile(contextFile, JSON.stringify({
                goal,
                timestamp: new Date().toISOString(),
                quality: result.quality,
                rawSearchResults: result.rawSearchResults,
                rawPagesSample: result.rawPagesSample
            }, null, 2));
            console.log(`Persisted raw research context to ${contextFile}`);
        }
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

    const { techStack, domain, projectDescription } = metadata;

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

    const model = config.sddBrainModel || config.modelStrong || config.modelFast;
    const maxTokens = config.sddBestPracticesMaxTokens ?? 3500;

    let response = await callChat(config, messages, {
        model,
        temperature: 0,
        maxTokens
    });
    let content = response.messages[response.messages.length - 1].content || '';

    // Validation & Retry
    let validation = validateBestPracticesDoc(content);
    if (!validation.ok) {
        console.warn('Best practices doc validation failed:', validation);
        // Simple retry if truncated
        if (validation.truncated) {
            console.log('Retrying best_practices.md generation due to truncation...');
            messages.push({ role: 'assistant', content });
            messages.push({ role: 'user', content: 'The previous output was truncated. Please continue from where you left off, or regenerate the missing sections.' });

            // For simplicity in this MVP, we'll just ask for a full regeneration with a slightly stronger hint if possible, 
            // but "continue" is harder to stitch. Let's try a full regeneration with a "be concise" hint if it was length-related?
            // Actually, let's just try one more time with the same prompt but maybe a higher token limit if allowed? 
            // For now, let's just log and proceed, or maybe try one regeneration.

            // Let's try a regeneration with an explicit instruction to be complete.
            messages.pop(); // remove assistant
            messages.pop(); // remove user
            messages.push({ role: 'user', content: prompt + '\n\nIMPORTANT: Ensure the document is complete and not truncated. If you are running out of tokens, summarize less critical sections.' });

            response = await callChat(config, messages, {
                model,
                temperature: 0,
                maxTokens: Math.min(maxTokens * 1.2, 16000) // Bump limit slightly if possible
            });
            content = response.messages[response.messages.length - 1].content || '';
            validation = validateBestPracticesDoc(content);
        }
    }

    if (!validation.ok) {
        console.warn('Best practices doc is still potentially incomplete after retry:', validation);
        content += '\n\n> [!WARNING]\n> This document may be incomplete or truncated. Please review manually.';
    }

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

    const prompt = renderBrainTemplate('architect', {
        projectName: path.basename(rootDir),
        domain,
        techStack,
        projectDescription,
        year: new Date().getFullYear(),
        goal,
        research: researchContent
    });

    // Append research content for LLM context
    const fullPrompt = `${prompt}\n\n## Context from Research\n${researchContent}`;

    // 2. Call LLM
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software architect.' },
        { role: 'user', content: fullPrompt }
    ];

    const model = config.sddBrainModel || config.modelStrong || config.modelFast;
    const maxTokens = config.sddArchitectMaxTokens ?? 4000;

    let response = await callChat(config, messages, {
        model,
        temperature: 0,
        maxTokens
    });
    let content = response.messages[response.messages.length - 1].content || '';

    // Validation & Retry
    let validation = validateArchitectDoc(content);
    if (!validation.ok) {
        console.warn('Architect doc validation failed:', validation);
        if (validation.truncated) {
            console.log('Retrying architect.md generation due to truncation...');
            messages.push({ role: 'user', content: 'The previous output was truncated. Please regenerate the full document and ensure it is complete.' });
            response = await callChat(config, messages, {
                model,
                temperature: 0,
                maxTokens: Math.min(maxTokens * 1.2, 16000)
            });
            content = response.messages[response.messages.length - 1].content || '';
            validation = validateArchitectDoc(content);
        }
    }

    if (!validation.ok) {
        console.warn('Architect doc is still potentially incomplete after retry:', validation);
        content += '\n\n> [!WARNING]\n> This document may be incomplete or truncated. Please review manually.';
    }

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
    const promptTemplate = await loadRuntimePrompt('orchestrator_tickets');
    const prompt = promptTemplate
        .replace('{{ARCHITECT_CONTENT}}', architectContent || '')
        .replace('{{TICKET_TEMPLATE}}', ticketTemplate);

    // 2. Call LLM with retry
    const maxRetries = 3;
    let tickets: { filename: string; content: string }[] = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are an expert Project Manager. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
            ];

            const response = await callChat(config, messages, {
                model: config.sddBrainModel || config.modelFast,
                temperature: 0,
                maxTokens: config.sddTicketsMaxTokens ?? 2000,
                response_format: { type: 'json_object' }
            });
            let content = response.messages[response.messages.length - 1].content || '{}';

            // Try to parse
            let raw = content.trim();

            // Strip markdown fences if provider ignored response_format and wrapped JSON.
            if (raw.startsWith('```')) {
                const fenceMatch = raw.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n```$/);
                if (fenceMatch && fenceMatch[1]) {
                    raw = fenceMatch[1].trim();
                }
            }

            // Try direct parse first
            try {
                const parsed = JSON.parse(raw);
                tickets = parsed.tickets || [];
                if (tickets.length > 0) break; // Success!
            } catch {
                // Try jsonrepair
                try {
                    const repaired = jsonrepair(raw);
                    const parsed = JSON.parse(repaired);
                    tickets = parsed.tickets || [];
                    if (tickets.length > 0) break; // Success!
                } catch (repairError) {
                    console.error(`Attempt ${attempt}/${maxRetries} failed to parse tickets JSON:`, repairError);
                    if (attempt === maxRetries) {
                        // Last attempt - try to extract any JSON-like structure
                        const jsonMatch = raw.match(/\{[\s\S]*"tickets"[\s\S]*\[[\s\S]*\]/);
                        if (jsonMatch) {
                            try {
                                const extracted = jsonMatch[0] + '}';
                                const parsed = JSON.parse(extracted);
                                tickets = parsed.tickets || [];
                            } catch {
                                // Give up
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Attempt ${attempt}/${maxRetries} - LLM call failed:`, e);
            if (attempt === maxRetries) {
                console.error('All retry attempts exhausted');
            }
        }
    }

    // Fallback: if no tickets were produced, create a single coarse-grained ticket
    if (!tickets || tickets.length === 0) {
        console.warn('No tickets returned by LLM; creating a fallback ticket derived from the goal.');
        const safeGoal = goal.length > 200 ? `${goal.slice(0, 200)}…` : goal;
        tickets = [
            {
                filename: '01-main-goal.md',
                content: `# Ticket: 01 Main Goal\n\nSpec version: v1.0\n\n## Context\n\nThis ticket was generated automatically because ticket decomposition failed. It captures the main user goal so you can refine it manually.\n\n- Goal: \`${safeGoal}\`\n- See SDD files in \`.sdd/\` for project, architecture, and best practices.\n\n## Objective & Definition of Done\n\nImplement the main goal described above according to:\n- .sdd/project.md (Definition of Done)\n- .sdd/architect.md (architecture & constraints)\n- .sdd/best_practices.md (stack-specific guidance)\n\n## Steps\n1. Review .sdd/project.md, .sdd/architect.md, and .sdd/best_practices.md for this repo.\n2. Break the goal into smaller sub-tickets under \`.sdd/backlog/tickets/open/NN-*.md\`.\n3. Implement the most critical sub-ticket first.\n\n## Affected files/modules\n- To be refined by the developer/agent.\n\n## Tests\n- To be defined per refined sub-tickets.\n\n## Risks & Edge Cases\n- Ticket decomposition failed in the automatic step; ensure manual review of the goal and SDD before implementation.\n\n## Dependencies\n- None yet; use this ticket as the root for further backlog items.\n`
            }
        ];
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
