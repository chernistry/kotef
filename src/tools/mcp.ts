import { McpManager } from '../mcp/client.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('mcp-tools');

export async function createMcpTools(manager: McpManager) {
    const tools = await manager.listAllTools();
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description || `MCP tool from ${tool.server}: ${tool.actualName}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
        }
    }));
}

export async function executeMcpTool(manager: McpManager, toolName: string, args: unknown) {
    try {
        log.info(`Executing MCP tool ${toolName}`, { args });
        return await manager.callTool(toolName, args);
    } catch (error: any) {
        log.error(`MCP tool execution failed: ${toolName}`, { error: error.message });
        throw error;
    }
}
