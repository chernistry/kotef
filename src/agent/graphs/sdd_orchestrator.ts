import { StateGraph, START, END } from '@langchain/langgraph';
import { KotefConfig } from '../../core/config.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { renderBrainTemplate, loadBrainTemplate } from '../../sdd/template_driver.js';
import { deepResearch, DeepResearchFinding } from '../../tools/deep_research.js';
import { loadPrompt, loadRuntimePrompt } from '../../core/prompts.js';
import { parseLlmJson } from '../utils/llm_json.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBestPracticesDoc, validateArchitectDoc } from '../utils/sdd_validation.js';

/**
 * Call LLM for ticket building - switches between OpenAI and Kiro based on config
 */
async function callTicketLlm(
    config: KotefConfig,
    messages: ChatMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number; response_format?: { type: 'json_object' | 'text' } }
): Promise<{ messages: ChatMessage[] }> {
    if (config.ticketBuilderLlm === 'kiro') {
        const { KiroConversationBackend } = await import('../../core/kiro_conversation_backend.js');
        const kiro = new KiroConversationBackend();
        return kiro.callChat(config, messages, options);
    }
    return callChat(config, messages, options);
}

export interface SddOrchestratorState {
    goal: string;
    rootDir: string;
    config: KotefConfig;
    researchContent?: string;
    architectContent?: string;
    ticketsCreated?: string[];
    scopeAnalysis?: {
        appetite: 'Small' | 'Batch' | 'Big';
        constraints: string[];
        reasoning: string;
    };
}

export interface ProjectMetadata {
    techStack: string;
    domain: string;
    projectDescription: string;
}

/**
 * Consolidated SDD flow: Research + Architect in one LLM call (Ticket 02)
 */
async function sddUnderstandAndDesign(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running Consolidated SDD: Understand & Design...');
    const { goal, rootDir, config } = state;
    const metadata = await loadProjectMetadata(rootDir, goal);

    // 1. Run web-backed deep research
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
    } catch (e) {
        console.warn('Deep research failed, proceeding with model-only:', e);
    }

    const findingsContext = findings.length === 0
        ? 'No external web findings available. Use conservative defaults.'
        : findings.map((f, idx) => {
            const sources = f.citations.map(c => `- ${c.url}`).join('\n');
            return `(${idx + 1}) ${f.statement}\nSources:\n${sources}`;
        }).join('\n\n');

    // 2. Render consolidated prompt
    const prompt = renderBrainTemplate('understand_and_design', {
        projectName: path.basename(rootDir),
        domain: metadata.domain,
        techStack: metadata.techStack,
        projectDescription: metadata.projectDescription,
        year: new Date().getFullYear(),
        goal,
        additionalContext: findingsContext
    });

    // 3. Single LLM call for both documents
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software researcher and architect. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
    ];

    const model = config.sddBrainModel || config.modelStrong || config.modelFast;
    const maxTokens = (config.sddBestPracticesMaxTokens ?? 10000) + (config.sddArchitectMaxTokens ?? 4000);

    const response = await callChat(config, messages, {
        model,
        temperature: 0,
        maxTokens,
        response_format: { type: 'json_object' } as any
    });

    const content = response.messages[response.messages.length - 1].content || '{}';

    // 4. Parse JSON response
    const parseResult = parseLlmJson<{ bestPractices?: string; architect?: string; scopeAnalysis?: { appetite: string; constraints: string[]; reasoning: string } }>(content);
    if (parseResult.ok === false) {
        console.error('Failed to parse consolidated response:', parseResult.error.message);
        throw new Error(`Failed to parse understand_and_design response: ${parseResult.error.kind}`);
    }
    const parsed = parseResult.value;

    // 4.5. Save scopeAnalysis to intent_contract cache for downstream use
    if (parsed.scopeAnalysis) {
        console.log(`Scope Analysis: appetite=${parsed.scopeAnalysis.appetite}, constraints=${parsed.scopeAnalysis.constraints?.length || 0}`);
        const cacheDir = path.join(rootDir, '.sdd', 'cache');
        await fs.mkdir(cacheDir, { recursive: true });
        const intentContract = {
            goal,
            appetite: parsed.scopeAnalysis.appetite || 'Batch',
            constraints: parsed.scopeAnalysis.constraints || [],
            nonGoals: [],
            dodChecks: [],
            forbiddenPaths: []
        };
        await fs.writeFile(path.join(cacheDir, 'intent_contract.json'), JSON.stringify(intentContract, null, 2));
    }

    // 5. Write files
    const sddDir = path.join(rootDir, '.sdd');
    await fs.mkdir(sddDir, { recursive: true });

    if (parsed.bestPractices) {
        await fs.writeFile(path.join(sddDir, 'best_practices.md'), parsed.bestPractices);
        console.log('✓ Generated best_practices.md');
    }
    if (parsed.architect) {
        await fs.writeFile(path.join(sddDir, 'architect.md'), parsed.architect);
        console.log('✓ Generated architect.md');
    }

    return {
        researchContent: parsed.bestPractices || '',
        architectContent: parsed.architect || '',
        scopeAnalysis: parsed.scopeAnalysis ? {
            appetite: parsed.scopeAnalysis.appetite as 'Small' | 'Batch' | 'Big',
            constraints: parsed.scopeAnalysis.constraints || [],
            reasoning: parsed.scopeAnalysis.reasoning || ''
        } : undefined
    };
}

