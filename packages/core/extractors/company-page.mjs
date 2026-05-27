import * as cheerio from 'cheerio';

export function extractWebsiteUrl(html) {
    const regex = /<div[^>]*data-test-id="about-us__website"[^>]*>[\s\S]*?href="[^"]*?url=([^"&]+)[^"]*"[\s\S]*?<\/div>/;
    const match = html.match(regex);

    if (match && match[1]) {
        try {
            const decodedUrl = decodeURIComponent(match[1]);
            const url = new URL(decodedUrl);
            return url.hostname;
        } catch (e) {
            return null;
        }
    }
    return null;
}

export function extractSimilarCompanies(html) {
    const similarCompanies = [];
    const linkRegex = /<a[^>]*class="[^"]*base-aside-card--link[^"]*"[^>]*href="([^"]*\/company\/[^"]*)"[^>]*>[\s\S]*?<h3[^>]*class="[^"]*base-aside-card__title[^"]*"[^>]*>([^<]*)<\/h3>[\s\S]*?<p[^>]*class="[^"]*base-aside-card__subtitle[^"]*"[^>]*>([^<]*)<\/p>[\s\S]*?(?:<p[^>]*class="[^"]*base-aside-card__second-subtitle[^"]*"[^>]*>([^<]*)<\/p>)?[\s\S]*?<\/a>/g;

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        similarCompanies.push({
            companyName: match[2]?.trim() || null,
            companyPage: match[1] || null,
            industry: match[3]?.trim() || null,
            location: match[4]?.trim() || null,
        });
    }

    return similarCompanies;
}

export function extractFunding(html) {
    if (!html.includes('Last Round')) return null;

    const funding = { lastRound: null, date: null, amount: null, investors: [] };

    const roundRegex = /<a[^>]*data-tracking-control-name="funding_last-round"[^>]*>([^<]*)/;
    const roundMatch = html.match(roundRegex);
    if (roundMatch) funding.lastRound = roundMatch[1].trim();

    const dateRegex = /<time[^>]*class="[^"]*before:middot[^"]*"[^>]*>([^<]*)<\/time>/;
    const dateMatch = html.match(dateRegex);
    if (dateMatch) funding.date = dateMatch[1].trim();

    const amountRegex = /<p[^>]*class="[^"]*text-display-lg[^"]*"[^>]*>([^<]*)<\/p>/;
    const amountMatch = html.match(amountRegex);
    if (amountMatch) funding.amount = amountMatch[1].trim();

    const investorRegex = /<a[^>]*data-tracking-control-name="funding_investors"[^>]*>([^<]*)/g;
    let investorMatch;
    while ((investorMatch = investorRegex.exec(html)) !== null) {
        const investorText = investorMatch[1].trim();
        if (investorText && !investorText.includes('Other investors')) {
            funding.investors.push(investorText);
        }
    }

    if (!funding.lastRound && !funding.date && !funding.amount && funding.investors.length === 0) {
        return null;
    }

    return funding;
}

export function extractDescription(html) {
    const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
    const scriptMatch = html.match(scriptRegex);

    if (scriptMatch && scriptMatch[1]) {
        try {
            const scriptJson = JSON.parse(scriptMatch[1]);
            if (scriptJson['@graph']) {
                const orgObject = scriptJson['@graph'].find(item => item['@type'] === 'Organization');
                if (orgObject && orgObject.description) return orgObject.description;
            } else if (scriptJson['@type'] === 'Organization' && scriptJson.description) {
                return scriptJson.description;
            }
        } catch (e) {
            console.error('Error parsing JSON-LD:', e);
        }
    }

    const descRegex = /<p[^>]*data-test-id="about-us__description"[^>]*>([\s\S]*?)<\/p>/;
    const descMatch = html.match(descRegex);
    if (descMatch && descMatch[1]) return descMatch[1].trim().replace(/\s+/g, ' ');

    return null;
}

export function extractText(html, selector) {
    if (selector.includes('data-test-id')) {
        const testId = selector.match(/data-test-id="([^"]+)"/)[1];
        const regex = new RegExp(`<div[^>]*data-test-id="${testId}"[^>]*>[\\s\\S]*?<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 's');
        const match = html.match(regex);
        if (match && match[1]) return match[1].trim().replace(/\s+/g, ' ');
    } else {
        const tagName = selector.match(/^(\w+)/)[1];
        const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, 's');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    }
    return null;
}

export function extractIndustry(html) {
    const regex = /<div[^>]*data-test-id="about-us__industry"[^>]*>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/;
    const match = html.match(regex);
    if (match && match[1]) return match[1].trim();
    return null;
}

export function extractLinkedinId(html) {
    let regex = /data-entity-id="([^"]+)"/;
    let match = html.match(regex);
    if (match && match[1]) return match[1].split(':').pop();

    regex = /data-semaphore-content-urn="urn:li:organization:(\d+)"/;
    match = html.match(regex);
    if (match && match[1]) return match[1];

    return null;
}

export function extractLogo(html) {
    const regex = /<img[\s\S]*?top-card-layout__entity-image[\s\S]*?data-delayed-url="([^"]+)"[\s\S]*?>/;
    const match = html.match(regex);
    if (match && match[1]) return match[1].replace(/&amp;/g, '&');
    return null;
}

// Claimed pages render a tab nav (Home/Posts/About/People/Jobs) and an
// "about us" description block. Auto-generated stubs have neither.
export function isUnclaimedPage(html) {
    const hasNavTabs = html.includes('data-test-id="nav-tabs"');
    const hasDescription = html.includes('data-test-id="about-us__description"');
    return !hasNavTabs && !hasDescription;
}

/**
 * Extract all company info from a LinkedIn company page's HTML.
 * @param {string} html
 * @returns {object}
 */
export function extractCompanyInfo(html) {
    const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
    const scriptMatch = html.match(scriptRegex);

    if (!scriptMatch) return { error: 'Could not find company information' };

    try {
        const scriptJson = JSON.parse(scriptMatch[1]);

        let companyData = null;
        if (scriptJson['@graph']) {
            companyData = scriptJson['@graph'].find(item => item['@type'] === 'Organization');
        } else if (scriptJson['@type'] === 'Organization') {
            companyData = scriptJson;
        }

        if (!companyData) return { error: 'Could not find organization data' };

        const address = companyData.address || {};

        return {
            companyName: companyData.name || extractText(html, 'h1'),
            unclaimed: isUnclaimedPage(html),
            logo: extractLogo(html),
            description: extractDescription(html),
            website: extractWebsiteUrl(html),
            companySize: extractText(html, 'div[data-test-id="about-us__size"]'),
            foundedYear: extractText(html, 'div[data-test-id="about-us__foundedOn"]'),
            industry: extractIndustry(html) || (companyData.industry || null),
            number_of_employees: companyData.numberOfEmployees?.value || '',
            linkedin_id: extractLinkedinId(html),
            headquarter: {
                country: address.addressCountry || '',
                postalCode: address.postalCode || '',
                region: address.addressRegion || '',
                city: address.addressLocality || '',
                streetAddress: address.streetAddress || '',
            },
            funding: extractFunding(html),
            similarCompanies: extractSimilarCompanies(html),
        };
    } catch (e) {
        console.error('Error parsing JSON-LD:', e);
        return { error: 'Error parsing company information' };
    }
}
