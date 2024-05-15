import { createClient } from "redis";
import { URL } from "url";

// Ensure that the REDIS_URI environment variable is set
const redisURL = process.env.REDIS_URI;
if (!redisURL) {
	throw new Error("REDIS_URI environment variable is not set.");
}

// Function to create a Redis client
const createRedisClient = (url) => {
	const client = createClient({ url });
	console.log(client)
	client.on("error", (err) => {
		console.error("Redis Client Error", err);
	});

	client.on("connect", () => {
		console.log("Connected to Redis:", url);
	});

	client.on("reconnecting", () => {
		console.log("Reconnecting to Redis...");
	});

	// Attempt to connect with error handling
	client.connect().catch((err) => {
		console.error("Failed to connect to Redis:", err);
	});

	return client;
};

// Create publisher and subscriber clients
const pubClient = createRedisClient(process.env.REDIS_URI);
const subClient = pubClient.duplicate();

// Ensure subscriber client handles connection and errors
subClient.on("error", (err) => {
	console.error("Redis Subscriber Client Error", err);
});

subClient.connect().catch((err) => {
	console.error("Failed to connect Redis Subscriber:", err);
});

export { subClient, pubClient };
