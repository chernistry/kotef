import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export const KotefConfigSchema = z.object({
    rootDir: z.string().default(process.cwd()),
    /** Generic OpenAI-compatible API key (OpenAI, Anthropic via proxy, etc.) */
    apiKey: z.string().min(1, "API Key is required (OPENAI_API_KEY or KOTEF_API_KEY)"),
    /** Base URL for the LLM provider (OpenAI, OpenRouter, custom gateway, etc.). */
    baseUrl: z.string().default("https://api.openai.com/v1"),
    /** Default cheaper/faster model for planning, research, and non-critical calls. */
    modelFast: z.string().default("gpt-4.1.1"),
    /** Top-tier frontier model for final codegen or critical steps. */
    modelStrong: z.string().default("gpt-4.1.1"),

    searchApiKey: z.string().optional(),
    dryRun: z.boolean().default(true),

    /** Soft budget for a single run; used for guardrails, not hard guarantees. */
    maxTokensPerRun: z.number().default(10000),
    /** Max number of outbound web requests per run (search + fetch). */
    maxWebRequestsPerRun: z.number().default(30),
    /** Max tool call turns in coder node (overrides profile defaults). */
    maxCoderTurns: z.number().optional(),
    /** If true, use deterministic mock responses for LLM calls */
    mockMode: z.boolean().default(false),
    /** Max wall-clock seconds per run before graceful stop. */
    maxRunSeconds: z.number().default(300),
});

export type KotefConfig = z.infer<typeof KotefConfigSchema>;

export function loadConfig(env = process.env, argv = process.argv): KotefConfig {
    const args = argv.slice(2);
    const rootDirIndex = args.indexOf('--root');
    const rootDir = rootDirIndex !== -1 ? args[rootDirIndex + 1] : env.KOTEF_ROOT_DIR || process.cwd();

    const dryRun = env.KOTEF_DRY_RUN !== 'false'; // Default to true

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
        mockMode: env.KOTEF_MOCK_MODE === 'true',
    };

    return KotefConfigSchema.parse(config);
}
