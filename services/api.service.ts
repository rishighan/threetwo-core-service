import { Service, ServiceBroker, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import chokidar from "chokidar";
import { logger } from "../utils/logger.utils";
import path from "path";
import { IExtractionOptions, IFolderData } from "threetwo-ui-typings";
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
			events: {},

			methods: {},
			started(): any {
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
				fileWatcher
					.on("add", async (path, stats) => {
						logger.info(
							`File ${path} has been added with stats: ${JSON.stringify(
								stats
							)}`
						);
						const walkedFolders:IFolderData = await broker.call("import.walkFolders", {basePathToWalk: path});
						const extractionOptions: IExtractionOptions = {
							extractTarget: "cover",
							targetExtractionFolder: "./userdata/covers",
							extractionMode: "single",
						  };
						this.broker.call("import.processAndImportToDB", {walkedFolders, extractionOptions });
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
