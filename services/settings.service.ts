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
					settings: {
						
					},
					hooks: {},
					actions: {
                        getSettings: {
                            rest: "GET /getAllSettings",
                            params: {},
                            async handler(ctx: Context<{}>) {

                            }
                        },

                        saveSettings: {
                            rest: "POST /saveSettings",
                            params: {},
                            async handler(ctx: Context<{}>) {

                            }
                        }
						
					},
					methods: {},
				},
				schema
			)
		);
	}
}
