import { Service, ServiceBroker, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import chokidar from "chokidar";
import { logger } from "../utils/logger.utils";
import path from "path";
import fs from "fs";
import { IExtractionOptions, IFolderData } from "threetwo-ui-typings";
import IO from "socket.io";
export default class ApiService extends Service {
	public constructor(broker: ServiceBroker) {
		super(broker);
		// @ts-ignore
		this.parseServiceSchema({
			name: "api",
			mixins: [ApiGateway],
			// More info about settings: https://moleculer.services/docs/0.14/moleculer-web.html
			settings: {
				port: process.env.PORT || 3000,
				routes: [
					{
						path: "/api",
						whitelist: ["**"],
						cors: {
							origin: "*",
							methods: [
								"GET",
								"OPTIONS",
								"POST",
								"PUT",
								"DELETE",
							],
							allowedHeaders: ["*"],
							exposedHeaders: [],
							credentials: false,
							maxAge: 3600,
						},
						use: [],
						mergeParams: true,
						authentication: false,
						authorization: false,
						autoAliases: true,
						aliases: {},
						callingOptions: {},

						bodyParsers: {
							json: {
								strict: false,
								limit: "1MB",
							},
							urlencoded: {
								extended: true,
								limit: "1MB",
							},
						},
						mappingPolicy: "all", // Available values: "all", "restrict"
						logging: true,
					},
					{
						path: "/userdata",
						use: [ApiGateway.serveStatic("userdata")],
					},
					{
						path: "/comics",
						use: [ApiGateway.serveStatic("comics")],
					},
					{
						path: "/logs",
						use: [ApiGateway.serveStatic("logs")],
					},
				],
				log4XXResponses: false,
				logRequestParams: null,
				logResponseData: null,
				assets: {
					folder: "public",
					// Options to `server-static` module
					options: {},
				},
			},
			events: {
				"**"(payload, sender, event) {
					if (this.io)
						this.io.emit("event", {
							sender,
							event,
							payload,
						});
				},
			},

			methods: {},
			started(): any {
				// Socket gateway-ish
				// Create a Socket.IO instance, passing it our server
				this.io = new IO.Server(3001);

				// Add a connect listener
				this.io.on("connection", (client) => {
					this.logger.info("Client connected via websocket!");

					client.on("action", (action, done) => {
						switch (action.type) {
							case "LS_IMPORT":
								this.broker
									.call(
										"libraryqueue.enqueue",
										action.data,
										{}
									)
									.then((res) => {
										if (done) {
											done(res);
										}
									})
									.catch((err) => this.logger.error(err));
								break;
						}
					});
					// Add a disconnect listener
					client.on("disconnect", () => {
						this.logger.info("Client disconnected");
					});
				});

				// Filewatcher
				const fileWatcher = chokidar.watch(path.resolve("./comics"), {
					ignored: /(^|[\/\\])\../, // ignore dotfiles
					persistent: true,
					ignoreInitial: true,
					atomic: true,
					awaitWriteFinish: {
						stabilityThreshold: 2000,
						pollInterval: 100,
					},
				});
				const fileCopyDelaySeconds = 10;
				const checkFileCopyComplete = (path, previousPath) => {
					fs.stat(path, async (err, stat) => {
						if (err) {
							throw err;
						}
						if (
							stat.mtime.getTime() ===
							previousPath.mtime.getTime()
						) {
							logger.info(
								"File copy complete, starting import..."
							);
							const walkedFolders: IFolderData =
								await broker.call("import.walkFolders", {
									basePathToWalk: path,
								});
							const extractionOptions: IExtractionOptions = {
								extractTarget: "cover",
								targetExtractionFolder: "./userdata/covers",
								extractionMode: "single",
							};
							await this.broker.call(
								"import.processAndImportToDB",
								{ walkedFolders, extractionOptions }
							);
						} else {
							setTimeout(
								checkFileCopyComplete,
								fileCopyDelaySeconds * 1000,
								path,
								stat
							);
						}
					});
				};
				fileWatcher
					.on("add", async (path, stats) => {
						logger.info("Watcher detected new files.");
						logger.info(
							`File ${path} has been added with stats: ${JSON.stringify(
								stats
							)}`
						);

						logger.info("File copy started...");
						fs.stat(path, function (err, stat) {
							if (err) {
								logger.error(
									"Error watching file for copy completion. ERR: " +
										err.message
								);
								logger.error(
									"Error file not processed. PATH: " + path
								);
								throw err;
							}
							setTimeout(
								checkFileCopyComplete,
								fileCopyDelaySeconds * 1000,
								path,
								stat
							);
						});
					})
					.on("change", (path, stats) =>
						logger.info(
							`File ${path} has been changed. Stats: ${stats}`
						)
					)
					.on("unlink", (path) =>
						logger.info(`File ${path} has been removed`)
					)
					.on("addDir", (path) =>
						logger.info(`Directory ${path} has been added`)
					);
			},
		});
	}
}
