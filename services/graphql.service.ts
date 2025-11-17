// services/graphql.service.ts
import { gql as ApolloMixin } from "@ltv/moleculer-apollo-server-mixin";
import { print } from "graphql";
import { typeDefs } from "../models/graphql/typedef";
import { ServiceSchema } from "moleculer";

/**
 * Interface representing the structure of an ElasticSearch result.
 */
interface SearchResult {
	hits: {
		total: { value: number };
		hits: any[];
	};
}

/**
 * GraphQL Moleculer Service exposing typed resolvers via @ltv/moleculer-apollo-server-mixin.
 * Includes resolver for fetching comics marked as "wanted".
 */
const GraphQLService: ServiceSchema = {
	name: "graphql",
	mixins: [ApolloMixin],

	actions: {
		/**
		 * Resolver for fetching comics marked as "wanted" in ElasticSearch.
		 *
		 * Queries the `search.issue` Moleculer action using a filtered ES query
		 * that matches issues or volumes with a `wanted` flag.
		 *
		 * @param {number} [limit=25] - Maximum number of results to return.
		 * @param {number} [offset=0] - Starting index for paginated results.
		 * @returns {Promise<{ total: number, comics: any[] }>} - Total number of matches and result set.
		 *
		 * @example
		 * query {
		 *   wantedComics(limit: 10, offset: 0) {
		 *     total
		 *     comics {
		 *       _id
		 *       _source {
		 *         title
		 *       }
		 *     }
		 *   }
		 * }
		 */
		wantedComics: {
			params: {
				limit: {
					type: "number",
					integer: true,
					min: 1,
					optional: true,
				},
				offset: {
					type: "number",
					integer: true,
					min: 0,
					optional: true,
				},
			},
			async handler(ctx) {
				const { limit = 25, offset = 0 } = ctx.params;

				const eSQuery = {
					bool: {
						should: [
							{ exists: { field: "wanted.issues" } },
							{ exists: { field: "wanted.volume" } },
						],
						minimum_should_match: 1,
					},
				};

				const result = (await ctx.broker.call("search.issue", {
					query: eSQuery,
					pagination: { size: limit, from: offset },
					type: "wanted",
					trigger: "wantedComicsGraphQL",
				})) as SearchResult;

				return {
					data: {
						wantedComics: {
							total: result?.hits?.total?.value || 0,
							comics:
								result?.hits?.hits.map((hit) => hit._source) ||
								[],
						},
					},
				};
			},
		},
	},

	settings: {
		apolloServer: {
			typeDefs: print(typeDefs), // If typeDefs is AST; remove print if it's raw SDL string
			resolvers: {
				Query: {
					wantedComics: "graphql.wantedComics",
				},
			},
			path: "/graphql",
			playground: true,
			introspection: true,
			context: ({ ctx }: any) => ({
				broker: ctx.broker,
			}),
		},
	},
};

export default GraphQLService;
