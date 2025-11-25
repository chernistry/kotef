import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KotefConfig } from '../../src/core/config.js';

const mocks = vi.hoisted(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: [] })
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: vi.fn().mockImplementation(function () {
            return {
                connect: mocks.connect,
                close: mocks.close,
                listTools: mocks.listTools,
                callTool: mocks.callTool
            };
        })
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: vi.fn().mockImplementation(function () {
            return {};
        })
    };
});

import { McpManager } from '../../src/mcp/client.js';

describe('MCP Integration', () => {
    let config: KotefConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        config = {
            rootDir: '/tmp',
            apiKey: 'test-key',
            mcpEnabled: true,
            mcpServers: {
                'test-server': 'npx test-server'
            }
        } as any;
    });

    it('should initialize clients based on config', async () => {
        const manager = new McpManager(config);
        await manager.initialize();

        expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it('should not initialize if disabled', async () => {
        config.mcpEnabled = false;
        const manager = new McpManager(config);
        await manager.initialize();

        expect(mocks.connect).not.toHaveBeenCalled();
    });

    it('should list tools from all servers', async () => {
        mocks.listTools.mockResolvedValue({
            tools: [
                { name: 'tool1', description: 'desc1' },
                { name: 'tool2', description: 'desc2' }
            ]
        });

        const manager = new McpManager(config);
        await manager.initialize();
        const tools = await manager.listAllTools();

        expect(tools).toHaveLength(2);
        expect(tools[0].server).toBe('test-server');
        expect(tools[0].name).toBe('tool1');
    });

    it('should route tool calls to correct server', async () => {
        mocks.listTools.mockResolvedValue({
            tools: [{ name: 'tool1' }]
        });
        mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });

        const manager = new McpManager(config);
        await manager.initialize();
        await manager.listAllTools(); // Populate mapping

        const result = await manager.callTool('tool1', { arg: 1 });

        expect(mocks.callTool).toHaveBeenCalledWith({
            name: 'tool1',
            arguments: { arg: 1 }
        });
        expect(result).toEqual({ content: [{ type: 'text', text: 'result' }] });
    });

    it('should throw if tool not found', async () => {
        const manager = new McpManager(config);
        await manager.initialize();
        await manager.listAllTools();

        await expect(manager.callTool('unknown-tool', {})).rejects.toThrow('not found');
    });
});