/**
 * Consolidated ticket generation: All tickets in one LLM call (Ticket 02)
 */
async function sddPlanWork(state: SddOrchestratorState): Promise<Partial<SddOrchestratorState>> {
    console.log('Running Consolidated SDD: Plan Work (batch tickets)...');
    const { goal, rootDir, config, architectContent } = state;

    // Load scopeAnalysis from cache (written by sddUnderstandAndDesign)
    let scopeAnalysis: { appetite: string; constraints: string[] } | null = null;
    try {
        const cachePath = path.join(rootDir, '.sdd', 'cache', 'intent_contract.json');
        const content = await fs.readFile(cachePath, 'utf-8');
        scopeAnalysis = JSON.parse(content);
    } catch {
        // No scope analysis available
    }

    // Build code map (simple file listing)
    let codeMap = '';
    try {
        const { execa } = await import('execa');
        const { stdout } = await execa('find', ['.', '-maxdepth', '3', '-type', 'f', '-name', '*.ts', '-o', '-name', '*.js'], { cwd: rootDir });
        codeMap = stdout.split('\n').filter(Boolean).slice(0, 50).join('\n');
    } catch {
        codeMap = '(code map unavailable)';
    }

    // Determine max tickets based on appetite
    let effectiveMaxTickets = config.maxTickets;
    if (scopeAnalysis?.appetite === 'Small' && (!effectiveMaxTickets || effectiveMaxTickets > 2)) {
        effectiveMaxTickets = 2;
        console.log('Scope is Small, limiting to 2 tickets max');
    } else if (scopeAnalysis?.appetite === 'Batch' && (!effectiveMaxTickets || effectiveMaxTickets > 5)) {
        effectiveMaxTickets = Math.min(effectiveMaxTickets || 5, 5);
    }

    const maxTicketsText = effectiveMaxTickets
        ? `Generate EXACTLY ${effectiveMaxTickets} tickets. No more.`
        : '';

    // Add scope context to prompt
    const scopeContext = scopeAnalysis
        ? `\n\n## Scope Analysis (from goal)\n- Appetite: ${scopeAnalysis.appetite}\n- Constraints: ${scopeAnalysis.constraints?.join(', ') || 'none'}\n\nRESPECT THIS SCOPE. If appetite is Small, generate only minor tweaks, not infrastructure.`
        : '';

    const prompt = renderBrainTemplate('plan_work', {
        projectName: path.basename(rootDir),
        domain: '',
        techStack: '',
        year: new Date().getFullYear(),
        goal,
        additionalContext: `Code Map:\n${codeMap}\n\nMax Tickets Constraint: ${maxTicketsText}${scopeContext}`
    })
        .replace('{{ARCHITECT_CONTENT}}', architectContent || '')
        .replace('{{CODE_MAP}}', codeMap)
        .replace('{{MAX_TICKETS_CONSTRAINT}}', maxTicketsText);

    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert Project Manager. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
    ];

    const response = await callTicketLlm(config, messages, {
        model: config.sddBrainModel || config.modelFast,
        temperature: 0,
        maxTokens: config.sddTicketsMaxTokens ?? 8000,
        response_format: { type: 'json_object' }
    });

    const content = response.messages[response.messages.length - 1].content || '{}';

    // Parse response
    let tickets: { filename: string; title: string; content: string }[] = [];
    const parseResult = parseLlmJson<{ tickets?: { filename: string; title: string; content: string }[] }>(content);
    if (parseResult.ok === true) {
        tickets = parseResult.value.tickets || [];
    } else {
        console.error('Failed to parse plan_work response:', parseResult.error.message, `(${parseResult.error.kind})`);
    }

    // Enforce maxTickets
    if (config.maxTickets && tickets.length > config.maxTickets) {
        tickets = tickets.slice(0, config.maxTickets);
    }

    // Write tickets
    const ticketsDir = path.join(rootDir, '.sdd/backlog/tickets/open');
    await fs.mkdir(ticketsDir, { recursive: true });
    const createdFiles: string[] = [];

    for (const ticket of tickets) {
        const filePath = path.join(ticketsDir, ticket.filename);
        await fs.writeFile(filePath, ticket.content);
        createdFiles.push(ticket.filename);
        console.log(`✓ Created ticket: ${ticket.filename}`);
    }

    return { ticketsCreated: createdFiles };
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

        // Ticket 03: Write to normalized research cache for runtime reuse
        const { saveResearchCache } = await import('../utils/research_cache.js');
        await saveResearchCache(rootDir, {
            goal,
            query: goal,
            findings,
            quality: result.quality,
            updatedAt: Date.now()
        });
        console.log('Saved research to cache for runtime reuse');
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

    // Check for existing best_practices.md (Ticket 66: Partial File Handling)
    const sddDirForCheck = path.join(rootDir, '.sdd');
    const bestPracticesPath = path.join(sddDirForCheck, 'best_practices.md');
    let existingContent = '';
    try {
        existingContent = await fs.readFile(bestPracticesPath, 'utf-8');
        const validation = validateBestPracticesDoc(existingContent);
        if (validation.ok) {
            console.log('Found valid existing best_practices.md, skipping generation.');
            return { researchContent: existingContent };
        }
        console.log('Found partial/invalid best_practices.md, attempting to complete/repair...');
    } catch {
        // File doesn't exist, proceed with generation
    }

    console.log('Generating best_practices.md with LLM...');

    const { techStack, domain, projectDescription } = metadata;

    // 2. Render prompt with web research injected as additional context
    let prompt = renderBrainTemplate('research', {
        projectName: path.basename(rootDir),
        domain,
        techStack,
        projectDescription,
        year: new Date().getFullYear(),
        goal,
        additionalContext: `Web research findings for goal "${goal}":\n\n${findingsContext}`
    });

    // If we have partial content, inject it into the prompt
    if (existingContent) {
        prompt += `\n\nIMPORTANT: A partial draft of the document already exists. Please use it as a starting point and COMPLETE it, fixing any missing sections or validation errors. Do not start from scratch if the draft is good.\n\nEXISTING DRAFT:\n${existingContent}`;
    }

    // 3. Call LLM to synthesize best_practices.md from template + findings
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert software researcher.' },
        { role: 'user', content: prompt }
    ];

    const model = config.sddBrainModel || config.modelStrong || config.modelFast;
    const baseTokens = config.sddBestPracticesMaxTokens ?? 10000; // Increased from 4000

    // Progressive token strategy: 10k -> 20k -> 30k
    const tokenLimits = [10000, 20000, 30000];
    const maxRetries = 3;

    let content = '';
    let validation: any = { ok: false };

    for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
        const currentTokenLimit = tokenLimits[Math.min(retryAttempt, tokenLimits.length - 1)];

        if (retryAttempt > 0) {
            console.log(`Retrying best_practices.md generation (attempt ${retryAttempt + 1}/${maxRetries}) with ${currentTokenLimit} tokens...`);
        }

        // Prepare messages for this attempt
        const attemptMessages = [...messages];
        if (retryAttempt > 0) {
            attemptMessages.push({
                role: 'user',
                content: prompt + '\n\nIMPORTANT: Ensure the document is complete and includes ALL required sections:\n' +
                    '1. Best Practices & Research (heading)\n' +
                    '2. 1. TL;DR\n' +
                    '3. 2. Landscape\n' +
                    '4. 3. Architecture Patterns\n' +
                    '5. 4. Conflicting Practices & Alternatives\n' +
                    '6. 5. References\n\n' +
                    'If you are running out of tokens, prioritize completeness over verbosity.'
            });
        }

        const response = await callChat(config, attemptMessages, {
            model,
            temperature: 0,
            maxTokens: currentTokenLimit
        });

        content = response.messages[response.messages.length - 1].content || '';
        validation = validateBestPracticesDoc(content);

        console.log(`  ${validation.ok ? '✓' : '⚠'} Validation ${validation.ok ? 'passed' : 'failed'}${validation.truncated ? ' (truncated)' : ''}`);

        if (validation.ok) {
            break; // Success!
        }

        if (!validation.truncated && retryAttempt < maxRetries - 1) {
            // If not truncated but still invalid (missing sections), log and retry
            console.warn('  ⚠ Validation failed for best_practices.md');
            console.log(JSON.stringify({ missingSections: validation.missingSections, warnings: validation.warnings }));
        }
    }

    if (!validation.ok) {
        console.error('❌ Best practices doc failed validation after all retries:', validation);
        throw new Error(`Failed to generate valid best_practices.md after ${maxRetries} attempts. Missing sections: ${validation.missingSections?.join(', ') || 'unknown'}`);
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

    // Check for existing architect.md
    const sddDirForCheck = path.join(rootDir, '.sdd');
    const architectPath = path.join(sddDirForCheck, 'architect.md');
    let existingContent = '';
    try {
        existingContent = await fs.readFile(architectPath, 'utf-8');
        const validation = validateArchitectDoc(existingContent);
        if (validation.ok) {
            console.log('Found valid existing architect.md, skipping generation.');
            return { architectContent: existingContent };
        }
        console.log('Found partial/invalid architect.md, attempting to complete/repair...');
    } catch {
        // File doesn't exist
    }

    let prompt = renderBrainTemplate('architect', {
        projectName: path.basename(rootDir),
        domain,
        techStack,
        projectDescription,
        year: new Date().getFullYear(),
        goal,
        research: researchContent
    });

    if (existingContent) {
        prompt += `\n\nIMPORTANT: A partial draft of the document already exists. Please use it as a starting point and COMPLETE it, fixing any missing sections or validation errors.\n\nEXISTING DRAFT:\n${existingContent}`;
    }

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
    console.log('Running SDD Tickets (Two-Phase Generation)...');
    const { goal, rootDir, config, architectContent } = state;

    // 1. Construct Prompt Template
    const ticketTemplate = loadBrainTemplate('ticket');
    const promptTemplate = await loadRuntimePrompt('orchestrator_tickets');

    // Determine maxTickets constraint
    const maxTickets = config.maxTickets;
    const maxTicketsText = maxTickets
        ? `\n4. **Limit**: Generate EXACTLY ${maxTickets} ticket${maxTickets > 1 ? 's' : ''}. Do not generate more than ${maxTickets}.`
        : '';

    // Ticket 07: Build Code Map from project summary
    let codeMapText = 'No code map available.';
    try {
        const { buildProjectSummary } = await import('../utils/project_summary.js');
        const summary = await buildProjectSummary(rootDir, config);
        codeMapText = [
            `Project type: ${summary.projectType}`,
            `Languages: ${summary.languages.join(', ')}`,
            `Frameworks: ${summary.frameworks.join(', ')}`,
            `Entry points: ${summary.entryPoints.slice(0, 10).join(', ')}`,
            `Key modules: ${summary.keyModules.slice(0, 15).join(', ')}`
        ].join('\n');
    } catch (e) {
        console.warn('Failed to build code map:', e);
    }

    // --- PHASE 1: PLANNING ---
    console.log('Phase 1: Planning tickets...');
    const planPrompt = promptTemplate
        .replace('{{ARCHITECT_CONTENT}}', architectContent || '')
        .replace('{{CODE_MAP}}', codeMapText)
        .replace('{{MODE}}', 'PLAN_ONLY')
        .replace('{{TICKET_TEMPLATE}}', '') // Not needed for planning
        .replace('{{TICKET_TITLE}}', '')
        .replace('{{TICKET_SUMMARY}}', '')
        .replace('{{MAX_TICKETS_CONSTRAINT}}', maxTicketsText);

    let plannedTickets: { filename: string; title: string; summary: string }[] = [];
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are an expert Project Manager. Always respond with valid JSON.' },
                { role: 'user', content: planPrompt }
            ];

            const response = await callTicketLlm(config, messages, {
                model: config.sddBrainModel || config.modelFast,
                temperature: 0,
                maxTokens: 2000,
                response_format: { type: 'json_object' }
            });
            const content = response.messages[response.messages.length - 1].content || '{}';

            // Parse logic
            const parseResult = parseLlmJson<{ tickets?: { filename: string; title: string; summary: string }[] }>(content);
            if (parseResult.ok === true) {
                plannedTickets = parseResult.value.tickets || [];
                if (plannedTickets.length > 0) break;
            } else {
                console.error(`Phase 1 attempt ${attempt} failed parse:`, parseResult.error.message);
            }
        } catch (e) {
            console.error(`Phase 1 attempt ${attempt} failed LLM:`, e);
        }
    }

    if (plannedTickets.length === 0) {
        console.warn('Phase 1 failed to generate a plan. Falling back to single-shot fallback.');
        // Fallback logic (simplified for brevity, similar to original)
        plannedTickets = [{
            filename: '01-main-goal.md',
            title: 'Main Goal',
            summary: 'Fallback ticket capturing the main goal.'
        }];
    }

    // Enforce maxTickets limit if set
    if (maxTickets && plannedTickets.length > maxTickets) {
        console.log(`Truncating ${plannedTickets.length} planned tickets to ${maxTickets} (maxTickets limit)`);
        plannedTickets = plannedTickets.slice(0, maxTickets);
    }

    console.log(`Phase 1 complete. Planned ${plannedTickets.length} tickets.`);

    // --- PHASE 2: GENERATION ---
    const ticketsDir = path.join(rootDir, '.sdd/backlog/tickets/open');
    await fs.mkdir(ticketsDir, { recursive: true });
    const createdFiles: string[] = [];

    for (const [index, ticket] of plannedTickets.entries()) {
        console.log(`Phase 2: Generating ticket ${index + 1}/${plannedTickets.length}: ${ticket.filename}`);

        const genPrompt = promptTemplate
            .replace('{{ARCHITECT_CONTENT}}', architectContent || '')
            .replace('{{CODE_MAP}}', codeMapText)
            .replace('{{MODE}}', 'GENERATE_SINGLE')
            .replace('{{TICKET_TEMPLATE}}', ticketTemplate)
            .replace('{{TICKET_TITLE}}', ticket.title)
            .replace('{{TICKET_SUMMARY}}', ticket.summary)
            .replace('{{MAX_TICKETS_CONSTRAINT}}', '');

        let ticketContent = '';
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const messages: ChatMessage[] = [
                    { role: 'system', content: 'You are an expert Project Manager. Always respond with valid JSON.' },
                    { role: 'user', content: genPrompt }
                ];

                const response = await callTicketLlm(config, messages, {
                    model: config.sddBrainModel || config.modelFast,
                    temperature: 0,
                    maxTokens: config.sddTicketsMaxTokens ?? 2000,
                    response_format: { type: 'json_object' }
                });
                const content = response.messages[response.messages.length - 1].content || '{}';

                const parseResult = parseLlmJson<{ content?: string }>(content);
                if (parseResult.ok === true && parseResult.value.content) {
                    ticketContent = parseResult.value.content;
                    break;
                } else if (parseResult.ok === false) {
                    console.error(`Phase 2 ticket ${ticket.filename} attempt ${attempt} failed parse:`, parseResult.error.message);
                }
            } catch (e) {
                console.error(`Phase 2 ticket ${ticket.filename} attempt ${attempt} failed LLM:`, e);
            }
        }

        if (!ticketContent) {
            console.warn(`Failed to generate content for ${ticket.filename}, using fallback.`);
            ticketContent = `# Ticket: ${ticket.title}\n\nSummary: ${ticket.summary}\n\n> WARNING: Generation failed.`;
        }

        const filePath = path.join(ticketsDir, ticket.filename);
        await fs.writeFile(filePath, ticketContent);
        createdFiles.push(ticket.filename);
    }

    return { ticketsCreated: createdFiles };
}

