import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import os from 'node:os';

dotenv.config();

export const ModelRuntimeSchema = z.enum(['responses', 'legacy', 'kiro']);
export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high']);
export const ApprovalModeSchema = z.enum(['auto', 'confirm', 'human-gate']);
export const McpModeSchema = z.enum(['off', 'tools', 'context', 'full']);
export const TraceExporterSchema = z.enum(['local', 'otlp', 'langsmith']);

const RawKotefConfigSchema = z.object({
    rootDir: z.string().default(process.cwd()),
    apiKey: z.string().min(1, 'API Key is required (OPENAI_API_KEY or KOTEF_API_KEY)').optional(),
    baseUrl: z.string().default('https://api.openai.com/v1'),
    modelFast: z.string().default('gpt-5-mini'),
    modelStrong: z.string().default('gpt-5'),
    modelRuntime: ModelRuntimeSchema.default('responses'),
    reasoningEffort: ReasoningEffortSchema.default('medium'),
    structuredOutputs: z.boolean().default(true),
    approvalMode: ApprovalModeSchema.default('auto'),
    traceExporter: TraceExporterSchema.default('local'),

    searchApiKey: z.string().optional(),
    dryRun: z.boolean().default(false),
    maxTokensPerRun: z.number().default(10000),
    maxWebRequestsPerRun: z.number().default(30),
    offlineMode: z.boolean().default(false),
    maxCoderTurns: z.number().int().min(0).max(500).default(0),
    mockMode: z.boolean().default(false),
    maxRunSeconds: z.number().default(300),

    runtimeDir: z.string().optional(),
    eventsDir: z.string().optional(),
    memoryDir: z.string().optional(),

    enableTsLspDiagnostics: z.boolean().default(true),
    lspTimeout: z.number().default(30000),
    lspMaxFiles: z.number().default(50),

    mcpEnabled: z.boolean().default(false),
    mcpMode: McpModeSchema.default('off'),
    mcpApproval: ApprovalModeSchema.default('auto'),
    mcpServers: z.record(z.string(), z.string()).default({}),
    mcpServerAllowlist: z.array(z.string()).default([]),

    llmProvider: z.enum(['openai', 'kiro']).default('openai'),
    kiroCliPath: z.string().default('kiro-cli'),
    kiroModel: z.string().default('claude-sonnet-4.5'),
    coderMode: z.enum(['internal', 'kiro']).default('internal'),
    ticketBuilderLlm: z.enum(['openai', 'kiro']).default('openai'),
    kiroSessionTimeout: z.number().default(300000),

    gitEnabled: z.boolean().default(true),
    gitAutoInit: z.boolean().default(true),
    gitBinary: z.string().default('git'),

    sddBrainModel: z.string().optional(),
    sddBestPracticesMaxTokens: z.number().optional(),
    sddArchitectMaxTokens: z.number().optional(),
    sddTicketsMaxTokens: z.number().optional(),

    deepResearchMaxTokens: z.number().optional(),
    deepResearchMaxPages: z.number().optional(),
    deepResearchPageSnippetChars: z.number().optional(),
    deepResearchMaxFindings: z.number().optional(),

    sddSummaryInputChars: z.number().optional(),
    sddSummaryMaxTokens: z.number().optional(),

    maxTickets: z.number().int().min(1).optional(),
    debug: z.boolean().default(false),
    useConsolidatedPrompts: z.boolean().default(true),
});

export type KotefConfig = z.infer<typeof RawKotefConfigSchema> & {
    runtimeDir: string;
    eventsDir: string;
    memoryDir: string;
};

function expandPath(value: string): string {
    if (value.startsWith('~/') || value === '~') {
        return path.join(os.homedir(), value.slice(1));
    }
    return value;
}

function resolvePath(rootDir: string, value: string | undefined, fallback: string): string {
    if (!value) {
        return fallback;
    }
    const expanded = expandPath(value);
    return path.isAbsolute(expanded) ? expanded : path.resolve(rootDir, expanded);
}

function parseInteger(raw: string | undefined, fallback: number): number {
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOptionalInteger(raw: string | undefined): number | undefined {
    if (!raw) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) || parsed === 0 ? undefined : parsed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) {
        return fallback;
    }
    return raw === 'true';
}

