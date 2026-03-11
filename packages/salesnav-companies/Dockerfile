FROM node:18-slim

RUN apt-get update && apt-get install -y \
    ca-certificates curl xvfb x11-utils xauth \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 \
    libx11-xcb1 libgtk-3-0 libpangocairo-1.0-0 libx11-6 libxcb1 libxext6 \
    libxi6 libxtst6 fonts-liberation fonts-noto-color-emoji fontconfig gnupg \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o chrome.deb \
    && apt-get update && apt-get install -y ./chrome.deb && rm chrome.deb && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY packages/core ./packages/core
COPY packages/salesnav-companies/package.json ./packages/salesnav-companies/

RUN npm install
RUN npx patchright install chrome

COPY packages/salesnav-companies ./packages/salesnav-companies

EXPOSE 3000

ENV DISPLAY=:99

CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -ac & sleep 1 && npm start -w packages/salesnav-companies"]
