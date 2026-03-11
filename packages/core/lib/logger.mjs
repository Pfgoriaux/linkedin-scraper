export const logger = {
    info: (message, data = {}) =>
        console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), message, ...data })),
    error: (message, error, data = {}) => {
        const errorMessage = error ? error.message : 'Unknown error occurred';
        const errorStack = error ? error.stack : 'No stack trace available';
        console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), message, error: errorMessage, stack: errorStack, ...data }));
    },
    warn: (message, data = {}) =>
        console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), message, ...data })),
};
