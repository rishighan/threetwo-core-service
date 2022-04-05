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
import { flatten, isEmpty, isUndefined, map } from "lodash";
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
									console.log(match.hits);
								});

								return body.responses;
							},
						},
						issue: {
							rest: "POST /searchIssue",
							params: {},
							handler: async (
								ctx: Context<{
									query: {
										volumeName: string;
										issueNumber: string;
									};
									pagination: {
										size: number;
										from: number;
									};
								}>
							) => {
								try {
									console.log(ctx.params);
									const { query, pagination } = ctx.params;
									let eSQuery = {};
									if (isEmpty(query)) {
										Object.assign(eSQuery, {
											match_all: {},
										});
									} else {
										Object.assign(eSQuery, {
											multi_match: {
												fields: [
													"rawFileDetails.name",
													"sourcedMetadata.comicvine.name",
													"sourcedMetadata.comicvine.volumeInformation.name",
												],
												query: query.volumeName,
											},
										});
									}
									console.log(query);
									const result = await eSClient.search(
										{
											index: "comics",
											body: {
												query: eSQuery,
											},
											...pagination,
										},
										{ hydrate: true }
									);

									return result;
								} catch (error) {
									return new Errors.MoleculerClientError("Failed to return data", 404, "ElasticSearch error", error);
								}
							},
						},
						deleteElasticSearchIndices: {
							rest: "GET /deleteElasticSearchIndices",
							params: {},
							handler: async (ctx: Context<{}>) => {
								return await eSClient.indices.delete({
									index: "comics",
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
