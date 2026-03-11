/**
 * Clean and format raw cookies (e.g. from a Chrome extension export) for
 * Patchright / Playwright compatibility.
 * @param {Array<object>} rawCookies
 * @returns {Array<object>}
 */
export function cleanCookiesForBrowser(rawCookies) {
    return rawCookies.map(cookie => {
        const newCookie = { ...cookie };

        if (newCookie.expirationDate) {
            newCookie.expires = Math.round(newCookie.expirationDate);
            delete newCookie.expirationDate;
        }

        // Normalize sameSite values
        if (newCookie.sameSite === 'no_restriction') {
            newCookie.sameSite = 'None';
        } else if (newCookie.sameSite === null || newCookie.sameSite === undefined || newCookie.sameSite === '') {
            newCookie.sameSite = 'Lax';
        } else if (typeof newCookie.sameSite === 'string') {
            const normalized = newCookie.sameSite.toLowerCase();
            if (normalized === 'strict') {
                newCookie.sameSite = 'Strict';
            } else if (normalized === 'lax') {
                newCookie.sameSite = 'Lax';
            } else if (normalized === 'none') {
                newCookie.sameSite = 'None';
            } else {
                newCookie.sameSite = 'Lax';
            }
        }

        delete newCookie.partitionKey;
        delete newCookie.priority;
        return newCookie;
    });
}

/**
 * Extract the CSRF token from a cookies array.
 * @param {Array<object>} cookies
 * @returns {string}
 */
export function extractCsrfToken(cookies) {
    const jsessionCookie = cookies.find(c => c.name === 'JSESSIONID' && c.domain.includes('linkedin.com'));
    return jsessionCookie ? jsessionCookie.value.replace(/"/g, '') : '';
}
