FROM alpine:3.14

# Show all node logs
ENV NPM_CONFIG_LOGLEVEL warn
ENV NODE_ENV=production
WORKDIR /threetwo-import-service


RUN apk add --update \
    --repository http://dl-3.alpinelinux.org/alpine/edge/testing \
    vips-tools \
    wget \
    imagemagick \
    python3 \
    unrar \
    nodejs \
    npm \
    xvfb \
    xz


COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

RUN npm i
# Install Dependncies
RUN npm install -g typescript ts-node

COPY . .

# Build and cleanup
RUN npm run build \
    && npm prune


EXPOSE 3000
# Start server
CMD ["npm", "start"]