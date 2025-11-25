import { spawn, ChildProcess } from 'node:child_process';
import { createLogger } from '../core/logger.js';
import * as path from 'node:path';

const log = createLogger('ts_lsp_client');

export interface LspDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    code?: string | number;
}

export interface LspClientHandle {
    process: ChildProcess;
    rootDir: string;
    messageId: number;
    pendingRequests: Map<number, { resolve: (result: any) => void; reject: (error: any) => void; timeout: NodeJS.Timeout }>;
    diagnosticsCache: Map<string, LspDiagnostic[]>;
    buffer: string;
}

export interface LspServerOptions {
    rootDir: string;
    timeout?: number;
}

/**
 * Starts a TypeScript Language Server process.
 */
export async function startServer(opts: LspServerOptions): Promise<LspClientHandle> {
    const { rootDir, timeout = 30000 } = opts;

    log.info('Starting TypeScript Language Server', { rootDir });

    // Spawn typescript-language-server with --stdio
    const process = spawn('typescript-language-server', ['--stdio'], {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const handle: LspClientHandle = {
        process,
        rootDir,
        messageId: 0,
        pendingRequests: new Map(),
        diagnosticsCache: new Map(),
        buffer: ''
    };

    // Set up message handling
    process.stdout?.on('data', (data: Buffer) => {
        handleServerMessages(handle, data);
    });

    process.stderr?.on('data', (data: Buffer) => {
        log.warn('LSP server stderr', { data: data.toString() });
    });

    process.on('error', (error) => {
        log.error('LSP server process error', { error });
        // Reject all pending requests
        Array.from(handle.pendingRequests.entries()).forEach(([id, { reject, timeout }]) => {
            clearTimeout(timeout);
            reject(new Error(`LSP server error: ${error.message}`));
        });
        handle.pendingRequests.clear();
    });

    process.on('exit', (code) => {
        log.info('LSP server exited', { code });
    });

    // Initialize the server
    try {
        await sendJsonRpcRequest(handle, 'initialize', {
            processId: process.pid,
            rootUri: `file://${rootDir}`,
            capabilities: {
                textDocument: {
                    publishDiagnostics: {}
                }
            }
        }, timeout);

        // Send initialized notification
        sendJsonRpcNotification(handle, 'initialized', {});

        log.info('TypeScript Language Server initialized successfully');

        return handle;
    } catch (error) {
        process.kill();
        throw new Error(`Failed to initialize LSP server: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Stops the LSP server.
 */
export async function stopServer(handle: LspClientHandle): Promise<void> {
    log.info('Stopping TypeScript Language Server');

    // Send shutdown request
    try {
        await sendJsonRpcRequest(handle, 'shutdown', null, 5000);
    } catch (error) {
        log.warn('Shutdown request failed', { error });
    }

    // Send exit notification
    sendJsonRpcNotification(handle, 'exit', null);

    // Clear all pending requests
    Array.from(handle.pendingRequests.entries()).forEach(([id, { reject, timeout }]) => {
        clearTimeout(timeout);
        reject(new Error('Server stopped'));
    });
    handle.pendingRequests.clear();

    // Kill process if still alive
    if (!handle.process.killed) {
        handle.process.kill();
    }
}

/**
 * Gets diagnostics for specified files or entire project.
 */
export async function getDiagnostics(
    handle: LspClientHandle,
    files?: string[]
): Promise<LspDiagnostic[]> {
    const filesToCheck = files || []; // If no files, we'll rely on project-wide diagnostics

    // Open files to get diagnostics
    for (const file of filesToCheck) {
        const uri = `file://${path.resolve(handle.rootDir, file)}`;

        // Read file content
        const fs = await import('node:fs/promises');
        let content: string;
        try {
            content = await fs.readFile(path.resolve(handle.rootDir, file), 'utf-8');
        } catch (error) {
            log.warn('Failed to read file for LSP', { file, error });
            continue;
        }

        // Send textDocument/didOpen notification
        sendJsonRpcNotification(handle, 'textDocument/didOpen', {
            textDocument: {
                uri,
                languageId: 'typescript',
                version: 1,
                text: content
            }
        });
    }

    // Wait a bit for diagnostics to arrive (LSP sends them asynchronously via publishDiagnostics)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Collect diagnostics from cache
    const allDiagnostics: LspDiagnostic[] = [];
    Array.from(handle.diagnosticsCache.entries()).forEach(([uri, diagnostics]) => {
        allDiagnostics.push(...diagnostics);
    });

    return allDiagnostics;
}

/**
 * Sends a JSON-RPC request and waits for response.
 */
function sendJsonRpcRequest(
    handle: LspClientHandle,
    method: string,
    params: any,
    timeout = 10000
): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = ++handle.messageId;

        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        const timeoutHandle = setTimeout(() => {
            handle.pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${method}`));
        }, timeout);

        handle.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

        const message = JSON.stringify(request);
        const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

        handle.process.stdin?.write(header + message);
    });
}

/**
 * Sends a JSON-RPC notification (no response expected).
 */
function sendJsonRpcNotification(handle: LspClientHandle, method: string, params: any): void {
    const notification = {
        jsonrpc: '2.0',
        method,
        params
    };

    const message = JSON.stringify(notification);
    const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

    handle.process.stdin?.write(header + message);
}

/**
 * Handles incoming messages from the LSP server.
 */
function handleServerMessages(handle: LspClientHandle, data: Buffer): void {
    handle.buffer += data.toString();

    while (true) {
        // Parse headers
        const headerEnd = handle.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const headers = handle.buffer.slice(0, headerEnd);
        const contentLengthMatch = headers.match(/Content-Length: (\d+)/);

        if (!contentLengthMatch) {
            log.error('Invalid LSP message: missing Content-Length');
            handle.buffer = handle.buffer.slice(headerEnd + 4);
            continue;
        }

        const contentLength = parseInt(contentLengthMatch[1], 10);
        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;

        if (handle.buffer.length < messageEnd) {
            // Incomplete message, wait for more data
            break;
        }

        const messageContent = handle.buffer.slice(messageStart, messageEnd);
        handle.buffer = handle.buffer.slice(messageEnd);

        try {
            const message = JSON.parse(messageContent);
            handleMessage(handle, message);
        } catch (error) {
            log.error('Failed to parse LSP message', { error, messageContent });
        }
    }
}

/**
 * Handles a parsed LSP message.
 */
function handleMessage(handle: LspClientHandle, message: any): void {
    if (message.id !== undefined) {
        // Response to a request
        const pending = handle.pendingRequests.get(message.id);
        if (pending) {
            clearTimeout(pending.timeout);
            handle.pendingRequests.delete(message.id);

            if (message.error) {
                pending.reject(new Error(message.error.message || 'LSP request failed'));
            } else {
                pending.resolve(message.result);
            }
        }
    } else if (message.method === 'textDocument/publishDiagnostics') {
        // Diagnostics notification
        handlePublishDiagnostics(handle, message.params);
    } else {
        // Other notifications/requests from server
        log.debug('LSP server message', { method: message.method });
    }
}

/**
 * Handles publishDiagnostics notification from LSP server.
 */
function handlePublishDiagnostics(handle: LspClientHandle, params: any): void {
    const { uri, diagnostics } = params;

    const mapped: LspDiagnostic[] = diagnostics.map((d: any) => {
        // Convert LSP severity (1=Error, 2=Warning, 3=Info, 4=Hint)
        const severityMap: Record<number, LspDiagnostic['severity']> = {
            1: 'error',
            2: 'warning',
            3: 'info',
            4: 'hint'
        };

        // Extract file path from URI
        const filePath = uri.startsWith('file://')
            ? path.relative(handle.rootDir, uri.slice(7))
            : uri;

        return {
            file: filePath,
            line: d.range.start.line + 1, // LSP is 0-indexed
            column: d.range.start.character + 1,
            severity: severityMap[d.severity] || 'info',
            message: d.message,
            code: d.code
        };
    });

    handle.diagnosticsCache.set(uri, mapped);
}
