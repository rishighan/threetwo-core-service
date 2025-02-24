# Use a base image with Node.js 22.1.0
FROM node:22.1.0

# Set metadata for contact
LABEL maintainer="Rishi Ghan <rishi.ghan@gmail.com>"

# Set environment variables
ENV NPM_CONFIG_LOGLEVEL warn
ENV NODE_ENV=production

# Set the working directory
WORKDIR /core-services

# Install required packages
RUN apt-get update && apt-get install -y \
	libvips-tools \
	wget \
	imagemagick \
	python3 \
	xvfb \
	xz-utils \
	curl \
	bash \
	software-properties-common \
	build-essential \
	g++ \
	python3-dev

# Install p7zip
RUN apt-get update && apt-get install -y p7zip

# Install unrar directly from RARLAB
RUN wget https://www.rarlab.com/rar/rarlinux-x64-621.tar.gz \
	&& tar -zxvf rarlinux-x64-621.tar.gz \
	&& cp rar/unrar /usr/bin/ \
	&& rm -rf rarlinux-x64-621.tar.gz rar

# Clean up package lists
RUN rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node -v && npm -v

# Copy application configuration files
COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

# Install application dependencies
RUN npm install

# Install sharp with platform-specific flags
RUN npm install --platform=linux --arch=x64 sharp

# Install global dependencies
RUN npm install -g typescript ts-node

# Copy the rest of the application files
COPY . .

# Build and clean up
RUN npm run build \
	&& npm prune

# Expose the application's port
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]
