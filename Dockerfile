FROM node:20-alpine
WORKDIR /usr/src/app

# Copy dependency files first to leverage Docker layer caching
COPY package*.json ./
RUN npm install --only=production

# Copy application code
COPY . .

# Switch to the restricted 'node' user for security
USER node

# Document the application port
EXPOSE 3000

CMD [ "node", "server.js" ]
