import 'dotenv/config';
import {
  buildBrowserProxyConfig,
  createApp,
  startServer,
  launchBrowser,
  createPublicContext,
  safelyCloseResources,
  scrollUntilStale,
} from '@linkedin-scrapers/core';
import { logger } from '@linkedin-scrapers/core/logger';
import { chromium } from 'patchright';
import * as cheerio from 'cheerio';
import url from 'url';

const PROXY_CONFIG = buildBrowserProxyConfig();

// ── Helper functions ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLinkedInAdsUrl(u) {
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname.includes('linkedin.com') &&
      parsed.pathname.startsWith('/ad-library/search')
    );
  } catch {
    return false;
  }
}

function isLinkedInAdDetailUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.pathname.startsWith('/ad-library/detail/');
  } catch {
    return false;
  }
}

// ── Scraping functions ──────────────────────────────────────────────────────

async function grabLinkedInAdIds(page, targetUrl) {
  logger.info('Navigating to LinkedIn Ads Library search page', { targetUrl });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });

  await sleep(5000);

  const adIds = new Set();
  let scrollsPerformed = 0;
  let noNewAdsCount = 0;
  let lastHeight = 0;

  while (true) {
    const content = await page.content();
    const $ = cheerio.load(content);
    const previousSize = adIds.size;

    $('a[href^="/ad-library/detail/"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const adIdPath = href.split('?')[0]; // strip query params
        adIds.add(adIdPath);
      }
    });

    if (adIds.size === previousSize) {
      noNewAdsCount++;
      logger.info(`No new ads found (stalled ${noNewAdsCount}/5)`, {
        totalAds: adIds.size,
        scrollsPerformed,
      });
      if (noNewAdsCount >= 5) {
        logger.info('Breaking after 5 stalled scrolls');
        break;
      }
    } else {
      noNewAdsCount = 0;
      logger.info(`Found ${adIds.size} unique ads so far`, { scrollsPerformed });
    }

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    scrollsPerformed++;

    const jitter = 3000 + Math.random() * 2000;
    await sleep(jitter);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === currentHeight) {
      logger.info('Page height unchanged after scroll, breaking');
      break;
    }

    lastHeight = newHeight;
  }

  logger.info('Finished grabbing ad IDs', {
    totalAds: adIds.size,
    scrollsPerformed,
  });

  return { adIds: Array.from(adIds), scrollsPerformed };
}

async function getLinkedInAdDetails(page, targetUrl) {
  logger.info('Navigating to LinkedIn Ad detail page', { targetUrl });

  const mediaUrls = { images: [], videos: [] };

  page.on('response', async (response) => {
    const responseUrl = response.url();
    try {
      if (responseUrl.includes('media.licdn.com/dms/image')) {
        mediaUrls.images.push(responseUrl);
      } else if (responseUrl.includes('dms.licdn.com/playlist/vid')) {
        mediaUrls.videos.push(responseUrl);
      }
    } catch {
      // ignore response processing errors
    }
  });

  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 60000,
  });

  // Try to click video play button if present
  try {
    await page.click('.ad-preview button.vjs-play-control', { timeout: 3000 });
    await sleep(2000);
  } catch {
    // No video play button found, that is okay
  }

  const content = await page.content();
  const $ = cheerio.load(content);

  const advertiser = $('a[data-tracking-control-name="ad_library_ad_detail_company_name"]').text().trim()
    || $('[class*="advertiser"]').first().text().trim()
    || '';

  const presentedBy = $('[class*="presented-by"]').text().trim()
    || advertiser;

  const parsedUrl = new URL(targetUrl);
  const id = parsedUrl.pathname.replace('/ad-library/detail/', '').replace(/\/$/, '');

  const contentText = $('[class*="ad-detail__content"]').text().trim()
    || $('[class*="ad-preview__body"]').text().trim()
    || '';

  const headline = $('[class*="ad-preview__headline"]').text().trim()
    || $('[class*="headline"]').first().text().trim()
    || '';

  const callToAction = $('[class*="ad-preview__cta"]').text().trim()
    || $('[class*="call-to-action"]').text().trim()
    || '';

  const landingPageUrl = $('a[class*="ad-preview__cta"]').attr('href')
    || $('a[class*="landing-page"]').attr('href')
    || '';

  const creative = {
    images: [...new Set(mediaUrls.images)],
    videos: [...new Set(mediaUrls.videos)],
  };

  const paidBy = $('[class*="paid-for"]').text().trim()
    || $('[class*="paid-by"]').text().trim()
    || '';

  const runDates = $('[class*="run-date"]').text().trim()
    || $('[class*="date-range"]').text().trim()
    || '';

  const impressions = $('[class*="impression"]').text().trim() || '';

  const adDetails = {
    id,
    advertiser,
    presentedBy,
    contentText,
    headline,
    callToAction,
    landingPageUrl,
    creative,
    paidBy,
    runDates,
    impressions,
    sourceUrl: targetUrl,
  };

  logger.info('Extracted ad details', { id, advertiser });

  return adDetails;
}

// ── Express app & routes ────────────────────────────────────────────────────

const app = createApp({
  healthPath: '/',
});

// Override the health endpoint to show available endpoints
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    endpoints: [
      { method: 'POST', path: '/scrapeLinkedInAds', description: 'Scrape ad IDs from LinkedIn Ads Library search page' },
      { method: 'POST', path: '/scrapeLinkedInAdDetail', description: 'Scrape details for a single LinkedIn ad' },
    ],
  });
});

app.post('/scrapeLinkedInAds', async (req, res) => {
  const { url: targetUrl } = req.body;

  if (!targetUrl || !isLinkedInAdsUrl(targetUrl)) {
    return res.status(400).json({
      error: 'Invalid or missing URL. Must be a LinkedIn Ads Library search URL (e.g. https://www.linkedin.com/ad-library/search?...)',
    });
  }

  let browser, context, page;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, PROXY_CONFIG);
    page = await context.newPage();

    const result = await grabLinkedInAdIds(page, targetUrl);

    return res.json({
      success: true,
      adIds: result.adIds,
      totalAds: result.adIds.length,
      scrollsPerformed: result.scrollsPerformed,
    });
  } catch (error) {
    logger.error('Error scraping LinkedIn Ads', error, { targetUrl });
    return res.status(500).json({ error: error.message });
  } finally {
    await safelyCloseResources(page, context, browser);
  }
});

app.post('/scrapeLinkedInAdDetail', async (req, res) => {
  const { url: targetUrl } = req.body;

  if (!targetUrl || !isLinkedInAdDetailUrl(targetUrl)) {
    return res.status(400).json({
      error: 'Invalid or missing URL. Must be a LinkedIn Ad detail URL (e.g. https://www.linkedin.com/ad-library/detail/...)',
    });
  }

  let browser, context, page;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, PROXY_CONFIG);
    page = await context.newPage();

    const adDetails = await getLinkedInAdDetails(page, targetUrl);

    return res.json({
      success: true,
      adDetails,
    });
  } catch (error) {
    logger.error('Error scraping LinkedIn Ad detail', error, { targetUrl });
    return res.status(500).json({ error: error.message });
  } finally {
    await safelyCloseResources(page, context, browser);
  }
});

startServer(app, 3000, (port) => {
  logger.info(`LinkedIn Ads Library scraper running on port ${port}`);
  logger.info(`Proxy: ${PROXY_CONFIG ? 'configured' : 'NOT configured'}`);
});
