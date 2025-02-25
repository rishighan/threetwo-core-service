# Stage 1: Build Stage (Builder)
FROM node:21-alpine3.18 AS builder

# Set environment variables for build
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NODE_ENV=production

# Set the working directory
WORKDIR /core-services

# Install build dependencies using apk
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

# Copy application configuration files to build environment
COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

# Install application dependencies
RUN npm install

# Install sharp with platform-specific binaries
RUN npm install sharp --build-from-source

# Install global dependencies
RUN npm install -g typescript ts-node

# Stage 2: Final Stage (Run Environment)
FROM node:21-alpine3.18 AS runtime

# Set environment variables for runtime
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Set the working directory
WORKDIR /core-services

# Install runtime dependencies using apk (keep only what is needed to run the app)
RUN apk update && apk add --no-cache \
    bash \
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

# Copy only necessary files from the builder stage
COPY --from=builder /core-services /core-services

# Expose the application's port
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]
