const WebSocket = require("ws");
const { Socket } = require("airdcpp-apisocket");

class AirDCPPSocket {
	// Explicitly declare properties
	options; // Holds configuration options
	socketInstance; // Instance of the AirDCPP Socket

	constructor(configuration: any) {
		let socketProtocol = configuration.protocol === "https" ? "wss" : "ws";
		this.options = {
			url: `${socketProtocol}://${configuration.hostname}/api/v1/`,
			autoReconnect: true,
			reconnectInterval: 5000, // milliseconds
			logLevel: "verbose",
			ignoredListenerEvents: [
				"transfer_statistics",
				"hash_statistics",
				"hub_counts_updated",
			],
			username: configuration.username,
			password: configuration.password,
		};
		// Initialize the socket instance using the configured options and WebSocket
		this.socketInstance = Socket(this.options, WebSocket);
	}

	// Method to ensure the socket connection is established if required by the library or implementation logic
	async connect() {
		// Here we'll check if a connect method exists and call it
		if (
			this.socketInstance &&
			typeof this.socketInstance.connect === "function"
		) {
			const sessionInformation = await this.socketInstance.connect();
			return sessionInformation;
		}
	}

	// Method to ensure the socket is disconnected properly if required by the library or implementation logic
	async disconnect() {
		// Similarly, check if a disconnect method exists and call it
		if (
			this.socketInstance &&
			typeof this.socketInstance.disconnect === "function"
		) {
			await this.socketInstance.disconnect();
		}
	}

	// Method to post data to an endpoint
	async post(endpoint: any, data: any = {}) {
		// Call post on the socket instance, assuming post is a valid method of the socket instance
		return await this.socketInstance.post(endpoint, data);
	}
	async get(endpoint: any, data: any = {}) {
		// Call post on the socket instance, assuming post is a valid method of the socket instance
		return await this.socketInstance.get(endpoint, data);
	}

	// Method to add listeners to the socket instance for handling real-time updates or events
	async addListener(event: any, handlerName: any, callback: any, id?: any) {
		// Attach a listener to the socket instance
		return await this.socketInstance.addListener(
			event,
			handlerName,
			callback,
			id
		);
	}
}

export default AirDCPPSocket;
