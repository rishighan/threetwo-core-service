"use strict";
import { Service, ServiceBroker, ServiceSchema, Context } from "moleculer";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import Session from "../models/session.model";
import { pubClient, subClient } from "../config/redis.config";
const { MoleculerError } = require("moleculer").Errors;
const SocketIOService = require("moleculer-io");
const { v4: uuidv4 } = require("uuid");

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
										case "RESUME_SESSION":
											console.log("Attempting to resume session...");
											try {
												const sessionRecord = await Session.find({
													sessionId: data.session.sessionId,
												});
												// check for sessionId's existence
												if (
													sessionRecord.length !== 0 &&
													sessionRecord[0].sessionId ===
														data.session.sessionId
												) {
													this.io.emit("yelaveda", {
														hagindari: "bhagindari",
													});
												}
											} catch (err) {
												throw new MoleculerError(
													err,
													500,
													"SESSION_ID_NOT_FOUND",
													{
														data: data.session.sessionId,
													}
												);
											}

											break;

										case "LS_IMPORT":
											console.log(`Recieved ${data.type} event.`);
											// 1. Send task to queue
											await this.broker.call(
												"library.newImport",
												{
													data: data.data,
													socketSessionId,
												},
												{}
											);
											break;

										case "LS_TOGGLE_IMPORT_QUEUE":
											await this.broker.call(
												"jobqueue.toggle",
												data.data,
												{}
											);
											break;
										case "LS_SINGLE_IMPORT":
											console.info("AirDC++ finished a download -> ");
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
			actions: {},
			methods: {},
			async started() {
				this.io.on("connection", async (socket) => {
					console.log(
						`socket.io server connected to client with session ID: ${socket.id}`
					);
					console.log("Looking up sessionId in Mongo...");
					const sessionIdExists = await Session.find({
						sessionId: socket.handshake.query.sessionId,
					});
					// 1. if sessionId isn't found in Mongo, create one and persist it
					if (sessionIdExists.length === 0) {
						console.log(
							`Socket Id ${socket.id} not found in Mongo, creating a new session...`
						);
						const sessionId = uuidv4();
						socket.sessionId = sessionId;
						console.log(`Saving session ${sessionId} to Mongo...`);
						await Session.create({
							sessionId,
							socketId: socket.id,
						});
						socket.emit("sessionInitialized", sessionId);
					}
					// 2. else, retrieve it from Mongo and "resume" the socket.io connection
					else {
						console.log(
							`Found socketId ${socket.id}, attempting to resume socket.io connection...`
						);
					}
				});
			},
		});
	}
}
