import { IncomingMessage } from "http";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, Context } from "moleculer";
import ApiGateway from "moleculer-web";
import { getCovers, extractArchive } from "../utils/uncompression.utils";
import { map } from "lodash";
import JSONStream from "JSONStream";
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

				routes: [{
					path: "/api",
					whitelist: [
						// Access to any actions in all services under "/api" URL
						"**",
					],
					use: [],
					mergeParams: true,
					autoAliases: true,

					aliases: {},
					/**
					 * Before call hook. You can check the request.
					 * @param {Context} ctx
					 * @param {Object} route
					 * @param {IncomingMessage} req
					 * @param {ServerResponse} res
					 * @param {Object} data
					onBeforeCall(ctx: Context<any,{userAgent: string}>,
					 route: object, req: IncomingMessage, res: ServerResponse) {
					  Set request headers to context meta
					  ctx.meta.userAgent = req.headers["user-agent"];
					},
					 */

					/**
					 * After call hook. You can modify the data.
					 * @param {Context} ctx
					 * @param {Object} route
					 * @param {IncomingMessage} req
					 * @param {ServerResponse} res
					 * @param {Object} data
					 *
					 onAfterCall(ctx: Context, route: object, req: IncomingMessage, res: ServerResponse, data: object) {
					// Async function which return with Promise
					return doSomething(ctx, res, data);
				},
					 */

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
				}],
				// Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
				log4XXResponses: false,
				// Logging the request parameters. Set to any log level to enable it. E.g. "info"
				logRequestParams: null,
				// Logging the response data. Set to any log level to enable it. E.g. "info"
				logResponseData: null,
				// Serve assets from "public" folder
				assets: {
					folder: "public",
					// Options to `server-static` module
					options: {},
				},
			},

			methods: {


			},
			events: {
			"**"(payload, sender, event) {
				if (this.io)
					this.io.emit("event", {
						sender,
						event,
						payload
					});
			}
			},



		});
	}
}
