import { logger } from './logger.mjs';

/**
 * Perform a human-like scroll (scrolls half a viewport 3 times with jitter).
 * @param {object} page - Patchright/Playwright page
 */
export async function humanLikeScroll(page) {
    logger.info('Performing human-like scroll...');
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { window.scrollBy(0, window.innerHeight / 2); });
        await page.waitForTimeout(200 + Math.random() * 300);
    }
}

/**
 * Scroll to the bottom of the page until no new content appears.
 * Returns when the page height stops changing or maxScrolls is reached.
 * @param {object} page
 * @param {object} [opts]
 * @param {number} [opts.maxScrolls=100]
 * @param {number} [opts.maxStalled=5] - Stop after this many scrolls with no height change
 * @param {number} [opts.delayMin=3000]
 * @param {number} [opts.delayMax=5000]
 * @param {Function} [opts.onScroll] - Callback(scrollNumber) called after each scroll
 * @returns {Promise<number>} Number of scrolls performed
 */
export async function scrollUntilStale(page, opts = {}) {
    const maxScrolls = opts.maxScrolls || 100;
    const maxStalled = opts.maxStalled || 5;
    const delayMin = opts.delayMin || 3000;
    const delayMax = opts.delayMax || 5000;

    let scrollsPerformed = 0;
    let stalledCount = 0;

    while (scrollsPerformed < maxScrolls) {
        scrollsPerformed++;
        const lastHeight = await page.evaluate(() => document.body.scrollHeight);

        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(r => setTimeout(r, delayMin + Math.random() * (delayMax - delayMin)));

        if (opts.onScroll) {
            const shouldStop = await opts.onScroll(scrollsPerformed);
            if (shouldStop) break;
        }

        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === lastHeight) {
            stalledCount++;
            if (stalledCount >= maxStalled) {
                logger.info(`Scrolling stopped after ${maxStalled} stalled scrolls.`);
                break;
            }
        } else {
            stalledCount = 0;
        }
    }

    return scrollsPerformed;
}
