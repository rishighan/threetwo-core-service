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
import { isEmpty, pickBy, identity, map } from "lodash";
const ObjectId = require("mongoose").Types.ObjectId;

export default class SettingsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "settings" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "settings",
					mixins: [DbMixin("settings", Settings)],
					settings: {},
					hooks: {},
					actions: {
						getSettings: {
							rest: "GET /getAllSettings",
							params: {},
							async handler(
								ctx: Context<{ settingsKey: string }>
							) {
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
									settingsPayload: {
										host: object;
										airDCPPUserSettings: object;
										hubs: [];
									};
									settingsObjectId: string;
								}>
							) {
								console.log("varan bhat", ctx.params);
								const { host, airDCPPUserSettings, hubs } =
									ctx.params.settingsPayload;
								let query = {
									host,
									airDCPPUserSettings,
									hubs,
								};
								const keysToUpdate = pickBy(query, identity);
								let updateQuery = {};

								map(Object.keys(keysToUpdate), (key) => {
									updateQuery[`directConnect.client.${key}`] =
										query[key];
								});
								const options = {
									upsert: true,
									new: true,
									setDefaultsOnInsert: true,
								};
								const filter = {
									_id: new ObjectId(
										ctx.params.settingsObjectId
									),
								};
								const result = Settings.findOneAndUpdate(
									filter,
									{ $set: updateQuery },
									options
								);

								return result;
							},
						},
						deleteSettings: {
							rest: "POST /deleteSettings",
							params: {},
							async handler(ctx: Context<{}>) {
								return await Settings.remove(
									{},
									(result) => result
								);
							},
						},
					},
					methods: {},
				},
				schema
			)
		);
	}
}
