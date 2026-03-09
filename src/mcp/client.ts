import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { KotefConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('mcp-client');

export interface NamespacedMcpTool {
    name: string;
    actualName: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    server: string;
}

export interface McpContextSnapshot {
    server: string;
    tools: Array<{ name: string; description?: string }>;
    prompts: Array<{ name: string; description?: string }>;
    resources: Array<{ uri: string; name?: string; description?: string }>;
    resourceTemplates: Array<{ uriTemplate: string; name: string; description?: string }>;
    roots: string[];
    capabilities: unknown;
    updatedAt: string;
}

function namespaceToolName(serverName: string, toolName: string): string {
    const safeServer = serverName.replace(/[^a-zA-Z0-9]+/g, '_');
    return `mcp__${safeServer}__${toolName}`;
}

function splitCommand(commandLine: string): { command: string; args: string[] } {
    const parts = commandLine.split(' ').map(part => part.trim()).filter(Boolean);
    return {
        command: parts[0] ?? commandLine,
        args: parts.slice(1),
    };
}

export class McpClientWrapper {
    private readonly client: Client;
    private readonly transport: StdioClientTransport;

    constructor(
        public readonly serverName: string,
        commandLine: string
    ) {
        const { command, args } = splitCommand(commandLine);
        this.transport = new StdioClientTransport({ command, args });
        this.client = new Client(
            {
                name: 'kotef-mcp-client',
                version: '0.2.0',
            },
            {
                capabilities: {},
            }
        );
    }

    async connect(): Promise<void> {
        log.info(`Connecting to MCP server: ${this.serverName}`);
        await this.client.connect(this.transport);
        log.info(`Connected to MCP server: ${this.serverName}`);
    }

    getServerCapabilities(): unknown {
        return this.client.getServerCapabilities();
    }

    getServerVersion(): unknown {
        return this.client.getServerVersion();
    }

    listTools() {
        return this.client.listTools();
    }

    listPrompts() {
        return this.client.listPrompts();
    }

    getPrompt(name: string, args?: Record<string, string>) {
        return this.client.getPrompt({ name, arguments: args });
    }

    listResources() {
        return this.client.listResources();
    }

    listResourceTemplates() {
        return this.client.listResourceTemplates();
    }

    readResource(uri: string) {
        return this.client.readResource({ uri });
    }

    callTool(name: string, args: unknown) {
        log.info(`Calling MCP tool ${name} on ${this.serverName}`);
        return this.client.callTool({
            name,
            arguments: args as Record<string, unknown>,
        });
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}

export class McpManager {
    private readonly clients = new Map<string, McpClientWrapper>();
    private readonly toolToServer = new Map<string, { server: string; actualName: string }>();

    constructor(private readonly config: KotefConfig) { }

    private getSnapshotDir(): string {
        return path.join(this.config.rootDir, '.sdd', 'context', 'mcp');
    }

    private async writeSnapshot(serverName: string, snapshot: McpContextSnapshot): Promise<void> {
        const snapshotDir = this.getSnapshotDir();
        await fs.mkdir(snapshotDir, { recursive: true });
        const snapshotPath = path.join(snapshotDir, `${serverName}.json`);
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    }

    private getAllowedServers(): Array<[string, string]> {
        const entries = Object.entries(this.config.mcpServers || {});
        const allowlist = this.config.mcpServerAllowlist ?? [];
        if (allowlist.length === 0) {
            return entries;
        }
        const allowed = new Set(allowlist);
        return entries.filter(([name]) => allowed.has(name));
    }

    async initialize(): Promise<void> {
        const enabled = this.config.mcpMode ? this.config.mcpMode !== 'off' : Boolean(this.config.mcpEnabled);
        if (!enabled) {
            log.info('MCP integration disabled');
            return;
        }

        for (const [name, commandLine] of this.getAllowedServers()) {
            try {
                const client = new McpClientWrapper(name, commandLine);
                await client.connect();
                this.clients.set(name, client);
            } catch (error) {
                log.error(`Failed to initialize MCP server ${name}`, { error });
            }
        }
    }

    async listAllTools(): Promise<NamespacedMcpTool[]> {
        const tools: NamespacedMcpTool[] = [];
        this.toolToServer.clear();

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const response = await client.listTools();
                for (const tool of response.tools) {
                    const namespacedName = namespaceToolName(serverName, tool.name);
                    this.toolToServer.set(namespacedName, { server: serverName, actualName: tool.name });
                    if (!this.toolToServer.has(tool.name)) {
                        this.toolToServer.set(tool.name, { server: serverName, actualName: tool.name });
                    }
                    tools.push({
                        name: namespacedName,
                        actualName: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                        server: serverName,
                    });
                }
            } catch (error) {
                log.error(`Failed to list tools from ${serverName}`, { error });
            }
        }

        return tools;
    }

    async listAllPrompts(): Promise<Array<{ server: string; name: string; description?: string }>> {
        const prompts: Array<{ server: string; name: string; description?: string }> = [];

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const response = await client.listPrompts();
                prompts.push(...response.prompts.map(prompt => ({
                    server: serverName,
                    name: prompt.name,
                    description: prompt.description,
                })));
            } catch (error) {
                log.error(`Failed to list prompts from ${serverName}`, { error });
            }
        }

        return prompts;
    }

    async listAllResources(): Promise<Array<{ server: string; uri: string; name?: string; description?: string }>> {
        const resources: Array<{ server: string; uri: string; name?: string; description?: string }> = [];

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const response = await client.listResources();
                resources.push(...response.resources.map(resource => ({
                    server: serverName,
                    uri: resource.uri,
                    name: resource.name,
                    description: resource.description,
                })));
            } catch (error) {
                log.error(`Failed to list resources from ${serverName}`, { error });
            }
        }

        return resources;
    }

    async listAllResourceTemplates(): Promise<Array<{ server: string; uriTemplate: string; name: string; description?: string }>> {
        const templates: Array<{ server: string; uriTemplate: string; name: string; description?: string }> = [];

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const response = await client.listResourceTemplates();
                templates.push(...response.resourceTemplates.map(template => ({
                    server: serverName,
                    uriTemplate: template.uriTemplate,
                    name: template.name,
                    description: template.description,
                })));
            } catch (error) {
                log.error(`Failed to list resource templates from ${serverName}`, { error });
            }
        }

        return templates;
    }

    async getPrompt(serverName: string, name: string, args?: Record<string, string>) {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server ${serverName} is not connected`);
        }
        return client.getPrompt(name, args);
    }

    async readResource(serverName: string, uri: string) {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server ${serverName} is not connected`);
        }
        return client.readResource(uri);
    }

    async createContextSnapshot(): Promise<McpContextSnapshot[]> {
        const snapshots: McpContextSnapshot[] = [];

        for (const [serverName, client] of this.clients.entries()) {
            const [tools, prompts, resources, resourceTemplates] = await Promise.all([
                client.listTools().catch(() => ({ tools: [] })),
                client.listPrompts().catch(() => ({ prompts: [] })),
                client.listResources().catch(() => ({ resources: [] })),
                client.listResourceTemplates().catch(() => ({ resourceTemplates: [] })),
            ]);

            const snapshot: McpContextSnapshot = {
                server: serverName,
                tools: tools.tools.map(tool => ({ name: namespaceToolName(serverName, tool.name), description: tool.description })),
                prompts: prompts.prompts.map(prompt => ({ name: prompt.name, description: prompt.description })),
                resources: resources.resources.map(resource => ({ uri: resource.uri, name: resource.name, description: resource.description })),
                resourceTemplates: resourceTemplates.resourceTemplates.map(template => ({
                    uriTemplate: template.uriTemplate,
                    name: template.name,
                    description: template.description,
                })),
                roots: [this.config.rootDir],
                capabilities: client.getServerCapabilities(),
                updatedAt: new Date().toISOString(),
            };

            await this.writeSnapshot(serverName, snapshot);
            snapshots.push(snapshot);
        }

        return snapshots;
    }

    async doctor(): Promise<Array<{ server: string; version: unknown; capabilities: unknown; connected: boolean }>> {
        const report = [];

        for (const [serverName, client] of this.clients.entries()) {
            report.push({
                server: serverName,
                version: client.getServerVersion(),
                capabilities: client.getServerCapabilities(),
                connected: true,
            });
        }

        return report;
    }

    async callTool(namespacedToolName: string, args: unknown) {
        const target = this.toolToServer.get(namespacedToolName);
        if (!target) {
            throw new Error(`Tool ${namespacedToolName} not found in any connected MCP server`);
        }

        const client = this.clients.get(target.server);
        if (!client) {
            throw new Error(`MCP server ${target.server} is not connected`);
        }

        return client.callTool(target.actualName, args);
    }

    async closeAll(): Promise<void> {
        for (const client of this.clients.values()) {
            await client.close();
        }
    }
}

export { namespaceToolName };
