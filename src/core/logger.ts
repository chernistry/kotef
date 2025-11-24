export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
    component?: string;
    event?: string;
    runId?: string;
    [key: string]: unknown;
}

export function createLogger(runId: string) {
    return function log(level: LogLevel, message: string, fields: LogFields = {}): void {
        const entry = {
            ts: new Date().toISOString(),
            level,
            message,
            runId,
            ...fields,
        };
        console.log(JSON.stringify(entry));
    };
}
