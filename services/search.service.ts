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
import { filter, isEmpty, isNull } from "lodash";

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
								ctx: Context<{
									queryObject: {
										issueName: string;
										volumeName: string;
										issueNumber: string;
									};
								}>
							) {
								let elasticSearchQuery = {};
								console.log(
									"Volume: ",
									ctx.params.queryObject.volumeName
								);
								console.log(
									"Issue: ",
									ctx.params.queryObject.issueName
								);
								if (
									isNull(ctx.params.queryObject.volumeName)
								) {
									elasticSearchQuery = {
										match: {
											"rawFileDetails.name": {
												query: ctx.params.queryObject
													.issueName,
												operator: "and",
												fuzziness: "AUTO",
											},
										},
									};
								} else if (
									isNull(ctx.params.queryObject.issueName)
								) {
									elasticSearchQuery = {
										match: {
											"rawFileDetails.name": {
												query: ctx.params.queryObject
													.volumeName,
												operator: "and",
												fuzziness: "AUTO",
											},
										},
									};
								} else {
									elasticSearchQuery = {
										bool: {
											should: [
												{
													match_phrase: {
														"rawFileDetails.name":
															ctx.params
																.queryObject
																.issueName,
													},
												},
												{
													match_phrase: {
														"rawFileDetails.name":
															ctx.params
																.queryObject
																.volumeName,
													},
												},
											],
										},
									};
								}
								console.log(elasticSearchQuery);
								return Comic.esSearch({
									query: elasticSearchQuery,
								}).then(function (results) {
									// results here
									const foo = results.body.hits.hits.map(
										(hit) => {
											const parsedFilename = refineQuery(
												hit._source.rawFileDetails.name
											);
											if (
												parsedFilename.searchParams
													.searchTerms.number ===
												parseInt(
													ctx.params.queryObject
														.issueNumber,
													10
												)
											) {
												return hit;
											}
										}
									);
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
