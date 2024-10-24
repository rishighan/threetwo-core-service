const path = require("path");
const mkdir = require("mkdirp").sync;
const DbService = require("moleculer-db");


export const DbMixin = (collection, model) => {
	if (process.env.MONGO_URI) {
		const MongooseAdapter = require("moleculer-db-adapter-mongoose");
		return {
			mixins: [DbService],
			adapter: new MongooseAdapter(process.env.MONGO_URI, {
				user: process.env.MONGO_INITDB_ROOT_USERNAME,
				pass: process.env.MONGO_INITDB_ROOT_PASSWORD,
				keepAlive: true,
				useUnifiedTopology: true,
				family: 4,
			}),
			model,
		};
	}
	mkdir(path.resolve("./data"));
};
