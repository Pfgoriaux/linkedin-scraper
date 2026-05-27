import 'dotenv/config';
import {
  buildHttpProxyUrl,
  buildFallbackProxyPool,
  pickFallbackProxy,
  createApp,
  startServer,
  fetchWithProxy,
  errorToStatusCode,
} from '@linkedin-scrapers/core';
import { extractCompanyInfo } from '@linkedin-scrapers/core/extractors/company-page';

// Primary proxy — always the same
const proxyUrl1 = buildHttpProxyUrl();

// Fallback pool — one is picked at random when the primary fails
const fallbackPool = buildFallbackProxyPool(5);

const app = createApp();

app.get('/scrape', async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Missing required parameter: query' });
  }

  const targetUrl = `https://www.linkedin.com/company/${encodeURIComponent(query)}/`;

  try {
    let response;

    // Try with primary proxy
    try {
      response = await fetchWithProxy(targetUrl, proxyUrl1, { timeout: 15000 });
    } catch (primaryError) {
      console.log(`[${new Date().toISOString()}] Primary proxy error: ${primaryError.message}`);
      const fallback = pickFallbackProxy(fallbackPool);
      if (fallback) {
        console.log(`[${new Date().toISOString()}] Trying random fallback proxy`);
        response = await fetchWithProxy(targetUrl, fallback, { timeout: 15000 });
      } else {
        throw primaryError;
      }
    }

    // If primary returned non-200, retry once with a random fallback
    if (response.status !== 200) {
      const fallback = pickFallbackProxy(fallbackPool);
      if (fallback) {
        console.log(`[${new Date().toISOString()}] Primary proxy got ${response.status}, trying random fallback proxy`);
        response = await fetchWithProxy(targetUrl, fallback, { timeout: 15000 });
      }
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        return res.status(404).json({ error: 'Company not found' });
      }
      if (status === 429) {
        return res.status(429).json({ error: 'Rate limited by LinkedIn' });
      }
      if ([403, 500, 502, 503].includes(status)) {
        return res.status(status).json({ error: `LinkedIn returned status ${status}` });
      }
      throw new Error(`LinkedIn returned status ${status}`);
    }

    const html = await response.text();
    const companyInfo = extractCompanyInfo(html);

    return res.json(companyInfo);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scrape error for "${query}":`, error.message);
    const status = errorToStatusCode(error);
    return res.status(status).json({ error: error.message });
  }
});

startServer(app, 3000);

console.log(`[${new Date().toISOString()}] Primary proxy: ${proxyUrl1 ? 'configured' : 'NOT configured'}`);
console.log(`[${new Date().toISOString()}] Fallback proxies: ${fallbackPool.length} configured`);
