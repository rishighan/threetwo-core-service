import { createClient } from "redis";

const redisURL = process.env.REDIS_URI;
if (!redisURL) throw new Error("REDIS_URI environment variable is not set.");

const createRedisClient = (url) => {
	const client = createClient({ url });

	client.on("error", (err) => console.error("Redis Client Error", err));
	client.on("connect", () => console.log("Connected to Redis:", url));
	client.on("reconnecting", () => console.log("Reconnecting to Redis..."));

	client.connect().catch((err) => console.error("Failed to connect to Redis:", err));

	return client;
};

const pubClient = createRedisClient(redisURL);
const subClient = pubClient.duplicate();

subClient.on("error", (err) => console.error("Redis Subscriber Client Error", err));
subClient.connect().catch((err) => console.error("Failed to connect Redis Subscriber:", err));

export { subClient, pubClient };
