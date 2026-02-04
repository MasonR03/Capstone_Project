# Prisma engines are sensitive to libc + OpenSSL versions.
# Use Debian-based images (glibc) to avoid Alpine/musl + libssl compatibility issues on EC2.
FROM node:20-bookworm-slim AS deps

# Create app directory inside the container
WORKDIR /app

# Ensure OpenSSL is present so Prisma can detect the right engine variant.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first to leverage cached layers
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client, then prune dev dependencies for runtime
RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app

# Runtime needs OpenSSL libs for Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Bring in production node_modules (includes generated Prisma client)
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application source
COPY . .

# Ensure Node runs in production mode
ENV NODE_ENV=production

# Expose the port the Express server listens on
EXPOSE 8082

# Launch the application
CMD ["npm", "run", "server"]
