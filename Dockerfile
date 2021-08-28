FROM node:buster-slim

# Show all node logs
ENV NPM_CONFIG_LOGLEVEL warn
ENV SERVICES=./dist/services
ENV MONGO_URI=mongodb://localhost:27017/threetwo

RUN mkdir /threetwo-import-service
WORKDIR /threetwo-import-service

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y \
    bash git openssh-server \
    ca-certificates \
    gcc \
    libgl1-mesa-glx \
    python3 python3-pip \
    qtbase5-dev \
    wget \
    xdg-utils \
    xz-utils \
    libvips-dev build-essential

RUN wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt isolated=y && \
    rm -rf /tmp/calibre-installer-cache

COPY package.json package-lock.json ./
COPY moleculer.config.ts ./
COPY tsconfig.json ./

RUN npm cache verify
# Install Dependncies
RUN npm install -g typescript ts-node
RUN npm install

COPY . .

EXPOSE 3000
CMD npm start