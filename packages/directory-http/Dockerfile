FROM node:18-slim

WORKDIR /app

COPY package.json ./
COPY packages/core ./packages/core
COPY packages/directory-http/package.json ./packages/directory-http/

RUN npm install

COPY packages/directory-http ./packages/directory-http

EXPOSE 3000

CMD ["npm", "start", "-w", "packages/directory-http"]
