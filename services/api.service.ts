import chokidar from "chokidar";
import fs from "fs";
import { Service, ServiceBroker } from "moleculer";
import ApiGateway from "moleculer-web";
import path from "path";
import { IFolderData } from "threetwo-ui-typings";

export default class ApiService extends Service {
	public constructor(broker: ServiceBroker) {
		super(broker);
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
						use: [
							ApiGateway.serveStatic(path.resolve("./userdata")),
						],
					},
					{
						path: "/comics",
						use: [ApiGateway.serveStatic(path.resolve("./comics"))],
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

			},

			methods: {},
			started(): any {
				// 	Filewatcher
				const fileWatcher = chokidar.watch(
					path.resolve("/comics"),
					{
						ignored: (filePath) =>
							path.extname(filePath) === ".dctmp",
						persistent: true,
						usePolling: true,
						interval: 5000,
						ignoreInitial: true,
						followSymlinks: true,
						atomic: true,
						awaitWriteFinish: {
							stabilityThreshold: 2000,
							pollInterval: 100,
						},
					}
				);
				const fileCopyDelaySeconds = 3;
				const checkEnd = (path, prev) => {
					fs.stat(path, async (err, stat) => {
						// Replace error checking with something appropriate for your app.
						if (err) throw err;
						if (stat.mtime.getTime() === prev.mtime.getTime()) {
							console.log("finished");
							// Move on: call whatever needs to be called to process the file.
							console.log(
								"File detected, starting import..."
							);
							const walkedFolder: IFolderData =
								await broker.call("library.walkFolders", {
									basePathToWalk: path,
								});
							await this.broker.call(
								"importqueue.processImport",
								{
									fileObject: {
										filePath: path,
										fileSize: walkedFolder[0].fileSize,
									},
								}
							);
						} else
							setTimeout(
								checkEnd,
								fileCopyDelaySeconds,
								path,
								stat
							);
					});
				};

				fileWatcher
					.on("add", (path, stats) => {
						console.log("Watcher detected new files.");
						console.log(
							`File ${path} has been added with stats: ${JSON.stringify(
								stats,
								null,
								2
							)}`
						);

						console.log("File", path, "has been added");

						fs.stat(path, function(err, stat) {
							// Replace error checking with something appropriate for your app.
							if (err) throw err;
							setTimeout(
								checkEnd,
								fileCopyDelaySeconds,
								path,
								stat
							);
						});
					})
					// .once(
					// 	"change",

					// 	(path, stats) =>
					// 		console.log(
					// 			`File ${path} has been changed. Stats: ${JSON.stringify(
					// 				stats,
					// 				null,
					// 				2
					// 			)}`
					// 		)
					// )
					.on(
						"unlink",

						(path) =>
							console.log(`File ${path} has been removed`)
					)
					.on(
						"addDir",

						(path) =>
							console.log(`Directory ${path} has been added`)
					);

			},
		});
	}
}
