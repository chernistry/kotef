import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { KotefConfig } from "../core/config.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("mcp-client");

export class McpClientWrapper {
    private client: Client;
    private transport: StdioClientTransport;
    private serverName: string;

    constructor(serverName: string, command: string, args: string[] = []) {
        this.serverName = serverName;
        this.transport = new StdioClientTransport({
            command,
            args,
        });
        this.client = new Client(
            {
                name: "kotef-mcp-client",
                version: "0.1.0",
            },
            {
                capabilities: {
                    // Client capabilities
                },
            }
        );
    }

    async connect() {
        log.info(`Connecting to MCP server: ${this.serverName}`);
        await this.client.connect(this.transport);
        log.info(`Connected to MCP server: ${this.serverName}`);
    }

    async listTools() {
        return await this.client.listTools();
    }

    async callTool(name: string, args: any) {
        log.info(`Calling MCP tool ${name} on ${this.serverName}`);
        return await this.client.callTool({
            name,
            arguments: args,
        });
    }

    async close() {
        await this.client.close();
    }
}

export class McpManager {
    private clients: Map<string, McpClientWrapper> = new Map();
    private toolToServer: Map<string, string> = new Map();

    constructor(private config: KotefConfig) { }

    async initialize() {
        if (!this.config.mcpEnabled) {
            log.info("MCP integration disabled");
            return;
        }

        for (const [name, commandStr] of Object.entries(this.config.mcpServers || {})) {
            try {
                const parts = commandStr.split(" ");
                const command = parts[0];
                const args = parts.slice(1);

                const client = new McpClientWrapper(name, command, args);
                await client.connect();
                this.clients.set(name, client);
            } catch (error) {
                log.error(`Failed to initialize MCP server ${name}`, { error });
            }
        }
    }

    async listAllTools() {
        const allTools: any[] = [];
        this.toolToServer.clear();

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const tools = await client.listTools();
                for (const tool of tools.tools) {
                    // We prefix tool names with "mcp__" to avoid collisions and make it clear
                    // Or we can keep original names if they are unique.
                    // For safety, let's keep original names but warn on collision.
                    if (this.toolToServer.has(tool.name)) {
                        log.warn(`Tool collision: ${tool.name} exists in multiple servers. Keeping first.`);
                        continue;
                    }
                    this.toolToServer.set(tool.name, serverName);
                    allTools.push({ ...tool, server: serverName });
                }
            } catch (error) {
                log.error(`Failed to list tools from ${serverName}`, { error });
            }
        }
        return allTools;
    }

    getClientForTool(toolName: string): McpClientWrapper | undefined {
        const serverName = this.toolToServer.get(toolName);
        if (!serverName) return undefined;
        return this.clients.get(serverName);
    }

    async callTool(toolName: string, args: any) {
        const serverName = this.toolToServer.get(toolName);
        if (!serverName) {
            throw new Error(`Tool ${toolName} not found in any connected MCP server`);
        }
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server ${serverName} not found (unexpected)`);
        }
        return await client.callTool(toolName, args);
    }

    async closeAll() {
        for (const client of this.clients.values()) {
            await client.close();
        }
    }
}
