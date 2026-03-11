/**
 * Build a Patchright/Playwright browser proxy config object from env vars.
 * Supports both PROXY_SERVER (full URL) and PROXY_HOST+PROXY_PORT formats.
 * @param {string} [suffix=''] - e.g. '_2' for fallback proxy env vars
 * @returns {{ server: string, username?: string, password?: string } | null}
 */
export function buildBrowserProxyConfig(suffix = '') {
    const server = process.env[`PROXY_SERVER${suffix}`];
    if (server) {
        return {
            server,
            username: process.env[`PROXY_USERNAME${suffix}`],
            password: process.env[`PROXY_PASSWORD${suffix}`],
        };
    }

    const host = process.env[`PROXY_HOST${suffix}`];
    const port = process.env[`PROXY_PORT${suffix}`];
    if (host) {
        return {
            server: `http://${host}:${port}`,
            username: process.env[`PROXY_USERNAME${suffix}`],
            password: process.env[`PROXY_PASSWORD${suffix}`],
        };
    }

    return null;
}

/**
 * Build a full HTTP proxy URL string (for node-fetch / HttpsProxyAgent).
 * @param {string} [suffix=''] - e.g. '_2' for fallback proxy env vars
 * @returns {string | null}
 */
export function buildHttpProxyUrl(suffix = '') {
    const server = process.env[`PROXY_SERVER${suffix}`];
    if (server) {
        const username = process.env[`PROXY_USERNAME${suffix}`];
        const password = process.env[`PROXY_PASSWORD${suffix}`];
        if (username && password) {
            const url = new URL(server);
            url.username = username;
            url.password = password;
            return url.toString();
        }
        return server;
    }

    const host = process.env[`PROXY_HOST${suffix}`];
    const port = process.env[`PROXY_PORT${suffix}`];
    if (host) {
        const username = process.env[`PROXY_USERNAME${suffix}`];
        const password = process.env[`PROXY_PASSWORD${suffix}`];
        if (username && password) {
            return `http://${username}:${password}@${host}:${port}`;
        }
        return `http://${host}:${port}`;
    }

    return null;
}
