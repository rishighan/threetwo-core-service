import { Service, ServiceBroker, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { IExtractionOptions, IFolderData } from "threetwo-ui-typings";
import { SocketIOMixin } from "../mixins/socket.io.mixin";
export const io = SocketIOMixin();
export default class ApiService extends Service {
	public constructor(broker: ServiceBroker) {
		super(broker);
		// @ts-ignore
		this.parseServiceSchema({
			name: "api",
			mixins: [ApiGateway, SocketIOMixin],
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
				logRequestParams: true,
				logResponseData: true,
				assets: {
					folder: "public",
					// Options to `server-static` module
					options: {},
				},
			},
			events: {
				"**"(payload, sender, event) {
					if (io)
						io.emit("event", {
							sender,
							event,
							payload,
						});
				},
			},

			methods: {},
			started(): any {
				// Add a connect listener
				io.on("connection", (client) => {
					console.log("Client connected via websocket!");

					client.on("action", async (action) => {
						switch (action.type) {
							case "LS_IMPORT":
								// 1. Send task to queue
								console.log(`Recieved ${action.type} event.`)
								await this.broker.call(
									"import.newImport",
									action.data,
									{}
								);
								break;
						}
					});
					// Add a disconnect listener
					client.on("disconnect", () => {
						console.log("Client disconnected");
					});

					// Filewatcher
					const fileWatcher = chokidar.watch(
						path.resolve("./comics"),
						{
							ignored: /(^|[\/\\])\../, // ignore dotfiles
							persistent: true,
							usePolling: true,
							ignoreInitial: true,
							atomic: true,
							depth: 1,
							awaitWriteFinish: {
								stabilityThreshold: 2000,
								pollInterval: 100,
							},
						}
					);
					const fileCopyDelaySeconds = 30;
					const checkFileCopyComplete = (path, previousPath) => {
						fs.stat(path, async (err, stat) => {
							if (err) {
								throw err;
							}
							if (
								stat.mtime.getTime() ===
								previousPath.mtime.getTime()
							) {
								console.log(
									"File detected, starting import..."
								);
								const walkedFolder: IFolderData =
									await broker.call("import.walkFolders", {
										basePathToWalk: path,
									});
								await this.broker.call("libraryqueue.enqueue", {
									fileObject: {
										filePath: walkedFolder[0].filePath,
										fileSize: walkedFolder[0].fileSize,
									},
								});
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
							console.log("Watcher detected new files.");
							console.log(
								`File ${path} has been added with stats: ${JSON.stringify(
									stats
								)}`
							);

							console.log("File copy started...");
							fs.stat(path, function (err, stat) {
								if (err) {
									console.log(
										"Error watching file for copy completion. ERR: " +
											err.message
									);
									console.log(
										"Error file not processed. PATH: " +
											path
									);
									throw err;
								}
								setTimeout(
									checkFileCopyComplete,
									fileCopyDelaySeconds * 1000,
									path,
									stat
								);
								client.emit("action", {
									type: "LS_COMIC_ADDED",
									result: path,
								});
							});
						})
						.on("change", (path, stats) =>
							console.log(
								`File ${path} has been changed. Stats: ${stats}`
							)
						)
						.on("unlink", (path) =>
							console.log(`File ${path} has been removed`)
						)
						.on("addDir", (path) =>
							console.log(`Directory ${path} has been added`)
						);
				});
			},
		});
	}
}
