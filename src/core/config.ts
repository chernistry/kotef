
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

// Load environment variables from .env file
dotenv.config();

export const KotefConfigSchema = z.object({
    rootDir: z.string().default(process.cwd()),
    /** Generic OpenAI-compatible API key (OpenAI, Anthropic via proxy, etc.) */
    apiKey: z.string().min(1, "API Key is required (OPENAI_API_KEY or KOTEF_API_KEY)").optional(),
    /** Base URL for the LLM provider (OpenAI, OpenRouter, custom gateway, etc.). */
    baseUrl: z.string().default("https://api.openai.com/v1"),
    /** Default cheaper/faster model for planning, research, and non-critical calls. */
    modelFast: z.string().default("gpt-4.1.1"),
    /** Top-tier frontier model for final codegen or critical steps. */
    modelStrong: z.string().default("gpt-4.1.1"),

    searchApiKey: z.string().optional(),
    dryRun: z.boolean().default(false),

    /** Soft budget for a single run; used for guardrails, not hard guarantees. */
    maxTokensPerRun: z.number().default(10000),
    /** Max number of outbound web requests per run (search + fetch). */
    maxWebRequestsPerRun: z.number().default(30),
    /** Skip web research entirely (offline mode). */
    offlineMode: z.boolean().default(false),
    /** Max tool call turns in coder node (0 = use profile defaults, 1-500 = hard cap). */
    maxCoderTurns: z.number().int().min(0).max(500).default(0),
    /** If true, use deterministic mock responses for LLM calls */
    mockMode: z.boolean().default(false),
    /** Max wall-clock seconds per run before graceful stop. */
    maxRunSeconds: z.number().default(300),

    /** LSP Diagnostics (Ticket 33) */
    /** Enable TypeScript LSP diagnostics (default: true) */
    enableTsLspDiagnostics: z.boolean().default(true),
    /** Timeout for LSP server operations in ms (default: 30000) */
    lspTimeout: z.number().default(30000),
    /** Max number of files to check with LSP in one run (default: 50) */
    lspMaxFiles: z.number().default(50),

    /**
     * Enable experimental MCP integration
     */
    mcpEnabled: z.boolean().default(false),

    /**
     * Map of MCP server names to their command lines (for stdio transport)
     * e.g. { "serena": "npx serena-mcp" }
     */
    mcpServers: z.record(z.string(), z.string()).default({}),

    /** LLM provider: 'openai' (default) or 'kiro' */
    llmProvider: z.enum(['openai', 'kiro']).default('openai'),

    /** Path to kiro-cli binary */
    kiroCliPath: z.string().default('kiro-cli'),

    /** Kiro model to use (e.g., 'claude-sonnet-4.5') */
    kiroModel: z.string().default('claude-sonnet-4.5'),

    /** Coder implementation: 'internal' (default) or 'kiro' */
    coderMode: z.enum(['internal', 'kiro']).default('internal'),

    /** Ticket builder LLM: 'openai' (uses CHAT_LLM_PROVIDER) or 'kiro' */
    ticketBuilderLlm: z.enum(['openai', 'kiro']).default('openai'),

    /** Timeout for Kiro agent sessions in ms (default: 5 minutes) */
    kiroSessionTimeout: z.number().default(300000),

    /** Git integration: enable git features (default: true) */
    gitEnabled: z.boolean().default(true),
    /** Git integration: auto-initialize repos when missing (default: true) */
    gitAutoInit: z.boolean().default(true),
    /** Git integration: path to git binary (default: 'git') */
    gitBinary: z.string().default('git'),

    /** Ticket 64: SDD Brain Config */
    sddBrainModel: z.string().optional(),
    sddBestPracticesMaxTokens: z.number().optional(),
    sddArchitectMaxTokens: z.number().optional(),
    sddTicketsMaxTokens: z.number().optional(),

    /** Ticket 65: Deep Research Config */
    deepResearchMaxTokens: z.number().optional(),
    deepResearchMaxPages: z.number().optional(),
    deepResearchPageSnippetChars: z.number().optional(),
    deepResearchMaxFindings: z.number().optional(),

    /** Ticket 65: SDD Summary Config */
    sddSummaryInputChars: z.number().optional(),
    sddSummaryMaxTokens: z.number().optional(),

    /** Max number of tickets to generate during SDD orchestration (default: undefined = no limit) */
    maxTickets: z.number().int().min(1).optional(),

    /** Ticket 02: Use consolidated prompts for SDD orchestration (reduces LLM calls) */
    useConsolidatedPrompts: z.boolean().default(false),
});

export type KotefConfig = z.infer<typeof KotefConfigSchema>;

