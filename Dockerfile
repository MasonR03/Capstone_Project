# Use a lightweight Node.js base image for production
FROM node:20-alpine

# Create app directory inside the container
WORKDIR /app

# Install dependencies first to leverage cached layers
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the application source
COPY . .

# Ensure Node runs in production mode
ENV NODE_ENV=production

# Expose the port the Express server listens on
EXPOSE 8082

# Launch the application
CMD ["npm", "run", "server"]
