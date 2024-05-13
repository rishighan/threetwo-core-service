const path = require("path");
const mkdir = require("mkdirp").sync;
const DbService = require("moleculer-db");

export const DbMixin = (collection, model) => {
	if (!process.env.MONGO_URI) {
		console.log("MONGO_URI not provided, initializing local storage...");
		mkdir(path.resolve("./data"));
		return { mixins: [DbService] }; // Handle case where no DB URI is provided
	}

	const MongooseAdapter = require("moleculer-db-adapter-mongoose");
	const adapter = new MongooseAdapter(process.env.MONGO_URI, {
		user: process.env.MONGO_INITDB_ROOT_USERNAME,
		pass: process.env.MONGO_INITDB_ROOT_PASSWORD,
		keepAlive: true,
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	const connectWithRetry = async (
		adapter,
		maxRetries = 5,
		interval = 5000
	) => {
		for (let retry = 0; retry < maxRetries; retry++) {
			try {
				await adapter.connect();
				console.log("MongoDB connected successfully!");
				return;
			} catch (err) {
				console.error("MongoDB connection error:", err);
				console.log(
					`Retrying MongoDB connection in ${
						interval / 1000
					} seconds...`
				);
				await new Promise((resolve) => setTimeout(resolve, interval));
			}
		}
		console.error("Failed to connect to MongoDB after several attempts.");
	};

	return {
		mixins: [DbService],
		adapter,
		model,
		collection,
		async started() {
			await connectWithRetry(this.adapter);
		},
		async stopped() {
			try {
				await this.adapter.disconnect();
				console.log("MongoDB disconnected");
			} catch (err) {
				console.error("MongoDB disconnection error:", err);
			}
		},
	};
};
