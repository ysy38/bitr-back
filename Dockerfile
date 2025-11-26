# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy backend package files first
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./
COPY bot/ ./bot/

# Copy solidity artifacts needed by backend services
COPY solidity/artifacts/ ./solidity/artifacts/

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

# Start the application
CMD ["node", "api/server.js"] 