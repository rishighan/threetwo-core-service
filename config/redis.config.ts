// Import the Redis library
import Redis from "ioredis";

// Environment variable for Redis URI
const redisURI = process.env.REDIS_URI || "redis://localhost:6379";
console.log(`process.env.REDIS_URI is ${process.env.REDIS_URI}`)
// Creating the publisher client
const pubClient = new Redis(redisURI);

// Creating the subscriber client
const subClient = new Redis(redisURI);

// Handle connection events for the publisher
pubClient.on("connect", () => {
	console.log("Publisher client connected to Redis.");
});
pubClient.on("error", (err) => {
	console.error("Publisher client failed to connect to Redis:", err);
});

// Handle connection events for the subscriber
subClient.on("connect", () => {
	console.log("Subscriber client connected to Redis.");
});
subClient.on("error", (err) => {
	console.error("Subscriber client failed to connect to Redis:", err);
});

// Export the clients for use in other parts of the application
export { pubClient, subClient };
