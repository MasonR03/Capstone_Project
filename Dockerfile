# Use a lightweight Node.js base image for production
FROM node:20-alpine AS deps

# Create app directory inside the container
WORKDIR /app

# Install dependencies first to leverage cached layers
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client, then prune dev dependencies for runtime
RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app

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
