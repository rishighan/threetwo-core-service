"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Settings from "../models/settings.model";
import { isEmpty, pickBy, identity, map, isNil } from "lodash";
import fs from "fs";
import path from "path";
import { COMICS_DIRECTORY, USERDATA_DIRECTORY } from "../constants/directories";
const ObjectId = require("mongoose").Types.ObjectId;

export default class SettingsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "settings" }
	) {
		super(broker);
		this.parseServiceSchema({
			name: "settings",
			mixins: [DbMixin("settings", Settings)],
			settings: {},
			hooks: {},
			actions: {
				getEnvironmentVariables: {
						rest: "GET /getEnvironmentVariables",
						params: {},
						handler: async (ctx: Context<{}>) => {
							return {
								comicsDirectory: process.env.COMICS_DIRECTORY,
								userdataDirectory: process.env.USERDATA_DIRECTORY,
								redisURI: process.env.REDIS_URI,
								elasticsearchURI: process.env.ELASTICSEARCH_URI,
								mongoURI: process.env.MONGO_URI,
								kafkaBroker: process.env.KAFKA_BROKER,
								unrarBinPath: process.env.UNRAR_BIN_PATH,
								sevenzBinPath: process.env.SEVENZ_BINARY_PATH,
								comicvineAPIKey: process.env.COMICVINE_API_KEY,
							}
						}
					},
					getDirectoryStatus: {
						rest: "GET /getDirectoryStatus",
						params: {},
						handler: async (ctx: Context<{}>) => {
							const comicsDirectoryEnvSet = !!process.env.COMICS_DIRECTORY;
							const userdataDirectoryEnvSet = !!process.env.USERDATA_DIRECTORY;
							
							const resolvedComicsDirectory = path.resolve(COMICS_DIRECTORY);
							const resolvedUserdataDirectory = path.resolve(USERDATA_DIRECTORY);
							
							let comicsDirectoryExists = false;
							let userdataDirectoryExists = false;
							
							try {
								await fs.promises.access(resolvedComicsDirectory, fs.constants.F_OK);
								comicsDirectoryExists = true;
							} catch {
								comicsDirectoryExists = false;
							}
							
							try {
								await fs.promises.access(resolvedUserdataDirectory, fs.constants.F_OK);
								userdataDirectoryExists = true;
							} catch {
								userdataDirectoryExists = false;
							}
							
							const issues: string[] = [];
							
							if (!comicsDirectoryEnvSet) {
								issues.push("COMICS_DIRECTORY environment variable is not set");
							}
							if (!userdataDirectoryEnvSet) {
								issues.push("USERDATA_DIRECTORY environment variable is not set");
							}
							if (!comicsDirectoryExists) {
								issues.push(`Comics directory does not exist: ${resolvedComicsDirectory}`);
							}
							if (!userdataDirectoryExists) {
								issues.push(`Userdata directory does not exist: ${resolvedUserdataDirectory}`);
							}
							
							return {
								comicsDirectory: {
									path: resolvedComicsDirectory,
									envSet: comicsDirectoryEnvSet,
									exists: comicsDirectoryExists,
									isValid: comicsDirectoryEnvSet && comicsDirectoryExists,
								},
								userdataDirectory: {
									path: resolvedUserdataDirectory,
									envSet: userdataDirectoryEnvSet,
									exists: userdataDirectoryExists,
									isValid: userdataDirectoryEnvSet && userdataDirectoryExists,
								},
								isValid: comicsDirectoryEnvSet && userdataDirectoryEnvSet && comicsDirectoryExists && userdataDirectoryExists,
								issues,
							};
						}
					},
				getSettings: {
					rest: "GET /getAllSettings",
					params: {},
					async handler(ctx: Context<{ settingsKey: string }>) {
						const { settingsKey } = ctx.params;

						// Initialize a projection object. Include everything by default.
						let projection = settingsKey
							? { _id: 0, [settingsKey]: 1 }
							: {};

						// Find the settings with the dynamic projection
						const settings = await Settings.find({}, projection);

						if (settings.length === 0) {
							return {};
						}

						// If settingsKey is provided, return the specific part of the settings.
						// Otherwise, return the entire settings document.
						if (settingsKey) {
							// Check if the specific key exists in the settings document.
							// Since `settings` is an array, we access the first element.
							// Then, we use the settingsKey to return only that part of the document.
							return settings[0][settingsKey] || {};
						} else {
							// Return the entire settings document
							return settings[0];
						}
					},
				},

				saveSettings: {
					rest: "POST /saveSettings",
					params: {},
					async handler(
						ctx: Context<{
							settingsPayload?: {
								protocol: string;
								hostname: string;
								port: string;
								username: string;
								password: string;
								_id?: string;
								airDCPPUserSettings?: object;
								hubs?: [];
							};
							settingsObjectId?: string;
							settingsKey: string;
						}>
					) {
						try {
							console.log(ctx.params);
							let query = {};
							const { settingsKey, settingsObjectId } =
								ctx.params;
							const {
								hostname,
								protocol,
								port,
								username,
								password,
							} = ctx.params.settingsPayload;
							const host = {
								hostname,
								protocol,
								port,
								username,
								password,
							};
							const undefinedPropsInHostname = Object.values(
								host
							).filter((value) => value === undefined);

							// Update, depending what key was passed in params
							// 1. Construct the update query
							switch (settingsKey) {
								case "bittorrent":
									console.log(
										`Recieved settings for ${settingsKey}, building query...`
									);
									query = {
										...(undefinedPropsInHostname.length ===
											0 && {
											$set: {
												"bittorrent.client.host": host,
											},
										}),
									};
									break;
								case "directConnect":
									console.log(
										`Recieved settings for ${settingsKey}, building query...`
									);
									const { hubs, airDCPPUserSettings } =
										ctx.params.settingsPayload;
									query = {
										...(undefinedPropsInHostname.length ===
											0 && {
											$set: {
												"directConnect.client.host":
													host,
											},
										}),
										...(!isNil(hubs) && {
											$set: {
												"directConnect.client.hubs":
													hubs,
											},
										}),
									};
									console.log(JSON.stringify(query, null, 4));
									break;

								default:
									return false;
							}

							// 2. Set up options, filters
							const options = {
								upsert: true,
								setDefaultsOnInsert: true,
								returnDocument: "after",
							};
							const filter = settingsObjectId
								? { _id: settingsObjectId }
								: {};

							// 3. Execute the mongo query
							const result = await Settings.findOneAndUpdate(
								filter,
								query,
								options
							);
							return result;
						} catch (err) {
							return err;
						}
					},
				},
				deleteSettings: {
					rest: "POST /deleteSettings",
					params: {},
					async handler(ctx: Context<{}>) {
						return await Settings.remove({}, (result) => result);
					},
				},
			},
			methods: {},
		});
	}
}
