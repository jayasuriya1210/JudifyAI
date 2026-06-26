FROM mcr.microsoft.com/playwright:v1.54.2-noble

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ 

COPY package*.json ./

COPY frontend/package*.json ./frontend/

COPY backend/package*.json ./backend/

RUN npm run install:all

COPY . .

WORKDIR /app/frontend

RUN npm run build

WORKDIR /app

EXPOSE 3000
EXPOSE 5173

CMD ["npm", "run", "dev"]
