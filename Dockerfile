FROM node:20-alpine AS build
WORKDIR /app

# Vite incrusta estas variables en el bundle en tiempo de build (deben apuntar a
# la URL accesible desde el navegador del técnico, no al nombre de host interno de Docker).
ARG VITE_API_BASE_URL=http://localhost:5080
ARG VITE_HUB_URL=http://localhost:5080/hubs/remote
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_HUB_URL=$VITE_HUB_URL

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
