# Use a lightweight Node.js base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies (this will now include EJS)
RUN npm install --production

# Copy application logic
COPY server.js ./
COPY routes/ ./routes/

# --- CRITICAL NEW LINE: Copy the EJS templates ---
COPY views/ ./views/

# Copy static assets (Images, CSS, JS)
COPY public/ ./public/

# Expose the application port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
