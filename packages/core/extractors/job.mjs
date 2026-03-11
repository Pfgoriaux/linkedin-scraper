function parseSalary(salaryStr) {
    if (!salaryStr) return { currency: null, minSalary: null, maxSalary: null };

    const currencyMap = {
        '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
        'A$': 'AUD', 'C$': 'CAD', 'CHF': 'CHF', 'kr': 'SEK', 'R$': 'BRL',
    };

    let currency = null;
    for (const [symbol, code] of Object.entries(currencyMap)) {
        if (salaryStr.includes(symbol)) { currency = code; break; }
    }

    const numberPattern = /[\d,]+\.?\d*/g;
    const numbers = salaryStr.match(numberPattern);
    if (!numbers || numbers.length === 0) return { currency, minSalary: null, maxSalary: null };

    const parsedNumbers = numbers.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
    if (parsedNumbers.length === 0) return { currency, minSalary: null, maxSalary: null };
    if (parsedNumbers.length === 1) return { currency, minSalary: parsedNumbers[0], maxSalary: parsedNumbers[0] };

    return {
        currency,
        minSalary: Math.min(parsedNumbers[0], parsedNumbers[1]),
        maxSalary: Math.max(parsedNumbers[0], parsedNumbers[1]),
    };
}

/**
 * Extract job data from a LinkedIn job posting page.
 * @param {object} page - Patchright/Playwright page
 */
export async function extractJobData(page) {
    const rawData = await page.evaluate(() => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.trim() : null;
        };

        const title = getText('.top-card-layout__title, h2.topcard__title');
        const company = getText('.topcard__org-name-link, a[data-tracking-control-name="public_jobs_topcard-org-name"]');
        const location = getText('.topcard__flavor--bullet');
        const postedTime = getText('.posted-time-ago__text');
        const applicants = getText('.num-applicants__caption');
        const salary = getText('.compensation__salary, .salary');
        const salaryDescription = getText('.compensation__description');

        const descEl = document.querySelector('.show-more-less-html__markup');
        const description = {
            text: descEl ? descEl.textContent.trim() : null,
            html: descEl ? descEl.innerHTML : null,
        };

        const criteriaItems = document.querySelectorAll('.description__job-criteria-item');
        const criteria = {};
        criteriaItems.forEach(item => {
            const header = item.querySelector('.description__job-criteria-subheader');
            const value = item.querySelector('.description__job-criteria-text');
            if (header && value) {
                const key = header.textContent.trim().toLowerCase().replace(/\s+/g, '_');
                criteria[key] = value.textContent.trim();
            }
        });

        const easyApplyEl = document.querySelector('a[data-tracking-control-name*="public_jobs_apply-link-onsite"]');
        const externalApplyEl = document.querySelector('a[data-tracking-control-name*="public_jobs_apply-link-offsite"]');
        const easyApply = !!easyApplyEl;
        const applyUrl = easyApplyEl ? easyApplyEl.href : (externalApplyEl ? externalApplyEl.href : null);

        const logoEl = document.querySelector('.artdeco-entity-image');
        const companyLogo = logoEl ? (logoEl.getAttribute('data-delayed-url') || logoEl.src) : null;

        const companyLinkEl = document.querySelector('.topcard__org-name-link');
        const companyUrl = companyLinkEl ? companyLinkEl.href : null;

        return { title, company, companyUrl, location, postedTime, applicants, salary, salaryDescription, criteria, companyLogo, applyUrl, easyApply, description };
    });

    const { currency, minSalary, maxSalary } = parseSalary(rawData.salary);
    return { ...rawData, currency, minSalary, maxSalary };
}

/**
 * Extract job IDs from a LinkedIn search results page.
 * @param {object} page - Patchright/Playwright page
 * @returns {Promise<string[]>}
 */
export async function extractJobIds(page) {
    return page.evaluate(() => {
        const ids = [];
        document.querySelectorAll('[data-entity-urn*="jobPosting"]').forEach(card => {
            const urn = card.getAttribute('data-entity-urn');
            if (urn) {
                const match = urn.match(/jobPosting:(\d+)/);
                if (match) ids.push(match[1]);
            }
        });
        document.querySelectorAll('a[href*="/jobs/view/"]').forEach(link => {
            const match = link.href.match(/\/jobs\/view\/(\d+)/);
            if (match && !ids.includes(match[1])) ids.push(match[1]);
        });
        return ids;
    });
}
