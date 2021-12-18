"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";

const { Client } = require("@elastic/elasticsearch");
const client = new Client({
	node: "http://ghost:9200",
	auth: {
		username: "elastic",
		password: "password",
	},
});

import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";

console.log(client);

export default class SettingsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "search" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "search",
					mixins: [client, DbMixin("comics", Comic)],
					hooks: {},
					actions: {
						searchComic: {
							rest: "POST /searchComic",
							params: {},
							async handler(ctx: Context<{}>) {
							Comic.esSearch({
									query_string: {
										query: "batman",
									},
								}).then(function (results) {
									// results here
									console.log(results.body.hits.hits);
									results.body.hits.hits.forEach((item) => console.log(item._source))
								});
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
