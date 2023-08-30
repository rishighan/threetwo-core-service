import { createClient } from "redis";
const redisURL = new URL(process.env.REDIS_URI);

const pubClient = createClient({ url: `redis://${redisURL.hostname}:6379` });
(async () => {
	await pubClient.connect();
})();
const subClient = pubClient.duplicate();

export { subClient, pubClient };
