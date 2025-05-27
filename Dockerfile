# Use official Node.js image with Alpine
FROM node:24-alpine

# Create non-root user and set workdir
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /usr/src/app

# Install dependencies first (for better layer caching)
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# Copy only necessary files
COPY public/ public/
COPY services/ services/
COPY utils/ utils/
COPY server.js .
COPY Node.csv .

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    CHECK_INTERVAL=300000 \
    NODE_OPTIONS="--enable-source-maps"

# Set permissions
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/api/urls || exit 1

# Expose the app port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]