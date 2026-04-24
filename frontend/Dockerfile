# ==============================================================================
# Stage 1: Build — compile React app into static assets
# ==============================================================================
FROM node:20-alpine AS build

WORKDIR /app

# -- Build-time args (baked into the JS bundle at compile time) ----------------
ARG REACT_APP_API_URL=http://localhost:5000
ARG REACT_APP_WS_URL=http://localhost:5000
ARG REACT_APP_WEBRTC_STUN_URLS=stun:stun.l.google.com:19302
ARG REACT_APP_WEBRTC_TURN_URL=turn:localhost:3478?transport=udp
ARG REACT_APP_WEBRTC_TURN_USERNAME=aquaguard
ARG REACT_APP_WEBRTC_TURN_CREDENTIAL=aquaguardpass
ARG REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY=all
ARG REACT_APP_WEBRTC_FORCE_RELAY=false
ARG REACT_APP_WEBRTC_ENABLE=true

# Promote ARGs to ENVs only for the build stage (CRA reads process.env at build time).
# These do NOT leak into the runtime stage because it uses a fresh base image.
ENV REACT_APP_API_URL=${REACT_APP_API_URL} \
    REACT_APP_WS_URL=${REACT_APP_WS_URL} \
    REACT_APP_WEBRTC_STUN_URLS=${REACT_APP_WEBRTC_STUN_URLS} \
    REACT_APP_WEBRTC_TURN_URL=${REACT_APP_WEBRTC_TURN_URL} \
    REACT_APP_WEBRTC_TURN_USERNAME=${REACT_APP_WEBRTC_TURN_USERNAME} \
    REACT_APP_WEBRTC_TURN_CREDENTIAL=${REACT_APP_WEBRTC_TURN_CREDENTIAL} \
    REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY=${REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY} \
    REACT_APP_WEBRTC_FORCE_RELAY=${REACT_APP_WEBRTC_FORCE_RELAY} \
    REACT_APP_WEBRTC_ENABLE=${REACT_APP_WEBRTC_ENABLE}

# Copy dependency manifests FIRST for layer cache reuse.
COPY package*.json ./
RUN npm ci --no-audit --no-fund --omit=optional

# Copy source and build.
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Runtime — serve static files with nginx
# ==============================================================================
FROM nginx:1.27-alpine

# -- Metadata labels ---------------------------------------------------------
LABEL maintainer="AquaGuard Team" \
      org.opencontainers.image.title="aquaguard-frontend" \
      org.opencontainers.image.description="AquaGuard React monitoring dashboard" \
      org.opencontainers.image.source="https://github.com/Cerjho/aquaguard"

# Remove default nginx content and copy built assets.
RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# -- Non-root user ------------------------------------------------------------
# nginx:alpine ships with an 'nginx' user (UID 101). We configure nginx to
# run its worker processes as this user. The master process must start as root
# to bind port 80, but workers drop privileges immediately.
# Ensure the nginx user can write to cache and pid directories.
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

# -- Health check --------------------------------------------------------------
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

EXPOSE 80
