"use strict";
import { Service, ServiceBroker, ServiceSchema, Context } from "moleculer";
import { JobType } from "moleculer-bullmq";
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
									whitelist: ["socket.*"],
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
				resumeSession: async (ctx: Context<{ sessionId: string }>) => {
					const { sessionId } = ctx.params;
					console.log("Attempting to resume session...");
					try {
						const sessionRecord = await Session.find({
							sessionId,
						});
						// 1. Check for sessionId's existence, and a match
						if (
							sessionRecord.length !== 0 &&
							sessionRecord[0].sessionId === sessionId
						) {
							// 2. Find if the queue has active, paused or waiting jobs
							const jobs: JobType = await this.broker.call(
								"jobqueue.getJobCountsByType",
								{}
							);
							const { active, paused, waiting } = jobs;

							if (active > 0 || paused > 0 || waiting > 0) {
								// 3. Get job counts
								const completedJobCount = await pubClient.get(
									"completedJobCount"
								);
								const failedJobCount = await pubClient.get(
									"failedJobCount"
								);

								// 4. Send the counts to the active socket.io session
								await this.broker.call("socket.broadcast", {
									namespace: "/",
									event: "RESTORE_JOB_COUNTS_AFTER_SESSION_RESTORATION",
									args: [
										{
											completedJobCount,
											failedJobCount,
											queueStatus: "running",
										},
									],
								});
							}
						}
					} catch (err) {
						throw new MoleculerError(
							err,
							500,
							"SESSION_ID_NOT_FOUND",
							{
								data: sessionId,
							}
						);
					}
				},

				setQueueStatus: async (
					ctx: Context<{
						queueAction: string;
						queueStatus: string;
					}>
				) => {
					const { queueAction } = ctx.params;
					await this.broker.call(
						"jobqueue.toggle",
						{ action: queueAction },
						{}
					);
				},
				importSingleIssue: async (ctx: Context<{}>) => {
					console.info("AirDC++ finished a download -> ");
					console.log(ctx.params);
					// await this.broker.call(
					// 	"library.importDownloadedComic",
					// 	{ bundle: data },
					// 	{}
					// );
				},
			},
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
						console.log(`Found socketId ${socket.id}, no-op.`);
					}
				});
			},
		});
	}
}
