import { Service, ServiceBroker, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import { extractCoverFromFile } from "../utils/uncompression.utils";
import { map } from "lodash";
const IO = require("socket.io")();

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
						whitelist: [
							"**",
						],
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
				// Create a Socket.IO instance, passing it our server
				this.io = IO.listen(this.server);

				// Add a connect listener
				this.io.on("connection", (client) => {
					this.logger.info("Client connected via websocket!");

					client.on(
						"importComicsToDB",
						async ({ action, params, opts }, done) => {
							this.logger.info(
								"Received request from client! Action:",
								action,
								", Params:",
								params
							);

							const { extractionOptions, walkedFolders } = params;
							map(walkedFolders, async (folder, idx) => {
								let comicBookCoverMetadata =
									await extractCoverFromFile(
										extractionOptions,
										folder
									);
								const dbImportResult = await this.broker.call(
									"import.rawImportToDB",
									{
										importStatus: {
											isImported: true,
											tagged: false,
											matchedResult: {
												score: "0",
											},
										},
										rawFileDetails: comicBookCoverMetadata,
										sourcedMetadata: {
											comicvine: {},
										},
									},
									{}
								);

								client.emit("comicBookCoverMetadata", {
									comicBookCoverMetadata,
									dbImportResult,
								});
							});
						}
					);

					client.on("disconnect", () => {
						this.logger.info("Client disconnected");
					});
				});
			},
		});
	}
}
