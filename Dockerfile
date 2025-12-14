FROM node:18-bullseye

RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

COPY package.json .
RUN npm install

COPY server.js .

EXPOSE 3000

CMD ["npm", "start"]
