import * as cheerio from 'cheerio';

/**
 * Extract company listings from a LinkedIn directory page's HTML.
 * @param {string} html
 * @returns {{ companies: Array<object>, last_page: number }}
 */
export function extractDirectoryCompanies(html) {
    const $ = cheerio.load(html);
    const companies = [];
    let lastPage = 1;

    $('.listings__entry').each((i, element) => {
        const linkElement = $(element).find('.listings__entry-link');
        const name = linkElement.text().trim();
        const linkedinUrl = linkElement.attr('href');
        const slug = linkedinUrl ? linkedinUrl.split('/company/')[1]?.split('?')[0] : null;

        if (name && linkedinUrl && slug) {
            const cleanSlug = slug.replace('showcase/', '');
            const baseUrl = linkedinUrl.split('?')[0].split('/company/')[0];

            companies.push({
                name,
                linkedin_url: linkedinUrl,
                linkedin_url_clean: `${baseUrl}/company/${cleanSlug}`,
                slug: cleanSlug,
            });
        }
    });

    const paginationLinks = $('ol li a.link.inline');
    if (paginationLinks.length > 0) {
        paginationLinks.each((i, element) => {
            const pageNum = parseInt($(element).text().trim());
            if (!isNaN(pageNum) && pageNum > lastPage) {
                lastPage = pageNum;
            }
        });
    }

    return { companies, last_page: lastPage };
}
