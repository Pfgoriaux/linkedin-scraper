import 'dotenv/config';
import {
  createApp,
  startServer,
  connectBrowser,
  createSalesNavContext,
  safelyCloseResources,
  cleanCookiesForBrowser,
  extractCsrfToken,
  humanLikeScroll,
} from '@linkedin-scrapers/core';
import { logger } from '@linkedin-scrapers/core/logger';
import { chromium } from 'patchright';

// --------------- Constants ---------------
const PAGINATION_LIMIT = 49;
const NAVIGATION_TIMEOUT = 90000;
const API_LAUNCH_TIMEOUT = 10000;
const MAX_RETRIES_PER_PAGE = 3;

// --------------- Helpers ---------------
function isSalesNavUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.includes('linkedin.com') && url.pathname.startsWith('/sales/search/company');
  } catch {
    return false;
  }
}

// --------------- App ---------------
const app = createApp();

// --------------- Core scraper ---------------
async function scrapeSalesNavigator(pageUrl, { cookies, csrfToken, userAgent }) {
  let browser, context, page, errorMessage;
  let allPageResponses = [];
  let finalCookiesArray = [];
  let finalCsrfToken = '';
  let apiRequestHeaders = null;
  let pagesScraped = 0;

  try {
    browser = await connectBrowser(chromium);

    ({ context, page } = await createSalesNavContext(browser, {
      cookies,
      userAgent,
      csrfToken,
      referer: 'https://www.linkedin.com/sales/search/company?viewAllFilters=true',
    }));

    for (let currentPage = 1; currentPage <= PAGINATION_LIMIT; currentPage++) {
      let pageSuccess = false;

      for (let retry = 0; retry < MAX_RETRIES_PER_PAGE; retry++) {
        try {
          const responsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/sales-api/salesApiAccountSearch') && resp.status() === 200,
            { timeout: NAVIGATION_TIMEOUT },
          );

          const requestPromise = page.waitForRequest(
            (req) => req.url().includes('/sales-api/salesApiAccountSearch'),
            { timeout: NAVIGATION_TIMEOUT },
          );

          // Build paginated URL
          const url = new URL(pageUrl);
          url.searchParams.set('page', String(currentPage));
          const targetUrl = url.toString();

          // Delay between pages / retries
          const delay = currentPage === 1 && retry === 0
            ? 0
            : 3000 + Math.random() * 4000;
          if (delay > 0) {
            await page.waitForTimeout(delay);
          }

          logger.info(`Navigating to page ${currentPage}` + (retry > 0 ? ` (retry ${retry})` : ''), { url: targetUrl });

          await page.goto(targetUrl, {
            waitUntil: 'load',
            timeout: NAVIGATION_TIMEOUT,
          });

          // Capture request headers from the API call
          const apiRequest = await requestPromise;
          if (!apiRequestHeaders) {
            apiRequestHeaders = apiRequest.headers();
          }

          // Await the API response
          const apiResponse = await responsePromise;
          const responseBody = await apiResponse.json();

          const elements = responseBody?.elements || [];

          if (elements.length === 0) {
            logger.info(`No elements returned on page ${currentPage}, stopping pagination`);
            pageSuccess = true;
            break;
          }

          allPageResponses.push(...elements);
          pagesScraped = currentPage;

          logger.info(`Page ${currentPage}: found ${elements.length} companies (total: ${allPageResponses.length})`);

          await humanLikeScroll(page);

          pageSuccess = true;
          break; // success, no more retries needed
        } catch (error) {
          logger.error(`Error on page ${currentPage}, retry ${retry + 1}/${MAX_RETRIES_PER_PAGE}`, error);

          if (retry === MAX_RETRIES_PER_PAGE - 1) {
            errorMessage = `Failed after ${MAX_RETRIES_PER_PAGE} retries on page ${currentPage}: ${error.message}`;
            logger.error(errorMessage, error);
          }
        }
      }

      if (!pageSuccess) {
        break;
      }

      // If the last page returned no elements, we already broke out above
      // Check if elements were added this iteration; if not, stop
      if (pagesScraped < currentPage) {
        break;
      }
    }
  } catch (error) {
    logger.error('Critical error during Sales Navigator company scraping', error);
    errorMessage = `Critical error: ${error.message}`;
  } finally {
    // Extract cookies and CSRF from context before closing
    if (context) {
      try {
        finalCookiesArray = await context.cookies();
        finalCsrfToken = extractCsrfToken(finalCookiesArray);
      } catch (error) {
        logger.warn('Failed to extract cookies from context');
      }
    }

    await safelyCloseResources(page, context, browser);
  }

  return {
    data: allPageResponses,
    pagesScraped,
    error: errorMessage || null,
    cookies: finalCookiesArray,
    csrfToken: finalCsrfToken,
    apiRequestHeaders,
  };
}

// --------------- Routes ---------------
app.post('/scrapeSalesNav', async (req, res) => {
  const { url, cookies: rawCookies, csrfToken, userAgent } = req.body;

  if (!url || !Array.isArray(rawCookies) || !csrfToken || !userAgent) {
    return res.status(400).json({
      error: 'Missing required parameters: url, cookies (must be an array), csrfToken, and userAgent',
    });
  }

  if (!isSalesNavUrl(url)) {
    return res.status(400).json({
      error: 'Invalid Sales Navigator company search URL.',
    });
  }

  const cookies = cleanCookiesForBrowser(rawCookies);

  const result = await scrapeSalesNavigator(url, { cookies, csrfToken, userAgent });

  return res.status(200).json({
    status: result.error ? 'error' : 'success',
    pagesScraped: result.pagesScraped,
    totalCompaniesFound: result.data.length,
    data: result.data,
    cookies: result.cookies,
    csrfToken: result.csrfToken,
    apiRequestHeaders: result.apiRequestHeaders,
  });
});

// --------------- Start ---------------
startServer(app, 3000, (port) => {
  if (!process.env.BROWSER_WS_ENDPOINT) {
    logger.warn('FATAL: BROWSER_WS_ENDPOINT environment variable is not set. The scraper will not be able to connect to a browser.');
  } else {
    logger.info(`Sales Navigator Companies scraper started on port ${port}`);
  }
});
