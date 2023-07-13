"use strict";
import { Service, ServiceBroker, ServiceSchema, Context } from "moleculer";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
const SocketIOService = require("moleculer-io");

const redisURL = new URL(process.env.REDIS_URI);
const pubClient = createClient({ url: `redis://${redisURL.hostname}:6379` });
(async () => {
	await pubClient.connect();
})();
const subClient = pubClient.duplicate();

export default class SocketService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "socket" }
	) {
		super(broker);
		let socketSessionId = null;
		this.parseServiceSchema({
			name: "socket",
			mixins: [SocketIOService],
			settings: {
				port: process.env.PORT || 3001,
				io: {
					namespaces: {
						"/": {
							events: {
								call: {
									// whitelist: ["math.*", "say.*", "accounts.*", "rooms.*", "io.*"],
								},
								action: async (data) => {
									switch (data.type) {
										case "LS_IMPORT":
											console.log(
												`Recieved ${data.type} event.`
											);
											// 1. Send task to queue
											await this.broker.call(
												"library.newImport",
												{ data: data.data, socketSessionId },
												{}
											);
											break;

										case "LS_TOGGLE_IMPORT_QUEUE":
											await this.broker.call(
												"importqueue.toggleImportQueue",
												data.data,
												{}
											);
											break;
										case "LS_SINGLE_IMPORT":
											console.info(
												"AirDC++ finished a download -> "
											);
											console.log(data);
											await this.broker.call(
												"library.importDownloadedComic",
												{ bundle: data },
												{}
											);
											break;
										// uncompress archive events
										case "COMICBOOK_EXTRACTION_SUCCESS":
											console.log(data);
											return data;
									}
								},
							},
						},
					},
					options: {
						adapter: createAdapter(pubClient, subClient),
					},
				},
			},
			hooks: {},
			actions: {

			},
			methods: {

			},
			async started() {
				this.io.on("connection", (socket) => {
					console.log(`socket.io server initialized with session ID: ${socket.id}`);
					socket.emit("sessionId", socket.id);
					socketSessionId = socket.id;
				});
			},
		});
	}
}