function finalizeConfig(rawInput: z.input<typeof RawKotefConfigSchema>): KotefConfig {
    const parsed = RawKotefConfigSchema.parse(rawInput);
    const rootDir = path.resolve(expandPath(parsed.rootDir));
    const runtimeDir = resolvePath(rootDir, parsed.runtimeDir, path.join(rootDir, '.sdd', 'runtime'));
    const eventsDir = resolvePath(rootDir, parsed.eventsDir, path.join(runtimeDir, 'events'));
    const memoryDir = resolvePath(rootDir, parsed.memoryDir, path.join(runtimeDir, 'memory'));

    const modelRuntime = parsed.llmProvider === 'kiro' ? 'kiro' : parsed.modelRuntime;
    const mcpMode = parsed.mcpEnabled && parsed.mcpMode === 'off' ? 'tools' : parsed.mcpMode;

    const config: KotefConfig = {
        ...parsed,
        rootDir,
        modelRuntime,
        mcpMode,
        mcpEnabled: mcpMode !== 'off',
        runtimeDir,
        eventsDir,
        memoryDir,
    };

    if (config.modelRuntime !== 'kiro' && config.llmProvider === 'openai' && !config.apiKey && !config.mockMode) {
        throw new Error(
            'API Key is required when using the OpenAI runtime.\n' +
            'Set OPENAI_API_KEY or KOTEF_API_KEY,\n' +
            'or switch to Kiro: KOTEF_MODEL_RUNTIME=kiro'
        );
    }

    return config;
}

export function createKotefConfig(overrides: Partial<KotefConfig> = {}): KotefConfig {
    return finalizeConfig({
        apiKey: 'test-key',
        rootDir: process.cwd(),
        ...overrides,
    });
}

