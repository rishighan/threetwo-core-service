const path = require("path");
const mkdir = require("mkdirp").sync;
const DbService = require("moleculer-db");

export const DbMixin = (collection, model) => {
	if (process.env.MONGO_URI) {
		const MongooseAdapter = require("moleculer-db-adapter-mongoose");
		console.log("Connecting to MongoDB at", process.env.MONGO_URI);

		const connectWithRetry = (
			adapter,
			maxRetries = 5,
			interval = 5000,
			retries = 0
		) => {
			return adapter
				.connect()
				.then(() => console.log("MongoDB connected successfully!"))
				.catch((err) => {
					console.error("MongoDB connection error:", err);
					if (retries < maxRetries) {
						console.log(
							`Retrying MongoDB connection in ${
								interval / 1000
							} seconds...`
						);
						setTimeout(
							() =>
								connectWithRetry(
									adapter,
									maxRetries,
									interval,
									retries + 1
								),
							interval
						);
					} else {
						console.error(
							"Failed to connect to MongoDB after several attempts."
						);
					}
				});
		};

		const adapter = new MongooseAdapter(process.env.MONGO_URI, {
			user: process.env.MONGO_INITDB_ROOT_USERNAME,
			pass: process.env.MONGO_INITDB_ROOT_PASSWORD,
			keepAlive: true,
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});

		return {
			mixins: [DbService],
			adapter: adapter,
			model,
			collection,
			started() {
				connectWithRetry(this.adapter);
			},
			stopped() {
				this.adapter
					.disconnect()
					.then(() => console.log("MongoDB disconnected"))
					.catch((err) =>
						console.error("MongoDB disconnection error:", err)
					);
			},
		};
	} else {
		console.log("MONGO_URI not provided, initializing local storage...");
		mkdir(path.resolve("./data"));
	}
};
