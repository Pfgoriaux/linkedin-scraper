import 'dotenv/config';
import {
  buildBrowserProxyConfig,
  createApp,
  startServer,
  launchBrowser,
  createPublicContext,
  safelyCloseResources,
  createResponse,
  errorToStatusCode,
} from '@linkedin-scrapers/core';
import { chromium } from 'patchright';
import { extractJobData, extractJobIds } from '@linkedin-scrapers/core/extractors/job';

const PROXY_CONFIG = buildBrowserProxyConfig();

const app = createApp({ healthPath: '/health' });

// Override health endpoint to use standardized response format
app.get('/health', (_req, res) => {
  res.json(createResponse({ status: 'ok' }));
});

// ---------- GET /job/:jobId  -  Single job scrape ----------
app.get('/job/:jobId', async (req, res) => {
  const { jobId } = req.params;

  if (!/^\d+$/.test(jobId)) {
    return res.status(400).json(createResponse(null, 'jobId must be a numeric value', 400));
  }

  let browser, context, page;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, PROXY_CONFIG);
    page = await context.newPage();

    const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });

    await page.waitForSelector(
      '.top-card-layout__title, h2.topcard__title, .show-more-less-html__markup',
      { timeout: 10000 },
    ).catch(() => {});

    const jobData = await extractJobData(page);
    jobData.jobId = jobId;
    jobData.url = url;

    return res.json(createResponse(jobData));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scraping job ${jobId}:`, error.message);
    const status = errorToStatusCode(error);
    return res.status(status).json(createResponse(null, error.message, status));
  } finally {
    await safelyCloseResources(page, context, browser);
  }
});

// ---------- POST /jobs  -  Batch job scrape ----------
app.post('/jobs', async (req, res) => {
  const { jobIds } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json(createResponse(null, 'jobIds must be a non-empty array', 400));
  }

  const ids = jobIds.slice(0, 10);
  const jobs = [];
  const errors = [];

  let browser, context;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, PROXY_CONFIG);

    for (let i = 0; i < ids.length; i++) {
      const jobId = String(ids[i]);
      let page;
      try {
        page = await context.newPage();

        const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });

        await page.waitForSelector(
          '.top-card-layout__title, h2.topcard__title, .show-more-less-html__markup',
          { timeout: 10000 },
        ).catch(() => {});

        const jobData = await extractJobData(page);
        jobData.jobId = jobId;
        jobData.url = url;
        jobs.push(jobData);
      } catch (error) {
        errors.push({ jobId, error: error.message });
      } finally {
        if (page && !page.isClosed()) {
          await page.close().catch(() => {});
        }
      }

      // 500ms delay between requests
      if (i < ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return res.json(createResponse({
      jobs,
      errors,
      total: ids.length,
      successful: jobs.length,
      failed: errors.length,
    }));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Batch scrape error:`, error.message);
    const status = errorToStatusCode(error);
    return res.status(status).json(createResponse(null, error.message, status));
  } finally {
    await safelyCloseResources(null, context, browser);
  }
});

// ---------- GET /company/:companyId/jobs  -  Company job search ----------
app.get('/company/:companyId/jobs', async (req, res) => {
  const { companyId } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 25);

  if (!/^\d+$/.test(companyId)) {
    return res.status(400).json(createResponse(null, 'companyId must be a numeric value', 400));
  }

  let browser, context, page;
  try {
    browser = await launchBrowser(chromium);
    context = await createPublicContext(browser, PROXY_CONFIG);
    page = await context.newPage();

    const searchUrl = `https://www.linkedin.com/jobs/search/?f_C=${companyId}&geoId=92000000`;
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 });

    await page.waitForSelector(
      '.jobs-search__results-list, .job-search-card',
      { timeout: 15000 },
    ).catch(() => {});

    // Scroll once to load more results
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let jobIdList = await extractJobIds(page);
    jobIdList = jobIdList.slice(0, limit);

    const jobs = [];
    for (let i = 0; i < jobIdList.length; i++) {
      const jobId = jobIdList[i];
      let jobPage;
      try {
        jobPage = await context.newPage();

        const jobUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
        await jobPage.goto(jobUrl, { waitUntil: 'load', timeout: 30000 });

        await jobPage.waitForSelector(
          '.top-card-layout__title, h2.topcard__title, .show-more-less-html__markup',
          { timeout: 10000 },
        ).catch(() => {});

        const jobData = await extractJobData(jobPage);
        jobData.jobId = jobId;
        jobData.url = jobUrl;
        jobs.push(jobData);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error scraping job ${jobId} for company ${companyId}:`, error.message);
      } finally {
        if (jobPage && !jobPage.isClosed()) {
          await jobPage.close().catch(() => {});
        }
      }

      // 500ms delay between requests
      if (i < jobIdList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return res.json(createResponse({
      companyId,
      totalFound: jobIdList.length,
      jobs,
    }));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Company job search error for ${companyId}:`, error.message);
    const status = errorToStatusCode(error);
    return res.status(status).json(createResponse(null, error.message, status));
  } finally {
    await safelyCloseResources(page, context, browser);
  }
});

// ---------- Start server ----------
startServer(app, 3001, (port) => {
  console.log(`[${new Date().toISOString()}] LinkedIn Jobs Scraper running on port ${port}`);
  console.log(`[${new Date().toISOString()}] Endpoints:`);
  console.log(`  GET  /health                  - Health check`);
  console.log(`  GET  /job/:jobId              - Scrape a single job posting`);
  console.log(`  POST /jobs                    - Batch scrape job postings`);
  console.log(`  GET  /company/:companyId/jobs - Search jobs by company`);
  console.log(`[${new Date().toISOString()}] Config:`);
  console.log(`  Headless: ${process.env.HEADLESS !== 'false'}`);
  console.log(`  Proxy: ${PROXY_CONFIG ? 'configured' : 'NOT configured'}`);
});
