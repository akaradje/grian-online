FROM node:20-alpine
WORKDIR /app
COPY package.json serve.mjs ./
COPY public ./public
ENV PORT=8731
ENV HOST=0.0.0.0
EXPOSE 8731
CMD ["node", "serve.mjs"]
