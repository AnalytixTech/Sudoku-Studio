# Battle relay only -- not the web app (the app is static, built with `npm run build`).
# Portable to any container host: Render, Railway, Fly.io, Cloud Run, a VPS.

FROM node:20-alpine

WORKDIR /app

# `ws` is the only runtime dependency the relay needs.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Restrict to your deployed app's origin in production, e.g.
#   ENV ALLOWED_ORIGINS=https://your-app.netlify.app
CMD ["node", "server/index.js"]
