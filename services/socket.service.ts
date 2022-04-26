"use strict";
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
const SocketIOService = require("moleculer-io");
const redisAdapter = require("socket.io-redis");
const redisURL = new URL(process.env.REDIS_URI);
console.log(redisURL.hostname);

export default class SocketService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "socket" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
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
										action: async (data, ack) => {
											// write your handler function here.
											console.log(
												JSON.stringify(data, null, 2)
											);

											switch (data.type) {
												case "LS_IMPORT":
													console.log(
														`Recieved ${data.type} event.`
													);
													// 1. Send task to queue
													await this.broker.call(
														"library.newImport",
														data.data,
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
													console.log(data.data);
													break;
											}
										},
									},
								},
							},
							options: {
								adapter: redisAdapter({
									host: redisURL.hostname,
									port: 6379,
								}),
							},
						},
					},
					hooks: {},
					actions: {},
					methods: {},
					async started() {
						this.io.on("connection", (data) =>
							console.log("socket.io server initialized.")
						);
					},
				},
				schema
			)
		);
	}
}
