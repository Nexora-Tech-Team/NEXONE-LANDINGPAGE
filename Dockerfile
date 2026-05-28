# Stage 1: Build admin React app
FROM node:20-alpine AS admin-builder
WORKDIR /admin
COPY admin/package*.json ./
RUN npm install
COPY admin/ ./
RUN VITE_API_BASE_URL="" npm run build

# Stage 2: Nginx serve static landing page + built admin
FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY Asset/ /usr/share/nginx/html/Asset/
COPY --from=admin-builder /admin/dist/ /usr/share/nginx/html/monitoring-nexone/
EXPOSE 80
