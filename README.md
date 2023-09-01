# threetwo-core-service

This [moleculer-based](https://github.com/moleculerjs/moleculer-web) microservice houses endpoints for the following functions:

1. Local import of a comic library into mongo (currently supports `cbr` and `cbz` files)
2. Metadata extraction from file, `comicinfo.xml`
3. Mongo comic object orchestration
4. CRUD operations on `Comic` model
5. Helper utils to help with image metadata extraction, file operations and more.

## Local Development

1. You need the following dependencies installed: `mongo`, `elasticsearch` and `redis`
2. Clone this repo
3. Run `npm i`
4. Assuming you installed the dependencies correctly, run:
    ```
    COMICS_DIRECTORY=<PATH_TO_COMICS_DIRECTORY> \
    USERDATA_DIRECTORY=<PATH_TO_USERDATA_DIRECTORY> \
    REDIS_URI=redis://<REDIS_HOST:REDIS_PORT> \
    ELASTICSEARCH_URI=<ELASTICSEARCH_HOST:ELASTICSEARCH_PORT> \
    MONGO_URI=mongodb://<MONGO_HOST:MONGO_PORT>/threetwo \
    npm run dev
    ```
    to start the service
5. You should see the service spin up and a list of all the endpoints in the terminal
6. The service can be accessed through `http://localhost:3000/api/<serviceName>/*`

## Docker Instructions

1. Build the image using `docker build . -t frishi/threetwo-import-service`. Give it a hot minute.
2. Run it using `docker run -it frishi/threetwo-import-service`
