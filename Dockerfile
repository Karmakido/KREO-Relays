FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git openssh-client

COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install --omit=dev

COPY . .

ENV ADMIN_HOST=0.0.0.0
ENV ADMIN_PORT=4000

EXPOSE 4000

CMD ["npm", "run", "admin"]
