import { createClient } from "redis";

const pubClient = createClient({
  url: process.env.REDIS_URI || 'redis://localhost:6379'
});
(async () => {
	await pubClient.connect();
})();
const subClient = pubClient.duplicate();

export { subClient, pubClient };
