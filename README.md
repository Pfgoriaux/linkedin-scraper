# linkedin-scrapers

Monorepo of LinkedIn and Sales Navigator scraping microservices. Each package exposes a lightweight Express API for a specific scraping task.

**9 packages** (1 shared core + 8 services):

| Package | Method | Description |
|---|---|---|
| `core` | - | Shared utilities: proxy, browser, cookies, extractors, server factory |
| `company-page-http` | HTTP | Scrape public company pages via HTTP (no browser) |
| `directory-http` | HTTP | Scrape LinkedIn company directory pages via HTTP |
| `company-page-browser` | Patchright | Scrape public company pages with a real browser |
| `jobs` | Patchright | Scrape job postings and search by company |
| `ads-library` | Patchright | Scrape the LinkedIn Ad Library (search + detail) |
| `salesnav-cookies` | Patchright | Check Sales Navigator session validity, refresh cookies |
| `salesnav-contacts` | Patchright | Paginate Sales Navigator people search results |
| `salesnav-companies` | Patchright | Paginate Sales Navigator company search results (remote browser) |

## Requirements

- Node.js >= 18
- Google Chrome (for browser-based scrapers)
- A proxy service (recommended for production)

## Quick Start

```bash
# Clone and install
git clone https://github.com/<your-org>/linkedin-scrapers.git
cd linkedin-scrapers
npm install

# For browser-based scrapers, install Patchright's Chrome
npx patchright install chrome

# Configure environment
cp .env.example .env
# Edit .env with your proxy credentials

# Start a specific service
npm start -w packages/company-page-http
npm start -w packages/jobs
# etc.
```

## Environment Variables

```env
# Proxy (supports PROXY_SERVER or PROXY_HOST+PROXY_PORT)
PROXY_SERVER=http://host:port
PROXY_USERNAME=user
PROXY_PASSWORD=pass

# Fallback proxy (company-page-browser)
PROXY_SERVER_2=http://host2:port2
PROXY_USERNAME_2=user2
PROXY_PASSWORD_2=pass2

# Fallback proxy pool for company-page-http — one is picked at random on
# primary failure or non-200. Up to 5 supported.
FALLBACK_PROXY_1=http://user:pass@host:port
FALLBACK_PROXY_2=http://user:pass@host:port
FALLBACK_PROXY_3=http://user:pass@host:port
FALLBACK_PROXY_4=http://user:pass@host:port
FALLBACK_PROXY_5=http://user:pass@host:port

# Browser
HEADLESS=true              # set to "false" for headed mode
BROWSER_WS_ENDPOINT=ws://  # remote browser (salesnav-companies)

# Server
PORT=3000
```

## API Endpoints

### company-page-http (port 3000)

```
GET /scrape?query=google
```

Returns structured company data (name, description, website, HQ, funding, similar companies, `unclaimed` flag for auto-generated stubs).

### directory-http (port 3000)

```
GET /scrape-directory?url=<linkedin-directory-url>&proxyUrl=<proxy>&cookie=<cookie>
```

Returns company listings from LinkedIn's directory pages.

### company-page-browser (port 3000)

```
GET /scrape?query=google
```

Same as `company-page-http` but uses a real browser. Set `HEADLESS=false` for headed mode.

### jobs (port 3001)

```
GET  /health
GET  /job/:jobId
POST /jobs              body: { jobIds: ["123", "456"] }
GET  /company/:id/jobs?limit=10
```

### ads-library (port 3000)

```
POST /scrapeLinkedInAds         body: { url: "<ad-library-search-url>" }
POST /scrapeLinkedInAdDetail    body: { url: "<ad-library-detail-url>" }
```

### salesnav-cookies (port 3000)

```
POST /checkConnection   body: { cookies: [...], userAgent: "...", csrfToken: "..." }
```

Validates a Sales Navigator session. Returns refreshed cookies, CSRF token, and a screenshot on failure.

### salesnav-contacts (port 3000)

```
POST /scrapeSalesNav    body: { url: "<sales-nav-people-search-url>", cookies: [...], csrfToken: "...", userAgent: "..." }
```

Paginates through Sales Navigator people search results (up to 49 pages).

### salesnav-companies (port 3000)

```
POST /scrapeSalesNav    body: { url: "<sales-nav-company-search-url>", cookies: [...], csrfToken: "...", userAgent: "..." }
```

Same as `salesnav-contacts` but for company search. Requires `BROWSER_WS_ENDPOINT` for a remote browser.

## Docker

Each service has a Dockerfile. HTTP services use a slim Node image, browser services include Chrome + Xvfb.

```bash
# Build a specific service
docker build -f packages/company-page-http/Dockerfile -t company-page-http .
docker build -f packages/jobs/Dockerfile -t jobs .

# Run
docker run -p 3000:3000 --env-file .env company-page-http
```

## Architecture

```
packages/
  core/                     # @linkedin-scrapers/core
    lib/
      logger.mjs            # Structured JSON logger
      proxy.mjs             # buildBrowserProxyConfig() + buildHttpProxyUrl()
      browser.mjs           # launchBrowser(), connectBrowser(), createPublicContext(), createSalesNavContext()
      cookies.mjs           # cleanCookiesForBrowser(), extractCsrfToken()
      response.mjs          # createResponse(), errorToStatusCode()
      server.mjs            # createApp(), startServer()
      http-client.mjs       # fetchWithProxy()
      scroll.mjs            # humanLikeScroll(), scrollUntilStale()
    extractors/
      company-page.mjs      # extractCompanyInfo() and helpers
      job.mjs               # extractJobData(), extractJobIds()
      directory.mjs          # extractDirectoryCompanies()
  company-page-http/        # HTTP-only company scraper
  directory-http/           # HTTP-only directory scraper
  company-page-browser/     # Patchright company scraper
  jobs/                     # Patchright job scraper
  ads-library/              # Patchright ad library scraper
  salesnav-cookies/         # Patchright SalesNav session checker
  salesnav-contacts/        # Patchright SalesNav people search
  salesnav-companies/       # Patchright SalesNav company search (remote browser)
```

Patchright is an optional peer dependency of core, so HTTP-only packages don't install browser binaries.

## License

MIT
