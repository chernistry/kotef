export function createLogger(runId) {
    const log = (level, message, fields = {}) => {
        const entry = {
            ts: new Date().toISOString(),
            level,
            message,
            runId,
            ...fields,
        };
        console.log(JSON.stringify(entry));
    };
    return {
        info: (message, fields) => log('info', message, fields),
        warn: (message, fields) => log('warn', message, fields),
        error: (message, fields) => log('error', message, fields),
        debug: (message, fields) => log('debug', message, fields),
    };
}
