import 'dotenv/config';
import { createApp, startServer } from '@linkedin-scrapers/core';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { extractDirectoryCompanies } from '@linkedin-scrapers/core/extractors/directory';

const app = createApp();

const delay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
  );

function getRequestHeaders(randomIP, directoryUrl, customCookie) {
  const basePath = new URL(directoryUrl).origin;
  return {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'en-US,en;q=0.9',
    cookie: customCookie,
    dnt: '1',
    priority: 'u=0, i',
    referer: basePath,
    'sec-ch-ua':
      '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'X-Forwarded-For': randomIP,
  };
}

app.get('/scrape-directory', async (req, res) => {
  const { url, proxyUrl, cookie } = req.query;

  if (!url || !proxyUrl) {
    return res.status(400).json({ error: 'Missing required query parameters: url, proxyUrl' });
  }

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const randomIP = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 256)
      ).join('.');

      const agent = new HttpsProxyAgent(proxyUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const headers = getRequestHeaders(randomIP, url, cookie);

      const response = await fetch(url, {
        headers,
        agent,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 999) {
        await delay(2000, 5000);
        continue;
      }

      if (response.status === 404) {
        return res.status(404).json({ error: 'Directory page not found' });
      }

      if (
        response.status === 429 ||
        response.status === 403 ||
        response.status >= 500
      ) {
        await delay(2000, 5000);
        continue;
      }

      const html = await response.text();

      if (!html.includes('listings__entry')) {
        await delay(2000, 5000);
        continue;
      }

      const companies = extractDirectoryCompanies(html);

      if (companies.length === 0) {
        await delay(2000, 5000);
        continue;
      }

      return res.json({ companies });
    } catch (error) {
      if (attempt < maxRetries) {
        await delay(2000, 5000);
        continue;
      }
    }
  }

  return res.status(429).json({ error: 'Failed to scrape directory after multiple retries' });
});

startServer(app, 3000);
