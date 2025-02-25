# Use a non-ARM image (x86_64) for Node.js
FROM --platform=linux/amd64 node:21-alpine3.18 AS builder

# Set metadata for contact
LABEL maintainer="Rishi Ghan <rishi.ghan@gmail.com>"

# Set environment variables
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NODE_ENV=production

# Set the working directory
WORKDIR /core-services

# Install required dependencies using apk
RUN apk update && apk add --no-cache \
    bash \
    wget \
    imagemagick \
    python3 \
    xvfb \
    build-base \
    g++ \
    python3-dev \
    p7zip \
    curl \
    git \
    glib \
    cairo-dev \
    pango-dev \
    icu-dev \
    pkgconfig

# Install libvips from source
RUN wget https://github.com/libvips/libvips/releases/download/v8.13.0/vips-8.13.0.tar.gz \
    && tar -zxvf vips-8.13.0.tar.gz \
    && cd vips-8.13.0 \
    && ./configure --disable-python \
    && make -j$(nproc) \
    && make install \
    && cd .. \
    && rm -rf vips-8.13.0.tar.gz vips-8.13.0

# Install unrar directly from RARLAB
RUN wget https://www.rarlab.com/rar/rarlinux-x64-621.tar.gz \
    && tar -zxvf rarlinux-x64-621.tar.gz \
    && cp rar/unrar /usr/bin/ \
    && rm -rf rarlinux-x64-621.tar.gz rar

# Verify Node.js installation
RUN node -v && npm -v

# Copy application configuration files
COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

# Install application dependencies
RUN npm install

# Install sharp with proper platform configuration
RUN npm install --force sharp --platform=linux/amd64

# Install global dependencies
RUN npm install -g typescript ts-node

# Copy the rest of the application files (e.g., source code)
COPY . .

# Build the app
RUN npm run build

# Final image
FROM --platform=linux/amd64 node:21-alpine3.18

# Set environment variables
ENV NODE_ENV=production

# Set the working directory
WORKDIR /core-services

# Install runtime dependencies
RUN apk update && apk add --no-cache \
    bash \
    wget \
    imagemagick \
    python3 \
    xvfb \
    p7zip \
    curl \
    git \
    glib \
    cairo-dev \
    pango-dev \
    icu-dev \
    pkgconfig

# Copy necessary files from the builder image
COPY --from=builder /core-services /core-services

# Expose the application's port
EXPOSE 3000

# Command to run the application (this will now work)
CMD ["npm", "start"]
