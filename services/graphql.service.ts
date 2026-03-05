/**
 * @fileoverview GraphQL service for schema stitching and query execution
 * @module services/graphql.service
 * @description Provides unified GraphQL API by stitching local canonical metadata schema
 * with remote metadata-graphql schema. Falls back to local-only if remote unavailable.
 */

import { Context } from "moleculer";
import { graphql, GraphQLSchema, buildClientSchema, getIntrospectionQuery, IntrospectionQuery, print } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { stitchSchemas } from "@graphql-tools/stitch";
import { fetch } from "undici";
import { typeDefs } from "../models/graphql/typedef";
import { resolvers } from "../models/graphql/resolvers";

/**
 * Fetch remote GraphQL schema via introspection with timeout handling
 * @param url - Remote GraphQL endpoint URL
 * @param timeout - Request timeout in milliseconds (default: 10000)
 * @returns Introspected GraphQL schema
 */
async function fetchRemoteSchema(url: string, timeout = 10000): Promise<GraphQLSchema> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: getIntrospectionQuery() }),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`Failed to introspect remote schema: HTTP ${response.status}`);
		}

		const result = await response.json() as { data?: IntrospectionQuery; errors?: any[] };
		
		if (result.errors?.length) throw new Error(`Introspection errors: ${JSON.stringify(result.errors)}`);
		if (!result.data) throw new Error("No data returned from introspection query");

		return buildClientSchema(result.data);
	} catch (error: any) {
		clearTimeout(timeoutId);
		if (error.name === 'AbortError') throw new Error(`Request timeout after ${timeout}ms`);
		throw error;
	}
}

/**
 * Create executor function for remote GraphQL endpoint
 * @param url - Remote GraphQL endpoint URL
 * @returns Executor function compatible with schema stitching
 */
function createRemoteExecutor(url: string) {
	return async ({ document, variables }: any) => {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: print(document), variables }),
		});

		if (!response.ok) throw new Error(`Remote GraphQL request failed: ${response.statusText}`);
		return response.json();
	};
}

/**
 * Auto-resolve metadata if user preferences allow
 * @param broker - Moleculer broker instance
 * @param logger - Logger instance
 * @param comicId - Comic ID to resolve metadata for
 * @param condition - Preference condition to check (onImport or onMetadataUpdate)
 */
async function autoResolveMetadata(broker: any, logger: any, comicId: string, condition: string) {
	try {
		const UserPreferences = require("../models/userpreferences.model").default;
		const preferences = await UserPreferences.findOne({ userId: "default" });

		if (preferences?.autoMerge?.enabled && preferences?.autoMerge?.[condition]) {
			logger.info(`Auto-resolving metadata for comic ${comicId}`);
			await broker.call("graphql.graphql", {
				query: `mutation ResolveMetadata($comicId: ID!) { resolveMetadata(comicId: $comicId) { id } }`,
				variables: { comicId },
			});
		}
	} catch (error) {
		logger.error("Error in auto-resolution:", error);
	}
}

/**
 * GraphQL Service
 * @description Moleculer service providing unified GraphQL API via schema stitching.
 * Stitches local canonical metadata schema with remote metadata-graphql schema.
 *
 * Actions:
 * - graphql.graphql - Execute GraphQL queries/mutations
 * - graphql.getSchema - Get schema type definitions
 *
 * Events:
 * - metadata.imported - Triggers auto-resolution if enabled
 * - comic.imported - Triggers auto-resolution on import if enabled
 */
export default {
	name: "graphql",
	
	settings: {
		/** Remote metadata GraphQL endpoint URL */
		metadataGraphqlUrl: process.env.METADATA_GRAPHQL_URL || "http://localhost:3080/metadata-graphql",
	},

	actions: {
		/**
		 * Execute GraphQL queries and mutations
		 * @param query - GraphQL query or mutation string
		 * @param variables - Variables for the GraphQL operation
		 * @param operationName - Name of the operation to execute
		 * @returns GraphQL execution result with data or errors
		 */
		graphql: {
			params: {
				query: { type: "string" },
				variables: { type: "object", optional: true },
				operationName: { type: "string", optional: true },
			},
			async handler(ctx: Context<{ query: string; variables?: any; operationName?: string }>) {
				try {
					return await graphql({
						schema: this.schema,
						source: ctx.params.query,
						variableValues: ctx.params.variables,
						operationName: ctx.params.operationName,
						contextValue: { broker: this.broker, ctx },
					});
				} catch (error: any) {
					this.logger.error("GraphQL execution error:", error);
					return {
						errors: [{
							message: error.message,
							extensions: { code: "INTERNAL_SERVER_ERROR" },
						}],
					};
				}
			},
		},

		/**
		 * Get GraphQL schema type definitions
		 * @returns Object containing schema type definitions as string
		 */
		getSchema: {
			async handler() {
				return { typeDefs: typeDefs.loc?.source.body || "" };
			},
		},
	},

	events: {
		/**
		 * Handle metadata imported event - triggers auto-resolution if enabled
		 */
		"metadata.imported": {
			async handler(ctx: any) {
				const { comicId, source } = ctx.params;
				this.logger.info(`Metadata imported for comic ${comicId} from ${source}`);
				await autoResolveMetadata(this.broker, this.logger, comicId, "onMetadataUpdate");
			},
		},

		/**
		 * Handle comic imported event - triggers auto-resolution if enabled
		 */
		"comic.imported": {
			async handler(ctx: any) {
				this.logger.info(`Comic imported: ${ctx.params.comicId}`);
				await autoResolveMetadata(this.broker, this.logger, ctx.params.comicId, "onImport");
			},
		},
	},

	/**
	 * Service started lifecycle hook
	 * Creates local schema and attempts to stitch with remote metadata schema.
	 * Falls back to local-only if remote unavailable.
	 */
	async started() {
		this.logger.info("GraphQL service starting...");
		
		const localSchema = makeExecutableSchema({ typeDefs, resolvers });

		try {
			this.logger.info(`Attempting to introspect remote schema at ${this.settings.metadataGraphqlUrl}`);
			
			const remoteSchema = await fetchRemoteSchema(this.settings.metadataGraphqlUrl);
			this.logger.info("Successfully introspected remote metadata schema");
			
			const remoteQueryType = remoteSchema.getQueryType();
			if (remoteQueryType) {
				this.logger.info(`Remote schema Query fields: ${Object.keys(remoteQueryType.getFields()).join(', ')}`);
			}
			
			this.schema = stitchSchemas({
				subschemas: [
					{ schema: localSchema },
					{ schema: remoteSchema, executor: createRemoteExecutor(this.settings.metadataGraphqlUrl) },
				],
				mergeTypes: true,
			});
			
			const stitchedQueryType = this.schema.getQueryType();
			if (stitchedQueryType) {
				this.logger.info(`Stitched schema Query fields: ${Object.keys(stitchedQueryType.getFields()).join(', ')}`);
			}
			
			this.logger.info("Successfully stitched local and remote schemas");
		} catch (remoteError: any) {
			this.logger.warn(`Could not connect to remote metadata GraphQL at ${this.settings.metadataGraphqlUrl}: ${remoteError.message}`);
			this.logger.warn("Continuing with local schema only");
			this.schema = localSchema;
		}
		
		this.logger.info("GraphQL service started successfully");
	},

	/** Service stopped lifecycle hook */
	stopped() {
		this.logger.info("GraphQL service stopped");
	},
};
