FROM node:18-slim

WORKDIR /app

COPY package.json ./
COPY packages/core ./packages/core
COPY packages/company-page-http/package.json ./packages/company-page-http/

RUN npm install

COPY packages/company-page-http ./packages/company-page-http

EXPOSE 3000

CMD ["npm", "start", "-w", "packages/company-page-http"]
