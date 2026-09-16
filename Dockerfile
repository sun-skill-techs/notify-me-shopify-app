FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

ENV NODE_ENV=production

RUN npm run build

CMD ["npm", "run", "docker-start"]
