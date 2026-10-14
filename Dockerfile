FROM node:20-alpine
WORKDIR /app
COPY package.json serve.mjs ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=8731
EXPOSE 8731
CMD ["node", "serve.mjs"]
