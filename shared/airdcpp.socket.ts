import WebSocket from "ws";

/**
 * Wrapper around the AirDC++ WebSocket API socket.
 * Provides methods to connect, disconnect, and interact with the AirDC++ API.
 */
class AirDCPPSocket {
	/**
	 * Configuration options for the underlying socket.
	 * @private
	 */
	private options: {
		url: string;
		autoReconnect: boolean;
		reconnectInterval: number;
		logLevel: string;
		ignoredListenerEvents: string[];
		username: string;
		password: string;
	};

	/**
	 * Instance of the AirDC++ API socket.
	 * @private
	 */
	private socketInstance: any;

	/**
	 * Promise that resolves when the Socket module is loaded
	 * @private
	 */
	private socketModulePromise: Promise<any>;

	/**
	 * Constructs a new AirDCPPSocket wrapper.
	 * @param {{ protocol: string; hostname: string; username: string; password: string }} configuration
	 *   Connection configuration: protocol (ws or wss), hostname, username, and password.
	 */
	constructor(configuration: {
		protocol: string;
		hostname: string;
		username: string;
		password: string;
	}) {
		const socketProtocol =
			configuration.protocol === "https" ? "wss" : "ws";
		this.options = {
			url: `${socketProtocol}://${configuration.hostname}/api/v1/`,
			autoReconnect: true,
			reconnectInterval: 5000,
			logLevel: "verbose",
			ignoredListenerEvents: [
				"transfer_statistics",
				"hash_statistics",
				"hub_counts_updated",
			],
			username: configuration.username,
			password: configuration.password,
		};
		
		// Use dynamic import to load the ES module
		this.socketModulePromise = import("airdcpp-apisocket").then(module => {
			const { Socket } = module;
			this.socketInstance = Socket(this.options, WebSocket);
			return this.socketInstance;
		});
	}

	/**
	 * Establishes a connection to the AirDC++ server.
	 * @async
	 * @returns {Promise<any>} Session information returned by the server.
	 */
	async connect(): Promise<any> {
		await this.socketModulePromise;
		if (
			this.socketInstance &&
			typeof this.socketInstance.connect === "function"
		) {
			return await this.socketInstance.connect();
		}
		return Promise.reject(
			new Error("Connect method not available on socket instance")
		);
	}

	/**
	 * Disconnects from the AirDC++ server.
	 * @async
	 * @returns {Promise<void>}
	 */
	async disconnect(): Promise<void> {
		await this.socketModulePromise;
		if (
			this.socketInstance &&
			typeof this.socketInstance.disconnect === "function"
		) {
			await this.socketInstance.disconnect();
		}
	}

	/**
	 * Sends a POST request to a specific AirDC++ endpoint.
	 * @async
	 * @param {string} endpoint - API endpoint path (e.g., "search").
	 * @param {object} [data={}] - Payload to send with the request.
	 * @returns {Promise<any>} Response from the AirDC++ server.
	 */
	async post(endpoint: string, data: object = {}): Promise<any> {
		await this.socketModulePromise;
		return await this.socketInstance.post(endpoint, data);
	}

	/**
	 * Sends a GET request to a specific AirDC++ endpoint.
	 * @async
	 * @param {string} endpoint - API endpoint path (e.g., "search/123").
	 * @param {object} [data={}] - Query parameters to include.
	 * @returns {Promise<any>} Response from the AirDC++ server.
	 */
	async get(endpoint: string, data: object = {}): Promise<any> {
		await this.socketModulePromise;
		return await this.socketInstance.get(endpoint, data);
	}

	/**
	 * Adds an event listener to the AirDC++ socket.
	 * @async
	 * @param {string} event - Event group (e.g., "search" or "queue").
	 * @param {string} handlerName - Specific event within the group (e.g., "search_result_added").
	 * @param {Function} callback - Callback to invoke when the event occurs.
	 * @param {string|number} [id] - Optional identifier (e.g., search instance ID).
	 * @returns {Promise<any>} Listener registration result.
	 */
	async addListener(
		event: string,
		handlerName: string,
		callback: (...args: any[]) => void,
		id?: string | number
	): Promise<any> {
		await this.socketModulePromise;
		return await this.socketInstance.addListener(
			event,
			handlerName,
			callback,
			id
		);
	}
}

export default AirDCPPSocket;
