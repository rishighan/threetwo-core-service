# threetwo-import-service

This microservice houses endpoints for the following functions:

1. Local import of a comic library into mongo (currently supports `cbr` and `cbz` files)
2. Metadata extraction from file, `comicinfo.xml` 
3. Mongo comic object orchestration
4. CRUD operations on `Comic` model
5. Helper utils to help with image metadata extraction, file operations and more.

## Docker Instructions

1. Build the image using `docker build . -t frishi/threetwo-import-service`. Give it a hot minute.
2. Run it using `docker run -it frishi/threetwo-import-service`