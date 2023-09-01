# threetwo-core-service

This [moleculer-based](https://github.com/moleculerjs/moleculer-web) microservice houses endpoints for the following functions:

1. Local import of a comic library into mongo (currently supports `cbr` and `cbz` files)
2. Metadata extraction from file, `comicinfo.xml`
3. Mongo comic object orchestration
4. CRUD operations on `Comic` model
5. Helper utils to help with image metadata extraction, file operations and more.

## Local Development

1. You need the following dependencies installed: `mongo`, `elasticsearch` and `redis`
2. You also need binaries for `unrar` and `p7zip`
3. Clone this repo
4. Run `npm i`
5. Assuming you installed the dependencies correctly, run:

    ```
    COMICS_DIRECTORY=<PATH_TO_COMICS_DIRECTORY> \
    USERDATA_DIRECTORY=<PATH_TO_USERDATA_DIRECTORY> \
    REDIS_URI=redis://<REDIS_HOST:REDIS_PORT> \
    ELASTICSEARCH_URI=<ELASTICSEARCH_HOST:ELASTICSEARCH_PORT> \
    MONGO_URI=mongodb://<MONGO_HOST:MONGO_PORT>/threetwo \
    UNRAR_BIN_PATH=<UNRAR_BIN_PATH> \
    SEVENZ_BINARY_PATH=<SEVENZ_BINARY_PATH> \
    npm run dev
    ```

    to start the service

6. You should see the service spin up and a list of all the endpoints in the terminal
7. The service can be accessed through `http://localhost:3000/api/<serviceName>/*`

## Docker Instructions

1. Build the image using `docker build . -t frishi/threetwo-import-service`. Give it a hot minute.
2. Run it using `docker run -it frishi/threetwo-import-service`
