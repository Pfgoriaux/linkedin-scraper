import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import UserAgent from 'user-agents';

/**
 * Perform an HTTP fetch through a proxy with random user-agent and spoofed headers.
 * @param {string} targetUrl
 * @param {string} proxyUrl - Full proxy URL (http://user:pass@host:port)
 * @param {object} [opts]
 * @param {number} [opts.timeout=15000]
 * @param {object} [opts.extraHeaders] - Additional headers to merge
 * @returns {Promise<import('node-fetch').Response>}
 */
export async function fetchWithProxy(targetUrl, proxyUrl, opts = {}) {
    const timeout = opts.timeout || 15000;
    const randomIP = `${Math.floor(Math.random() * 256)}.${Math.floor(
        Math.random() * 256
    )}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    const userAgent = new UserAgent();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(targetUrl, {
            agent: proxyAgent,
            signal: controller.signal,
            headers: {
                'User-Agent': userAgent.toString(),
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0',
                TE: 'Trailers',
                'X-Forwarded-For': randomIP,
                Referer: 'https://www.google.com/',
                ...opts.extraHeaders,
            },
        });

        clearTimeout(timer);
        return response;
    } catch (error) {
        clearTimeout(timer);
        throw error;
    }
}
