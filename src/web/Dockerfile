# Build the Vite bundle, then serve it from nginx with an SSE-safe /agent proxy.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    ': "${AGENT_UPSTREAM:=http://agent:8000}"' \
    'AGENT_UPSTREAM="${AGENT_UPSTREAM%/}"' \
    'AGENT_HOST="${AGENT_UPSTREAM#*://}"' \
    'AGENT_HOST="${AGENT_HOST%%/*}"' \
    'AGENT_HOST="${AGENT_HOST%%:*}"' \
    'sed -e "s|__AGENT_UPSTREAM__|${AGENT_UPSTREAM}|g" -e "s|__AGENT_HOST__|${AGENT_HOST}|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' \
    'nginx -t' \
    'exec nginx -g "daemon off;"' \
    > /docker-entrypoint-standin.sh && chmod +x /docker-entrypoint-standin.sh

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-standin.sh"]