export function loadConfig(env = process.env, argv = process.argv): KotefConfig {
    const args = argv.slice(2);
    const rootDirIndex = args.indexOf('--root');
    const rootDirRaw = rootDirIndex !== -1 ? args[rootDirIndex + 1] : env.KOTEF_ROOT_DIR || process.cwd();
    const explicitDryRun = args.includes('--dry-run');
    const maxCoderTurns = Math.max(0, Math.min(500, parseInteger(env.MAX_CODER_TURNS, 0)));

    return finalizeConfig({
        rootDir: rootDirRaw,
        apiKey: env.CHAT_LLM_API_KEY || env.KOTEF_API_KEY || env.OPENAI_API_KEY,
        baseUrl: env.CHAT_LLM_BASE_URL || env.KOTEF_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        modelFast: env.KOTEF_MODEL_FAST || env.CHAT_LLM_MODEL || env.OPENAI_MODEL || 'gpt-5-mini',
        modelStrong: env.KOTEF_MODEL_STRONG || env.CHAT_LLM_MODEL || env.OPENAI_MODEL || 'gpt-5',
        modelRuntime: (env.KOTEF_MODEL_RUNTIME as z.infer<typeof ModelRuntimeSchema> | undefined)
            || ((env.CHAT_LLM_PROVIDER || env.KOTEF_LLM_PROVIDER) === 'kiro' ? 'kiro' : 'responses'),
        reasoningEffort: (env.KOTEF_REASONING_EFFORT as z.infer<typeof ReasoningEffortSchema> | undefined) || 'medium',
        structuredOutputs: parseBoolean(env.KOTEF_STRUCTURED_OUTPUTS, true),
        approvalMode: (env.KOTEF_APPROVAL_MODE as z.infer<typeof ApprovalModeSchema> | undefined) || 'auto',
        traceExporter: (env.KOTEF_TRACE_EXPORTER as z.infer<typeof TraceExporterSchema> | undefined) || 'local',

        searchApiKey: env.SEARCH_API_KEY || env.TAVILY_API_KEY || env.SERPER_API_KEY,
        dryRun: explicitDryRun || parseBoolean(env.KOTEF_DRY_RUN, false),
        maxRunSeconds: parseInteger(env.MAX_RUN_SECONDS, 300),
        maxTokensPerRun: parseInteger(env.MAX_TOKENS_PER_RUN, 100000),
        maxWebRequestsPerRun: parseInteger(env.MAX_WEB_REQUESTS_PER_RUN, 20),
        offlineMode: parseBoolean(env.KOTEF_OFFLINE, false),
        maxCoderTurns,
        mockMode: parseBoolean(env.KOTEF_MOCK_MODE, false),

        runtimeDir: env.KOTEF_RUNTIME_DIR,
        eventsDir: env.KOTEF_EVENTS_DIR,
        memoryDir: env.KOTEF_MEMORY_DIR,

        enableTsLspDiagnostics: env.ENABLE_TS_LSP_DIAGNOSTICS !== 'false',
        lspTimeout: parseInteger(env.LSP_TIMEOUT, 30000),
        lspMaxFiles: parseInteger(env.LSP_MAX_FILES, 50),

        mcpEnabled: parseBoolean(env.MCP_ENABLED, false),
        mcpMode: (env.KOTEF_MCP_MODE as z.infer<typeof McpModeSchema> | undefined) || 'off',
        mcpApproval: (env.KOTEF_MCP_APPROVAL as z.infer<typeof ApprovalModeSchema> | undefined) || 'auto',
        mcpServers: env.MCP_SERVERS ? JSON.parse(env.MCP_SERVERS) : {},
        mcpServerAllowlist: env.KOTEF_MCP_ALLOWLIST
            ? env.KOTEF_MCP_ALLOWLIST.split(',').map(value => value.trim()).filter(Boolean)
            : [],

        llmProvider: (env.CHAT_LLM_PROVIDER || env.KOTEF_LLM_PROVIDER || 'openai') as 'openai' | 'kiro',
        kiroCliPath: env.KIRO_CLI_PATH || 'kiro-cli',
        kiroModel: env.KIRO_MODEL || 'claude-sonnet-4.5',
        coderMode: (env.KOTEF_CODER_MODE || 'internal') as 'internal' | 'kiro',
        ticketBuilderLlm: (env.KOTEF_TICKET_BUILDER_LLM || 'openai') as 'openai' | 'kiro',
        kiroSessionTimeout: parseInteger(env.KIRO_SESSION_TIMEOUT, 300000),

        gitEnabled: env.KOTEF_NO_GIT !== 'true',
        gitAutoInit: env.KOTEF_GIT_AUTO_INIT !== 'false',
        gitBinary: env.GIT_BINARY || 'git',

        sddBrainModel: env.KOTEF_SDD_BRAIN_MODEL,
        sddBestPracticesMaxTokens: parseOptionalInteger(env.KOTEF_SDD_BEST_PRACTICES_MAX_TOKENS),
        sddArchitectMaxTokens: parseOptionalInteger(env.KOTEF_SDD_ARCHITECT_MAX_TOKENS),
        sddTicketsMaxTokens: parseOptionalInteger(env.KOTEF_SDD_TICKETS_MAX_TOKENS),

        deepResearchMaxTokens: parseOptionalInteger(env.KOTEF_DEEP_RESEARCH_MAX_TOKENS),
        deepResearchMaxPages: parseOptionalInteger(env.KOTEF_DEEP_RESEARCH_MAX_PAGES),
        deepResearchPageSnippetChars: parseOptionalInteger(env.KOTEF_DEEP_RESEARCH_PAGE_SNIPPET_CHARS),
        deepResearchMaxFindings: parseOptionalInteger(env.KOTEF_DEEP_RESEARCH_MAX_FINDINGS),

        sddSummaryInputChars: parseOptionalInteger(env.KOTEF_SDD_SUMMARY_INPUT_CHARS),
        sddSummaryMaxTokens: parseOptionalInteger(env.KOTEF_SDD_SUMMARY_MAX_TOKENS),

        maxTickets: parseOptionalInteger(env.KOTEF_MAX_TICKETS),
        debug: parseBoolean(env.KOTEF_DEBUG, false) || args.includes('--debug'),
        useConsolidatedPrompts: parseBoolean(env.KOTEF_USE_CONSOLIDATED_PROMPTS, true),
    });
}
