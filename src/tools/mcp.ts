import { McpManager } from "../mcp/client.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("mcp-tools");

export async function createMcpTools(manager: McpManager) {
    const mcpTools = await manager.listAllTools();

    return mcpTools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description || `MCP tool: ${tool.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} }
        }
    }));
}

export async function executeMcpTool(manager: McpManager, toolName: string, args: any) {
    try {
        log.info(`Executing MCP tool ${toolName}`, { args });
        const result = await manager.callTool(toolName, args);
        return result;
    } catch (error: any) {
        log.error(`MCP tool execution failed: ${toolName}`, { error: error.message });
        throw error;
    }
}
