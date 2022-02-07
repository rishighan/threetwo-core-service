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
import { refineQuery } from "filename-parser";
import { each, filter, flatten, isEmpty, isNull } from "lodash";
import { eSClient } from "../models/comic.model";
import arrayToNDJSON from "array-to-ndjson";
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
									queryObjects: [],
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
								})

								return body.responses;

								// return Comic.esSearch({
								// 	query: elasticSearchQuery,
								// }).then(function (results) {
								// 	// results here
								// 	const foo = results.body.hits.hits.map(
								// 		(hit) => {
								// 			const parsedFilename = refineQuery(
								// 				hit._source.rawFileDetails.name
								// 			);
								// 			if (
								// 				parsedFilename.searchParams
								// 					.searchTerms.number ===
								// 				parseInt(
								// 					ctx.params.queryObject
								// 						.issueNumber,
								// 					10
								// 				)
								// 			) {
								// 				return hit;
								// 			}
								// 		}
								// 	);
								// 	return filter(foo, null);
								// });
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
