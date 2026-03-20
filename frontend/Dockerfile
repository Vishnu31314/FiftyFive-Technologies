# Frontend Dockerfile - Nginx Alpine
FROM nginx:alpine

# Install envsubst (gettext package)
RUN apk add --no-cache gettext

# Copy static files
COPY index.html /usr/share/nginx/html/index.html

# Copy nginx config template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

EXPOSE 80
