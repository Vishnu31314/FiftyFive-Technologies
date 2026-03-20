# ─── Stage 1: Builder ───────────────────────────────────────────
FROM node:alpine AS builder

WORKDIR /app

# Copy only package.json first (better layer caching)
COPY package.json .

# Install production dependencies only
RUN npm install --production

# ─── Stage 2: Final Image ────────────────────────────────────────
FROM node:alpine

WORKDIR /app

# Create non-root user (Bonus ⭐)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY app.js .
COPY package.json .

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "app.js"]
