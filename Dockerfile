FROM node:18-alpine

WORKDIR /app

# Package.json kopyala
COPY package*.json ./

# Dependencies yükle
RUN npm ci --only=production

# Kodları kopyala
COPY . .

# Port
EXPOSE 3000

# Start
CMD ["npm", "start"]
