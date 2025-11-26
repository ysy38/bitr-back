# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for better stability
RUN apk add --no-cache curl

# Copy package files first (updated with new scripts)
COPY package*.json ./
ARG CACHE_BUST=$(date +%s)

# Install dependencies with more stability options
RUN npm ci --only=production --no-audit --prefer-offline --progress=false

# Copy source code (excluding node_modules due to .dockerignore)
# Cache buster: 2025-10-19-20:50:00
COPY . ./

# ABI file is now included in the backend directory

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bitredict -u 1001

# Change ownership of the app directory
RUN chown -R bitredict:nodejs /app
USER bitredict

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Set Node.js memory limits (FIXED: removed invalid --gc-interval flag)
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Start the application with garbage collection enabled
CMD ["node", "--expose-gc", "api/server.js"] 