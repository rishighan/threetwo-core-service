# threetwo-import-service

This microservice houses endpoints for the following functions:

1. Local import of a comic library into mongo (currently supports `cbr` and `cbz` files)
2. Metadata extraction from file, `comicinfo.xml` 
3. Mongo comic object orchestration
4. CRUD operations on `Comic` model
5. Helper utils to help with image metadata extraction, file operations and more.

## Local Development

1. You need `calibre` in your local path.
   On `macOS` you can `brew install calibre` and make sure that `ebook-meta` is present on the path
2. You need `mongo` for the data store. on `macOS` you can use [these instructions](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/) to install it
3. Clone this repo
4. Run `npm i`
5. Assuming you installed mongo correctly, run `MONGO_URI=mongodb://localhost:27017/threetwo npm run dev`
6. You should see the service spin up and a list of all the endpoints in the terminal
7. The service can be accessed through `http://localhost:3000/api/import/*`
## Docker Instructions

1. Build the image using `docker build . -t frishi/threetwo-import-service`. Give it a hot minute.
2. Run it using `docker run -it frishi/threetwo-import-service`
