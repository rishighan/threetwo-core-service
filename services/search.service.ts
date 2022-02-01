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
	node: "http://tower.local:9200",
	auth: {
		username: "elastic",
		password: "password",
	},
});

import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { refineQuery } from "filename-parser";
import { filter } from "lodash";

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
							timeout: 400000,
							async handler(
								ctx: Context<{ queryObject: {
									issueName: string,
									issueNumber: string,
								} }>
							) {
								console.log(ctx.params);
								return Comic.esSearch({
									query: {
										match: {
											"rawFileDetails.name": {
												query: ctx.params.queryObject.issueName,
												operator: "or",
												fuzziness: "AUTO",
											},
										},
										
									},
								}).then(function (results) {
									// results here
									const foo = results.body.hits.hits.map((hit) => {
										const parsedFilename = refineQuery(hit._source.rawFileDetails.name);
										if(parsedFilename.searchParams.searchTerms.number === parseInt(ctx.params.queryObject.issueNumber, 10)) {
											return hit;
										} 
									});
									return filter(foo, null);
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
