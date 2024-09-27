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
import AirDCPPSocket from "../shared/airdcpp.socket";

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
						"/automated": {
							events: {
								call: {
									whitelist: [
										"socket.*", // Allow 'search' in the automated namespace
									],
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
				// AirDCPP Socket actions

				search: {
					params: {
						query: "object",
						config: "object",
					},
					async handler(ctx) {
						const { query, config, namespace } = ctx.params;
						const namespacedInstance = this.io.of(namespace || "/");
						const ADCPPSocket = new AirDCPPSocket(config);
						try {
							await ADCPPSocket.connect();
							const instance = await ADCPPSocket.post(
								"search",
								query
							);

							// Send the instance to the client
							await namespacedInstance.emit("searchInitiated", {
								instance,
							});

							// Setting up listeners
							await ADCPPSocket.addListener(
								`search`,
								`search_result_added`,
								(groupedResult) => {
									console.log(JSON.stringify(groupedResult, null, 4));
									namespacedInstance.emit(
										"searchResultAdded",
										groupedResult
									);
								},
								instance.id
							);

							await ADCPPSocket.addListener(
								`search`,
								`search_result_updated`,
								(updatedResult) => {
									namespacedInstance.emit(
										"searchResultUpdated",
										updatedResult
									);
								},
								instance.id
							);

							await ADCPPSocket.addListener(
								`search`,
								`search_hub_searches_sent`,
								async (searchInfo) => {
									await this.sleep(5000);
									const currentInstance =
										await ADCPPSocket.get(
											`search/${instance.id}`
										);
									// Send the instance to the client
									await namespacedInstance.emit(
										"searchesSent",
										{
											searchInfo,
										}
									);
									if (currentInstance.result_count === 0) {
										console.log("No more search results.");
										namespacedInstance.emit(
											"searchComplete",
											{
												message:
													"No more search results.",
											}
										);
									}
								},
								instance.id
							);

							// Perform the actual search
							await ADCPPSocket.post(
								`search/${instance.id}/hub_search`,
								query
							);
						} catch (error) {
							await namespacedInstance.emit(
								"searchError",
								error.message
							);
							throw new MoleculerError(
								"Search failed",
								500,
								"SEARCH_FAILED",
								{ error }
							);
						} finally {
							// await ADCPPSocket.disconnect();
						}
					},
				},
				download: {
					// params: {
					// 	searchInstanceId: "string",
					// 	resultId: "string",
					// 	comicObjectId: "string",
					// 	name: "string",
					// 	size: "number",
					// 	type: "any", // Define more specific type if possible
					// 	config: "object",
					// },
					async handler(ctx) {
						console.log(ctx.params);
						const {
							searchInstanceId,
							resultId,
							config,
							comicObjectId,
							name,
							size,
							type,
						} = ctx.params;
						const ADCPPSocket = new AirDCPPSocket(config);
						try {
							await ADCPPSocket.connect();
							const downloadResult = await ADCPPSocket.post(
								`search/${searchInstanceId}/results/${resultId}/download`
							);

							if (downloadResult && downloadResult.bundle_info) {
								// Assume bundle_info is part of the response and contains the necessary details
								const bundleDBImportResult = await ctx.call(
									"library.applyAirDCPPDownloadMetadata",
									{
										bundleId: downloadResult.bundle_info.id,
										comicObjectId,
										name,
										size,
										type,
									}
								);

								this.logger.info(
									"Download and metadata update successful",
									bundleDBImportResult
								);
								this.broker.emit(
									"downloadCompleted",
									bundleDBImportResult
								);
								return bundleDBImportResult;
							} else {
								throw new Error(
									"Failed to download or missing download result information"
								);
							}
						} catch (error) {
							this.broker.emit("downloadError", error.message);
							throw new MoleculerError(
								"Download failed",
								500,
								"DOWNLOAD_FAILED",
								{ error }
							);
						} finally {
							// await ADCPPSocket.disconnect();
						}
					},
				},

				listenBundleTick: {
					async handler(ctx) {
						const { config } = ctx.params;
						const ADCPPSocket = new AirDCPPSocket(config);

						try {
							await ADCPPSocket.connect();
							console.log("Connected to AirDCPP successfully.");

							ADCPPSocket.addListener(
								"queue",
								"queue_bundle_tick",
								(tickData) => {
									console.log(
										"Received tick data: ",
										tickData
									);
									this.io.emit("bundleTickUpdate", tickData);
								},
								null
							); // Assuming no specific ID is needed here
						} catch (error) {
							console.error(
								"Error connecting to AirDCPP or setting listener:",
								error
							);
							throw error;
						}
					},
				},
			},
			methods: {
				sleep: (ms: number): Promise<NodeJS.Timeout> => {
					return new Promise((resolve) => setTimeout(resolve, ms));
				},
			},
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
