FROM jeanblanchard/alpine-glibc

# Show all node logs
ENV NPM_CONFIG_LOGLEVEL warn
ENV NODE_ENV=production
ENV CALIBRE_INSTALLER_SOURCE_CODE_URL https://raw.githubusercontent.com/kovidgoyal/calibre/master/setup/linux-installer.py
WORKDIR /threetwo-import-service

RUN apk update && \
    apk add --no-cache --upgrade \
    wget \
    imagemagick \
    python3 \
    nodejs \
    npm \
    xvfb \
    xz && \
    wget -O- ${CALIBRE_INSTALLER_SOURCE_CODE_URL} | python3 -c "import sys; main=lambda:sys.stderr.write('Download failed\n'); exec(sys.stdin.read()); main(install_dir='/opt', isolated=True)" && \
    rm -rf /tmp/calibre-installer-cache

COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

# Install Dependncies
RUN npm install -g typescript ts-node
RUN npm ci --silent

COPY . .

# Build and cleanup
RUN npm run build \
 && npm prune


EXPOSE 3000
# Start server
CMD ["npm", "start"]