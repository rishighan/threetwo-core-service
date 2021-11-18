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
import { isEmpty } from "lodash";

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
									settingsObject: {
										hostname: string;
										protocol: string;
										username: string;
										password: string;
									};
									airdcppUserSettings: object;
								}>
							) {
								console.log(ctx.params);
								const { settingsObject, airdcppUserSettings } =
									ctx.params;

								const result = await Settings.create({
									directConnect: {
										client: {
											...settingsObject,
											airdcppUserSettings,
										},
									},
								});
								console.log("ASDASD", result);
								return result;
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
