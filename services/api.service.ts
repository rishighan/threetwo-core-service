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
							// Access to any actions in all services under "/api" URL
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
						autoAliases: true,

						aliases: {},

						// Calling options. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Calling-options
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

						// Mapping policy setting. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Mapping-policy
						mappingPolicy: "all", // Available values: "all", "restrict"

						// Enable/disable logging
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
				// Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
				log4XXResponses: false,
				// Logging the request parameters. Set to any log level to enable it. E.g. "info"
				logRequestParams: null,
				// Logging the response data. Set to any log level to enable it. E.g. "info"
				logResponseData: null,
				assets: {
					folder: "public",
					// Options to `server-static` module
					options: {},
				},
			},

			methods: {},
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
			started(): any {
				// Create a Socket.IO instance, passing it our server
				this.io = IO.listen(this.server);

				// Add a connect listener
				this.io.on("connection", (client) => {
					this.logger.info("Client connected via websocket!");

					client.on(
						"importComicsInDB",
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
