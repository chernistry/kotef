import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startServer, stopServer, getDiagnostics, LspClientHandle } from '../../src/tools/ts_lsp_client.js';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
    spawn: vi.fn()
}));

describe('TypeScript LSP Client', () => {
    let mockProcess: any;
    let dataCallback: ((data: Buffer) => void) | undefined;

    beforeEach(() => {
        dataCallback = undefined;
        mockProcess = {
            pid: 12345,
            stdin: {
                write: vi.fn()
            },
            stdout: {
                on: vi.fn((event: string, callback: any) => {
                    if (event === 'data') {
                        dataCallback = callback;
                    }
                })
            },
            stderr: {
                on: vi.fn()
            },
            on: vi.fn(),
            kill: vi.fn(),
            killed: false
        };

        vi.mocked(spawn).mockReturnValue(mockProcess);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('startServer', () => {
        it('should spawn typescript-language-server process', async () => {
            // Simulate successful initialize response immediately
            const promise = startServer({ rootDir: '/tmp/project', timeout: 1000 });

            // Wait for callback to be registered
            await new Promise(resolve => setTimeout(resolve, 5));
            
            if (dataCallback) {
                const response = {
                    jsonrpc: '2.0',
                    id: 1,
                    result: { capabilities: {} }
                };
                const message = JSON.stringify(response);
                const data = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
                dataCallback(Buffer.from(data));
            }

            await expect(promise).resolves.toBeDefined();

            expect(spawn).toHaveBeenCalledWith(
                'typescript-language-server',
                ['--stdio'],
                expect.objectContaining({ cwd: '/tmp/project' })
            );
        });

        it('should timeout if server does not respond', async () => {
            // Don't send any response

            await expect(
                startServer({ rootDir: '/tmp/project', timeout: 100 })
            ).rejects.toThrow(/timeout|initialize/i);
        });
    });

    describe('stopServer', () => {
        it.skip('should send shutdown request and kill process', async () => {
            const handle: LspClientHandle = {
                process: mockProcess,
                rootDir: '/tmp/project',
                messageId: 1,
                pendingRequests: new Map(),
                diagnosticsCache: new Map(),
                buffer: ''
            };

            // Mock immediate response to shutdown
            const promise = stopServer(handle);

            // Wait for callback to be registered
            await new Promise(resolve => setTimeout(resolve, 5));

            if (dataCallback) {
                const response = {
                    jsonrpc: '2.0',
                    id: 2,
                    result: null
                };
                const message = JSON.stringify(response);
                const data = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
                dataCallback(Buffer.from(data));
            }

            await promise;

            expect(mockProcess.kill).toHaveBeenCalled();
        }, 1000);
    });

    describe('getDiagnostics', () => {
        it('should open files and collect diagnostics', async () => {
            const handle: LspClientHandle = {
                process: mockProcess,
                rootDir: '/tmp/project',
                messageId: 1,
                pendingRequests: new Map(),
                diagnosticsCache: new Map([
                    ['file:///tmp/project/src/foo.ts', [
                        {
                            file: 'src/foo.ts',
                            line: 10,
                            column: 5,
                            severity: 'error',
                            message: 'Type error',
                            code: 'TS2322'
                        }
                    ]]
                ]),
                buffer: ''
            };

            // Mock fs.readFile
            vi.mock('node:fs/promises', () => ({
                default: {
                    readFile: vi.fn().mockResolvedValue('const x: number = "hello";')
                }
            }));

            const diagnostics = await getDiagnostics(handle, ['src/foo.ts']);

            expect(diagnostics.length).toBeGreaterThan(0);
            expect(diagnostics[0].severity).toBe('error');
        });
    });
});