// Define the original (legacy) graph
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

// Define the consolidated graph (Ticket 02)
const consolidatedWorkflow = new StateGraph<SddOrchestratorState>({
    channels: {
        goal: { value: (x: string, y: string) => y ?? x, default: () => '' },
        rootDir: { value: (x: string, y: string) => y ?? x, default: () => '' },
        config: { value: (x: KotefConfig, y: KotefConfig) => y ?? x, default: () => ({} as any) },
        researchContent: { value: (x: string, y: string) => y ?? x, default: () => '' },
        architectContent: { value: (x: string, y: string) => y ?? x, default: () => '' },
        ticketsCreated: { value: (x: string[], y: string[]) => y ?? x, default: () => [] },
        scopeAnalysis: { value: (x: any, y: any) => y ?? x, default: () => undefined }
    }
})
    .addNode('sdd_understand_and_design', sddUnderstandAndDesign)
    .addNode('sdd_plan_work', sddPlanWork)
    .addEdge(START, 'sdd_understand_and_design')
    .addEdge('sdd_understand_and_design', 'sdd_plan_work')
    .addEdge('sdd_plan_work', END);

const consolidatedApp = consolidatedWorkflow.compile();

export async function runSddOrchestration(
    cfg: KotefConfig,
    rootDir: string,
    goal: string
): Promise<void> {
    console.log(`Starting SDD Orchestration for goal: "${goal}"`);

    // Use consolidated prompts if enabled (Ticket 02)
    if (cfg.useConsolidatedPrompts) {
        console.log('Using consolidated prompts (2 LLM calls instead of 4+)');
        await consolidatedApp.invoke({
            goal,
            rootDir,
            config: cfg
        });
    } else {
        await app.invoke({
            goal,
            rootDir,
            config: cfg
        });
    }

    console.log('SDD Orchestration completed.');
}
