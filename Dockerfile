# --- Stage 1: Build Stage ---
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps for Vite build)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Accept build arguments for Vite environment variables
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL
ARG VITE_FIREBASE_VAPID_KEY

# Set environment variables for build
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY
ENV NODE_ENV=production

# Build the Vite frontend
RUN npm run build

# --- Stage 2: Production Stage ---
FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# FIXED: Removed --omit=dev so 'tsx' and 'typescript' are available to run server.ts
RUN npm install

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
# Copy backend server code, utilities, and configuration
COPY server.ts ./
COPY src ./src
COPY tsconfig.json ./

# Cloud Run routes traffic via port 8080 by default.
EXPOSE 8080

# Start the server using the local tsx dependency
CMD ["./node_modules/.bin/tsx", "server.ts"]