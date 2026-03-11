import 'dotenv/config';
import {
  createApp,
  startServer,
  launchBrowser,
  safelyCloseResources,
  cleanCookiesForBrowser,
  extractCsrfToken,
} from '@linkedin-scrapers/core';
import { logger } from '@linkedin-scrapers/core/logger';
import { chromium } from 'patchright';

const NAVIGATION_TIMEOUT = 120000;

const app = createApp();

async function checkAndGetCookies({ cookies: cookiesArray, userAgent, csrfToken }) {
  let browser, context, page, errorMessage, finalCookiesArray, finalCsrfToken,
    isConnected, screenshotBuffer, navigationRequestHeaders;

  try {
    // Always headful for cookie check
    browser = await launchBrowser(chromium, { headless: false });
    context = await browser.newContext({ userAgent });
    await context.addCookies(cookiesArray);

    page = await context.newPage();

    // Extract Chrome version from userAgent for sec-ch-ua header
    const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)/);
    const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '139';

    await page.setExtraHTTPHeaders({
      'accept': '*/*',
      'accept-language': 'fr,fr-FR;q=0.9,en-US;q=0.8,en;q=0.7',
      'priority': 'u=1, i',
      'referer': 'https://www.linkedin.com/sales/search/people',
      'sec-ch-ua': `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"`,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': userAgent,
      'x-li-lang': 'fr_FR',
      'x-restli-protocol-version': '2.0.0',
      'csrf-token': csrfToken,
    });

    // Capture the initial navigation request headers
    const requestPromise = page.waitForRequest(
      req => req.url() === 'https://www.linkedin.com/',
      { timeout: NAVIGATION_TIMEOUT }
    );

    await page.goto('https://www.linkedin.com', {
      waitUntil: 'load',
      timeout: NAVIGATION_TIMEOUT,
    });

    try {
      const initialRequest = await requestPromise;
      navigationRequestHeaders = await initialRequest.allHeaders();
      logger.info('Captured initial navigation request headers.');
    } catch (e) {
      logger.error('Could not capture initial navigation request headers.', e);
    }

    await page.waitForTimeout(10000);

    // Check for logged-in selector
    try {
      await page.waitForSelector('[data-view-name="navigation-settings"]', {
        timeout: 15000,
      });

      isConnected = true;
      logger.info('User is connected to LinkedIn');

      // Click Sales Navigator button and wait for new tab
      const [newPage] = await Promise.all([
        context.waitForEvent('page'),
        page.click('[data-view-name="nav-spotlight-sales-navigator"]'),
      ]);

      await newPage.waitForLoadState('load');
      await newPage.waitForTimeout(10000);

      logger.info('Sales Navigator page loaded successfully');
    } catch {
      isConnected = false;
      logger.warn('User is NOT connected to LinkedIn');

      screenshotBuffer = await page.screenshot({ fullPage: true });
      errorMessage = 'LinkedIn session is not active. The cookies may have expired or the account is logged out.';
    }
  } catch (error) {
    logger.error('Critical error during cookie check', error);
    errorMessage = `Critical error: ${error.message}`;

    if (page && !page.isClosed()) {
      try {
        screenshotBuffer = await page.screenshot({ fullPage: true });
      } catch {
        logger.warn('Failed to take screenshot after critical error');
      }
    }
  } finally {
    // Extract cookies from context before closing
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
    success: !errorMessage,
    connectionStatus: isConnected ? 'connected' : 'disconnected',
    error: errorMessage || null,
    cookies: finalCookiesArray || null,
    csrfToken: finalCsrfToken || csrfToken,
    screenshot: screenshotBuffer || null,
    apiRequestHeaders: navigationRequestHeaders || null,
  };
}

app.post('/checkConnection', async (req, res) => {
  const { cookies: rawCookies, userAgent, csrfToken } = req.body;

  if (!Array.isArray(rawCookies) || !userAgent || !csrfToken) {
    return res.status(400).json({
      error: 'Missing required parameters: cookies (must be an array), userAgent, and csrfToken',
    });
  }

  const cookiesArray = cleanCookiesForBrowser(rawCookies);

  const result = await checkAndGetCookies({
    cookies: cookiesArray,
    userAgent,
    csrfToken,
  });

  const response = {
    status: result.success ? 'success' : 'error',
    details: result.error || 'Connection check completed successfully',
    connectionStatus: result.connectionStatus,
    cookieCount: result.cookies ? result.cookies.length : 0,
    cookies: result.cookies,
    csrfToken: result.csrfToken,
    apiRequestHeaders: result.apiRequestHeaders,
  };

  if (result.screenshot) {
    response.screenshot_data_url = `data:image/png;base64,${result.screenshot.toString('base64')}`;
  }

  return res.status(200).json(response);
});

startServer(app, 3000);
