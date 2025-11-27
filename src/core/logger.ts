import { formatLogForConsole } from './log_formatter.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
    component?: string;
    event?: string;
    runId?: string;
    [key: string]: unknown;
}

export type Logger = {
    info: (message: string, fields?: LogFields) => void;
    warn: (message: string, fields?: LogFields) => void;
    error: (message: string, fields?: LogFields) => void;
    debug: (message: string, fields?: LogFields) => void;
};

let prettyConsoleEnabled = process.env.KOTEF_PRETTY_LOGS !== 'false';

export function setPrettyConsole(enabled: boolean) {
    prettyConsoleEnabled = enabled;
}

export function createLogger(runId: string): Logger {
    const log = (level: LogLevel, message: string, fields: LogFields = {}) => {
        const entry = {
            ts: new Date().toISOString(),
            level,
            message,
            runId,
            ...fields,
        };
        
        // Pretty console output for user
        if (prettyConsoleEnabled) {
            try {
                formatLogForConsole(entry);
            } catch {
                // Fallback to JSON if formatter fails
            }
        }
        
        // Always write JSON to stdout for log files
        console.log(JSON.stringify(entry));
    };

    return {
        info: (message: string, fields?: LogFields) => log('info', message, fields),
        warn: (message: string, fields?: LogFields) => log('warn', message, fields),
        error: (message: string, fields?: LogFields) => log('error', message, fields),
        debug: (message: string, fields?: LogFields) => log('debug', message, fields),
    };
}
