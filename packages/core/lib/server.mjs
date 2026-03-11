import express from 'express';

/**
 * Create and configure an Express app with JSON body parsing and a health check.
 * @param {object} [opts]
 * @param {string} [opts.healthPath='/'] - Path for the health check endpoint
 * @returns {import('express').Express}
 */
export function createApp(opts = {}) {
    const app = express();
    app.use(express.json());

    const healthPath = opts.healthPath || '/';
    app.get(healthPath, (_req, res) => {
        res.status(200).json({ status: 'healthy' });
    });

    return app;
}

/**
 * Start the Express server on PORT env var or the given default.
 * @param {import('express').Express} app
 * @param {number} [defaultPort=3000]
 * @param {Function} [onListen] - Optional callback when server starts
 */
export function startServer(app, defaultPort = 3000, onListen) {
    const port = process.env.PORT || defaultPort;
    app.listen(port, () => {
        if (onListen) {
            onListen(port);
        } else {
            console.log(`[${new Date().toISOString()}] Server running on port ${port}`);
        }
    });
}
