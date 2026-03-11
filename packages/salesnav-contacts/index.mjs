import 'dotenv/config';
import {
  createApp,
  startServer,
  launchBrowser,
  createSalesNavContext,
  safelyCloseResources,
  cleanCookiesForBrowser,
  extractCsrfToken,
  humanLikeScroll,
} from '@linkedin-scrapers/core';
import { logger } from '@linkedin-scrapers/core/logger';
import { chromium } from 'patchright';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGINATION_LIMIT = 49;
const NAVIGATION_TIMEOUT = 90000;
const API_LAUNCH_TIMEOUT = 10000;
const MAX_RETRIES_PER_PAGE = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a URL points to a Sales Navigator people search.
 * @param {string} u - The URL to check
 * @returns {boolean}
 */
function isSalesNavUrl(u) {
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname.includes('linkedin.com') &&
      parsed.pathname.startsWith('/sales/search/people')
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = createApp();

// ---------------------------------------------------------------------------
// Core scraping function
// ---------------------------------------------------------------------------

/**
 * Scrape Sales Navigator lead search results across multiple pages.
 *
 * @param {string} pageUrl - The Sales Navigator search URL
 * @param {{ cookies: Array, csrfToken: string, userAgent: string }} auth
 * @returns {Promise<object>}
 */
async function scrapeSalesNavigator(pageUrl, { cookies, csrfToken, userAgent }) {
  let browser, context, page, errorMessage;
  let allPageResponses = [];
  let finalCookiesArray = [];
  let finalCsrfToken = '';
  let apiRequestHeaders = null;

  try {
    browser = await launchBrowser(chromium, { headless: false });

    ({ context, page } = await createSalesNavContext(browser, {
      cookies,
      userAgent,
      csrfToken,
      referer: 'https://www.linkedin.com/sales/search/people?viewAllFilters=true',
    }));

    // ------------------------------------------------------------------
    // Pagination loop
    // ------------------------------------------------------------------
    for (let currentPage = 1; currentPage <= PAGINATION_LIMIT; currentPage++) {
      let pageSuccess = false;

      for (let retry = 0; retry < MAX_RETRIES_PER_PAGE; retry++) {
        try {
          // Set up a promise that resolves when we receive the API response
          const responsePromise = page.waitForResponse(
            (res) =>
              res.url().includes('/sales-api/salesApiLeadSearch') &&
              res.status() === 200,
            { timeout: NAVIGATION_TIMEOUT },
          );

          // Set up a promise that resolves when the API request is sent
          const requestPromise = page.waitForRequest(
            (req) => req.url().includes('/sales-api/salesApiLeadSearch'),
            { timeout: NAVIGATION_TIMEOUT },
          );

          // Build the URL with the current page parameter
          const url = new URL(pageUrl);
          url.searchParams.set('page', String(currentPage));

          // Add delay between pages / on retry
          if (retry > 0) {
            logger.info(`Retry ${retry} for page ${currentPage}, waiting 3 s...`);
            await page.waitForTimeout(3000);
          } else if (currentPage > 1) {
            const delay = 500 + Math.random() * 500;
            logger.info(`Waiting ${Math.round(delay)} ms before page ${currentPage}`);
            await page.waitForTimeout(delay);
          }

          logger.info(`Navigating to page ${currentPage}`);
          await page.goto(url.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: NAVIGATION_TIMEOUT,
          });

          // Capture the outgoing request headers (first time only)
          const apiRequest = await requestPromise;
          if (!apiRequestHeaders) {
            apiRequestHeaders = apiRequest.headers();
          }

          // Wait for the API response and parse it
          const apiResponse = await responsePromise;
          const jsonBody = await apiResponse.json();

          const elements = jsonBody?.data?.elements ?? jsonBody?.elements ?? [];

          if (elements.length === 0) {
            logger.info(`No elements on page ${currentPage} -- stopping pagination`);
            pageSuccess = true;
            break; // stop pagination
          }

          allPageResponses.push({
            page: currentPage,
            elements,
          });

          logger.info(`Page ${currentPage}: collected ${elements.length} leads`);

          // Mimic a real user scrolling through the results
          await humanLikeScroll(page);

          pageSuccess = true;
          break; // success, move to next page
        } catch (err) {
          logger.warn(`Error on page ${currentPage}, retry ${retry + 1}/${MAX_RETRIES_PER_PAGE}: ${err.message}`);
        }
      }

      if (!pageSuccess) {
        errorMessage = `Failed to scrape page ${currentPage} after ${MAX_RETRIES_PER_PAGE} retries`;
        logger.error(errorMessage, new Error(errorMessage));
        break;
      }

      // If we broke out of the retry loop because there were no elements,
      // we also need to break out of the pagination loop.
      const lastResponse = allPageResponses[allPageResponses.length - 1];
      if (!lastResponse || lastResponse.page !== currentPage) {
        break;
      }
    }
  } catch (error) {
    logger.error('Critical error during Sales Navigator scraping', error);
    errorMessage = `Critical error: ${error.message}`;
  } finally {
    // Extract cookies and CSRF token from the context before cleanup
    if (context) {
      try {
        finalCookiesArray = await context.cookies();
        finalCsrfToken = extractCsrfToken(finalCookiesArray);
      } catch (err) {
        logger.warn('Failed to extract cookies from context');
      }
    }

    await safelyCloseResources(page, context, browser);
  }

  // Combine all elements across pages
  const combinedElements = allPageResponses.flatMap((r) => r.elements);

  return {
    data: combinedElements,
    pagesScraped: allPageResponses.length,
    error: errorMessage || null,
    cookies: finalCookiesArray,
    csrfToken: finalCsrfToken,
    apiRequestHeaders,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post('/scrapeSalesNav', async (req, res) => {
  const { url, cookies: rawCookies, csrfToken, userAgent } = req.body;

  if (!url || !Array.isArray(rawCookies) || !csrfToken || !userAgent) {
    return res.status(400).json({
      error: 'Missing required parameters: url, cookies (must be an array), csrfToken, and userAgent',
    });
  }

  if (!isSalesNavUrl(url)) {
    return res.status(400).json({
      error: 'Invalid Sales Navigator people search URL.',
    });
  }

  try {
    const cookies = cleanCookiesForBrowser(rawCookies);

    const result = await scrapeSalesNavigator(url, {
      cookies,
      csrfToken,
      userAgent,
    });

    return res.json({
      status: result.error ? 'partial' : 'success',
      pagesScraped: result.pagesScraped,
      totalLeadsFound: result.data.length,
      data: result.data,
      cookies: result.cookies,
      csrfToken: result.csrfToken,
      apiRequestHeaders: result.apiRequestHeaders,
    });
  } catch (error) {
    logger.error('Unhandled error in /scrapeSalesNav', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      pagesScraped: 0,
      totalLeadsFound: 0,
      data: [],
      cookies: null,
      csrfToken: null,
      apiRequestHeaders: null,
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
startServer(app, 3000);
