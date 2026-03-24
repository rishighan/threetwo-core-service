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
		/** Remote acquisition GraphQL endpoint URL */
		acquisitionGraphqlUrl: process.env.ACQUISITION_GRAPHQL_URL || "http://localhost:3060/acquisition-graphql",
		/** Retry interval in ms for re-stitching remote schemas (0 = disabled) */
		schemaRetryInterval: 5000,
	},

	actions: {
		/**
		 * Check remote schema health and availability
		 * @returns Status of remote schema connection with appropriate HTTP status
		 */
		checkRemoteSchema: {
			async handler(ctx: Context<any>) {
				const status: any = {
					remoteSchemaAvailable: this.remoteSchemaAvailable || false,
					remoteUrl: this.settings.metadataGraphqlUrl,
					localSchemaOnly: !this.remoteSchemaAvailable,
				};

				if (this.remoteSchemaAvailable && this.schema) {
					const queryType = this.schema.getQueryType();
					if (queryType) {
						const fields = Object.keys(queryType.getFields());
						status.availableQueryFields = fields;
						status.hasWeeklyPullList = fields.includes('getWeeklyPullList');
					}
				}

				// Set HTTP status code based on schema stitching status
				// 200 = Schema stitching complete (remote available)
				// 503 = Service degraded (local only, remote unavailable)
				(ctx.meta as any).$statusCode = this.remoteSchemaAvailable ? 200 : 503;

				return status;
			},
		},

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

	methods: {
	/**
	 * Attempt to build/rebuild the stitched schema.
	 * Returns true if at least one remote schema was stitched.
	 */
	async _buildSchema(localSchema: any): Promise<boolean> {
		const subschemas: any[] = [{ schema: localSchema }];

		// Stitch metadata schema
		try {
			this.logger.info(`Attempting to introspect remote schema at ${this.settings.metadataGraphqlUrl}`);
			const metadataSchema = await fetchRemoteSchema(this.settings.metadataGraphqlUrl);
			subschemas.push({ schema: metadataSchema, executor: createRemoteExecutor(this.settings.metadataGraphqlUrl) });
			this.logger.info("✓ Successfully introspected remote metadata schema");
		} catch (error: any) {
			this.logger.warn(`⚠ Metadata schema unavailable: ${error.message}`);
		}

		// Stitch acquisition schema
		try {
			this.logger.info(`Attempting to introspect remote schema at ${this.settings.acquisitionGraphqlUrl}`);
			const acquisitionSchema = await fetchRemoteSchema(this.settings.acquisitionGraphqlUrl);
			subschemas.push({ schema: acquisitionSchema, executor: createRemoteExecutor(this.settings.acquisitionGraphqlUrl) });
			this.logger.info("✓ Successfully introspected remote acquisition schema");
		} catch (error: any) {
			this.logger.warn(`⚠ Acquisition schema unavailable: ${error.message}`);
		}

		if (subschemas.length > 1) {
			this.schema = stitchSchemas({ subschemas, mergeTypes: true });
			this.logger.info(`✓ Stitched ${subschemas.length} schemas`);
			this.remoteSchemaAvailable = true;
			return true;
		} else {
			this.schema = localSchema;
			this.remoteSchemaAvailable = false;
			return false;
		}
	},
	},

	/**
	 * Service started lifecycle hook
	 * Blocks until remote schemas are stitched, retrying every schemaRetryInterval ms.
	 */
	async started() {
		this.logger.info("GraphQL service starting...");

		this._localSchema = makeExecutableSchema({ typeDefs, resolvers });
		this.schema = this._localSchema;
		this.remoteSchemaAvailable = false;

		while (true) {
			const stitched = await this._buildSchema(this._localSchema);
			if (stitched) break;
			this.logger.warn(`⚠ Remote schemas unavailable — retrying in ${this.settings.schemaRetryInterval}ms`);
			await new Promise(resolve => setTimeout(resolve, this.settings.schemaRetryInterval));
		}

		this.logger.info("GraphQL service started successfully");
	},

	/** Service stopped lifecycle hook */
	stopped() {
		this.logger.info("GraphQL service stopped");
	},
};
