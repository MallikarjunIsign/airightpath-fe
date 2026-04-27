# ---------- Stage 1: Build ----------
FROM node:22-bullseye-slim AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --no-audit --silent && npm cache clean --force

# Copy source code
COPY . .

# Build the app (Vite → dist folder)
RUN npm run build


# ---------- Stage 2: Nginx ----------
FROM nginx:alpine

# Remove default config
RUN rm -rf /usr/share/nginx/html/*

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Fix React Router issue
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]