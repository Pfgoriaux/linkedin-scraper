import { logger } from './logger.mjs';

const HEADLESS = process.env.HEADLESS !== 'false';

/**
 * Launch a local Patchright/Playwright Chromium browser.
 * @param {object} [chromium] - The chromium object from patchright or playwright
 * @param {object} [opts] - Override launch options
 */
export async function launchBrowser(chromium, opts = {}) {
    logger.info('Launching local Chrome browser');
    return chromium.launch({
        headless: HEADLESS,
        channel: 'chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ],
        ...opts,
    });
}

/**
 * Connect to a remote browser via WebSocket.
 * @param {object} chromium - The chromium object from patchright or playwright
 * @param {string} [wsEndpoint] - WebSocket endpoint URL (defaults to BROWSER_WS_ENDPOINT env var)
 */
export async function connectBrowser(chromium, wsEndpoint) {
    const endpoint = wsEndpoint || process.env.BROWSER_WS_ENDPOINT;
    if (!endpoint) throw new Error('BROWSER_WS_ENDPOINT environment variable is not set.');
    logger.info('Connecting to remote browser...');
    return chromium.connect(endpoint, { timeout: 60000 });
}

/**
 * Create a public LinkedIn browser context (no cookies/auth).
 * @param {object} browser
 * @param {object} [proxyConfig] - Patchright proxy config object
 */
export async function createPublicContext(browser, proxyConfig) {
    const contextOptions = {
        viewport: null,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { longitude: -74.006, latitude: 40.7128 },
        permissions: ['geolocation'],
    };

    if (proxyConfig) {
        contextOptions.proxy = proxyConfig;
        logger.info('Using proxy configuration');
    }

    return browser.newContext(contextOptions);
}

/**
 * Create a Sales Navigator browser context (with cookies and auth headers).
 * @param {object} browser
 * @param {{ cookies: Array, userAgent: string, csrfToken: string }} auth
 * @param {object} [overrides] - Extra context options
 */
export async function createSalesNavContext(browser, { cookies, userAgent, csrfToken, referer }, overrides = {}) {
    const context = await browser.newContext({
        userAgent,
        storageState: { cookies },
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080 },
        timezoneId: 'Europe/Paris',
        locale: 'fr-FR',
        ...overrides,
    });

    const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)/);
    const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '139';
    const secChUa = `"Not;A=Brand";v="99", "Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}"`;

    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
        'accept': '*/*',
        'accept-language': 'fr,fr-FR;q=0.9,en-US;q=0.8,en;q=0.7',
        'priority': 'u=1, i',
        'referer': referer || 'https://www.linkedin.com/sales/search/people?viewAllFilters=true',
        'sec-ch-ua': secChUa,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-ch-prefers-color-scheme': 'dark',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': userAgent,
        'x-li-lang': 'fr_FR',
        'x-restli-protocol-version': '2.0.0',
        'csrf-token': csrfToken,
    });

    return { context, page };
}

/**
 * Safely close browser resources (page, context, browser).
 */
export async function safelyCloseResources(page, context, browser) {
    const errors = [];
    if (page && !page.isClosed()) {
        try { await page.close(); } catch (e) { errors.push(`Page close: ${e.message}`); }
    }
    if (context) {
        try { await context.close(); } catch (e) { errors.push(`Context close: ${e.message}`); }
    }
    if (browser) {
        try { await browser.close(); } catch (e) { errors.push(`Browser close: ${e.message}`); }
    }
    if (errors.length > 0) {
        logger.warn(`Resource cleanup warnings: ${errors.join(', ')}`);
    }
}
