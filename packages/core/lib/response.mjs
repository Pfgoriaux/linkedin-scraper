/**
 * Create a standardized API response object.
 */
export function createResponse(data, error = null, statusCode = 200) {
    return {
        data,
        error,
        statusCode,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Map common error messages to HTTP status codes.
 */
export function errorToStatusCode(error) {
    const msg = error.message || '';
    if (msg.includes('timeout') || msg.includes('Timeout') || error.name === 'AbortError') return 504;
    if (msg.includes('net::ERR') || msg.includes('Client network socket disconnected')) return 503;
    return 500;
}
