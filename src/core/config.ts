import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export const KotefConfigSchema = z.object({
    rootDir: z.string().default(process.cwd()),
    openaiApiKey: z.string().min(1, "OPENAI_API_KEY is required"),
    openaiBaseUrl: z.string().default("https://api.openai.com/v1"),
    openaiModel: z.string().default("gpt-4-turbo-preview"),
    searchApiKey: z.string().optional(),
    dryRun: z.boolean().default(true),
    maxTokensPerRun: z.number().default(10000),
});

export type KotefConfig = z.infer<typeof KotefConfigSchema>;

export function loadConfig(env = process.env, argv = process.argv): KotefConfig {
    // Parse command line arguments for overrides (simple implementation for now)
    // In a real CLI, we might use commander here, but for config loading we keep it simple
    // or assume argv has been parsed elsewhere. For now, we'll look for specific flags manually
    // or just rely on env vars as primary source.

    const args = argv.slice(2);
    const rootDirIndex = args.indexOf('--root');
    const rootDir = rootDirIndex !== -1 ? args[rootDirIndex + 1] : env.KOTEF_ROOT_DIR || process.cwd();

    const dryRun = env.KOTEF_DRY_RUN !== 'false'; // Default to true

    const config = {
        rootDir: path.resolve(rootDir),
        openaiApiKey: env.OPENAI_API_KEY,
        openaiBaseUrl: env.OPENAI_BASE_URL,
        openaiModel: env.OPENAI_MODEL,
        searchApiKey: env.SEARCH_API_KEY || env.TAVILY_API_KEY || env.SERPER_API_KEY,
        dryRun,
        maxTokensPerRun: env.MAX_TOKENS_PER_RUN ? parseInt(env.MAX_TOKENS_PER_RUN, 10) : undefined,
    };

    return KotefConfigSchema.parse(config);
}