function expandPath(p: string): string {
    if (p.startsWith('~/') || p === '~') {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}

export function loadConfig(env = process.env, argv = process.argv): KotefConfig {
    const args = argv.slice(2);
    const rootDirIndex = args.indexOf('--root');
    const rootDirRaw = rootDirIndex !== -1 ? args[rootDirIndex + 1] : env.KOTEF_ROOT_DIR || process.cwd();
    const rootDir = expandPath(rootDirRaw);

    // Ticket 57: Default dryRun to false (git enabled by default).
    // Allow opting OUT via --dry-run flag or env var.
    const explicitDryRun = args.includes('--dry-run');
    const dryRun = explicitDryRun || (env.KOTEF_DRY_RUN === 'true');

    // Parse and validate MAX_CODER_TURNS
    const maxCoderTurnsEnv = parseInt(env.MAX_CODER_TURNS || '0', 10);
    const maxCoderTurns = isNaN(maxCoderTurnsEnv) ? 0 : Math.max(0, Math.min(500, maxCoderTurnsEnv));

    const config = {
        rootDir: path.resolve(rootDir),
        apiKey: env.CHAT_LLM_API_KEY || env.KOTEF_API_KEY || env.OPENAI_API_KEY,
        baseUrl: env.CHAT_LLM_BASE_URL || env.KOTEF_BASE_URL || env.OPENAI_BASE_URL,
        modelFast: env.CHAT_LLM_MODEL || env.KOTEF_MODEL_FAST || env.OPENAI_MODEL || "gpt-4.1.1",
        modelStrong: env.CHAT_LLM_MODEL || env.KOTEF_MODEL_STRONG || env.OPENAI_MODEL || "gpt-4.1.1",
        searchApiKey: env.SEARCH_API_KEY || env.TAVILY_API_KEY || env.SERPER_API_KEY,
        dryRun,
        maxRunSeconds: parseInt(env.MAX_RUN_SECONDS || '300', 10),
        maxTokensPerRun: parseInt(env.MAX_TOKENS_PER_RUN || '100000', 10),
        maxWebRequestsPerRun: parseInt(env.MAX_WEB_REQUESTS_PER_RUN || '20', 10),
        offlineMode: env.KOTEF_OFFLINE === 'true',
        maxCoderTurns,
        mockMode: env.KOTEF_MOCK_MODE === 'true',

        // LSP config
        enableTsLspDiagnostics: env.ENABLE_TS_LSP_DIAGNOSTICS !== 'false',
        lspTimeout: parseInt(env.LSP_TIMEOUT || '30000', 10),
        lspMaxFiles: parseInt(env.LSP_MAX_FILES || '50', 10),

        // MCP config
        mcpEnabled: env.MCP_ENABLED === 'true',
        mcpServers: env.MCP_SERVERS ? JSON.parse(env.MCP_SERVERS) : {},

        // LLM provider config
        llmProvider: (env.CHAT_LLM_PROVIDER || 'openai') as 'openai' | 'kiro',
        kiroCliPath: env.KIRO_CLI_PATH || 'kiro-cli',
        kiroModel: env.KIRO_MODEL || 'claude-sonnet-4.5',

        // Coder mode config
        coderMode: (env.KOTEF_CODER_MODE || 'internal') as 'internal' | 'kiro',
        ticketBuilderLlm: (env.KOTEF_TICKET_BUILDER_LLM || 'openai') as 'openai' | 'kiro',
        kiroSessionTimeout: parseInt(env.KIRO_SESSION_TIMEOUT || '300000', 10),

        // Git integration config
        gitEnabled: env.KOTEF_NO_GIT !== 'true',
        gitAutoInit: env.KOTEF_GIT_AUTO_INIT !== 'false',
        gitBinary: env.GIT_BINARY || 'git',

        // Ticket 64: SDD Brain Config
        sddBrainModel: env.KOTEF_SDD_BRAIN_MODEL, // Optional, defaults to modelStrong/modelFast logic
        sddBestPracticesMaxTokens: parseInt(env.KOTEF_SDD_BEST_PRACTICES_MAX_TOKENS || '0', 10) || undefined,
        sddArchitectMaxTokens: parseInt(env.KOTEF_SDD_ARCHITECT_MAX_TOKENS || '0', 10) || undefined,
        sddTicketsMaxTokens: parseInt(env.KOTEF_SDD_TICKETS_MAX_TOKENS || '0', 10) || undefined,

        // Ticket 65: Deep Research Config
        deepResearchMaxTokens: parseInt(env.KOTEF_DEEP_RESEARCH_MAX_TOKENS || '0', 10) || undefined,
        deepResearchMaxPages: parseInt(env.KOTEF_DEEP_RESEARCH_MAX_PAGES || '0', 10) || undefined,
        deepResearchPageSnippetChars: parseInt(env.KOTEF_DEEP_RESEARCH_PAGE_SNIPPET_CHARS || '0', 10) || undefined,
        deepResearchMaxFindings: parseInt(env.KOTEF_DEEP_RESEARCH_MAX_FINDINGS || '0', 10) || undefined,

        // Ticket 65: SDD Summary Config
        sddSummaryInputChars: parseInt(env.KOTEF_SDD_SUMMARY_INPUT_CHARS || '0', 10) || undefined,
        sddSummaryMaxTokens: parseInt(env.KOTEF_SDD_SUMMARY_MAX_TOKENS || '0', 10) || undefined,

        // Max tickets for SDD orchestration
        maxTickets: parseInt(env.KOTEF_MAX_TICKETS || '0', 10) || undefined,
    };

    const parsed = KotefConfigSchema.parse(config);

    // Validate: if using OpenAI provider, apiKey is required
    if (parsed.llmProvider === 'openai' && !parsed.apiKey) {
        throw new Error(
            'API Key is required when using OpenAI provider.\n' +
            'Set CHAT_LLM_API_KEY or OPENAI_API_KEY environment variable,\n' +
            'or switch to Kiro provider: CHAT_LLM_PROVIDER=kiro'
        );
    }

    return parsed;
}
