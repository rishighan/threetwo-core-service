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
				getSettings: {
					rest: "GET /getAllSettings",
					params: {},
					async handler(ctx: Context<{ settingsKey: string }>) {
						const settings = await Settings.find({});
						if (isEmpty(settings)) {
							return {};
						}
						console.log(settings[0]);
						return settings[0];
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
