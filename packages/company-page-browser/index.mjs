import 'dotenv/config';
import {
  buildBrowserProxyConfig,
  createApp,
  startServer,
  launchBrowser,
  createPublicContext,
  safelyCloseResources,
  errorToStatusCode,
} from '@linkedin-scrapers/core';
import { chromium } from 'patchright';
import { extractCompanyInfo } from '@linkedin-scrapers/core/extractors/company-page';

// Build proxy configs from environment variables
const PROXY_CONFIG_1 = buildBrowserProxyConfig();
const PROXY_CONFIG_2 = buildBrowserProxyConfig('_2');

const app = createApp();

async function scrapeWithProxy(targetUrl, proxyConfig, proxyLabel) {
  let browser, context;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, proxyConfig);

    const page = await context.newPage();
    const response = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    const status = response?.status();

    await page.waitForTimeout(2000);

    const html = await page.content();

    return { status, html };
  } finally {
    await safelyCloseResources(null, context, browser);
  }
}

app.get('/scrape', async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Missing required parameter: query' });
  }

  const targetUrl = `https://www.linkedin.com/company/${encodeURIComponent(query)}/`;

  try {
    let { status, html } = await scrapeWithProxy(targetUrl, PROXY_CONFIG_1, 'primary');

    // If rate-limited and a fallback proxy is available, retry with it
    if (status === 429 && PROXY_CONFIG_2) {
      console.log(`[${new Date().toISOString()}] Primary proxy rate-limited, retrying with fallback proxy`);
      ({ status, html } = await scrapeWithProxy(targetUrl, PROXY_CONFIG_2, 'fallback'));
    }

    if (status === 404) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'Rate limited by LinkedIn' });
    }
    if (status === 403 || status >= 500) {
      return res.status(status).json({ error: `LinkedIn returned status ${status}` });
    }

    const companyInfo = extractCompanyInfo(html);

    return res.json(companyInfo);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scrape error for "${query}":`, error.message);
    const status = errorToStatusCode(error);
    return res.status(status).json({ error: error.message });
  }
});

startServer(app, 3000, (port) => {
  console.log(`[${new Date().toISOString()}] Server running on port ${port}`);
  console.log(`[${new Date().toISOString()}] Headless: ${process.env.HEADLESS !== 'false'}`);
  console.log(`[${new Date().toISOString()}] Primary proxy: ${PROXY_CONFIG_1 ? 'configured' : 'NOT configured'}`);
  console.log(`[${new Date().toISOString()}] Fallback proxy: ${PROXY_CONFIG_2 ? 'configured' : 'NOT configured'}`);
});
