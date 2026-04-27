# syntax=docker/dockerfile:1.7
# Frontend only: export Expo web build and serve static files.

FROM node:20-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ARG EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8001
ENV EXPO_PUBLIC_BACKEND_URL=${EXPO_PUBLIC_BACKEND_URL}

RUN npx expo export --platform web --output-dir web-dist

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "npx serve -s web-dist -l ${PORT}"]
