"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";

import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { flatten } from "lodash";
import { eSClient } from "../models/comic.model";
const s = eSClient.helpers.msearch();

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
					mixins: [DbMixin("comics", Comic)],
					hooks: {},
					actions: {
						searchComic: {
							rest: "POST /searchComic",
							params: {},
							timeout: 400000,
							async handler(
								ctx: Context<{
									queryObjects: [];
									elasticSearchQueries: [
										{
											elasticSearchQuery: object;
										}
									];
								}>
							) {
								const flattenedQueryArray = flatten(
									ctx.params.elasticSearchQueries
								);
								let queries = flattenedQueryArray
									.map((item) => JSON.stringify(item))
									.join("\n");
								queries += "\n";
								const { body } = await eSClient.msearch({
									body: queries,
								});

								body.responses.forEach((match) => {
									console.log(match.hits.hits);
								});

								return body.responses;
							},
						},
						issue: {
							rest: "POST /searchIssue",
							params: {},
							handler: async (
								ctx: Context<{
									queryObject: {
										volumeName: string;
										issueNumber: string;
									};
								}>
							) => {
								console.log(ctx.params);
								const result = await eSClient.search({
									index: "comics",
									body: {
										query: {
											match: {
												"rawFileDetails.name":
													ctx.params.queryObject
														.volumeName,
											},
										},
									},
								});
								const { hits } = result.body;
								return hits;
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
