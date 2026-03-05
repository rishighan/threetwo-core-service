/**
 * @fileoverview GraphQL service for schema stitching and query execution
 * @module services/graphql.service
 * @description Provides a unified GraphQL API by stitching together local canonical metadata
 * schema with remote metadata-graphql schema. Handles GraphQL query execution, schema
 * introspection, and automatic metadata resolution events. Exposes a GraphQL endpoint
 * via moleculer-web at /graphql.
 *
 * The service attempts to connect to a remote metadata GraphQL service and stitch its
 * schema with the local schema. If the remote service is unavailable, it falls back to
 * serving only the local schema.
 *
 * @see {@link module:models/graphql/typedef} for local schema definitions
 * @see {@link module:models/graphql/resolvers} for local resolver implementations
 */

import { ServiceBroker, Context } from "moleculer";
import { graphql, GraphQLSchema, parse, validate, execute } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { stitchSchemas } from "@graphql-tools/stitch";
import { wrapSchema } from "@graphql-tools/wrap";
import { print, getIntrospectionQuery, buildClientSchema, IntrospectionQuery } from "graphql";
import { fetch } from "undici";
import { typeDefs } from "../models/graphql/typedef";
import { resolvers } from "../models/graphql/resolvers";

/**
 * Fetch remote GraphQL schema via introspection with timeout handling
 * @async
 * @function fetchRemoteSchema
 * @param {string} url - The URL of the remote GraphQL endpoint
 * @param {number} [timeout=10000] - Request timeout in milliseconds
 * @returns {Promise<GraphQLSchema>} The introspected GraphQL schema
 * @throws {Error} If introspection fails, times out, or returns errors
 * @description Fetches a GraphQL schema from a remote endpoint using introspection query.
 * Implements timeout handling with AbortController to prevent hanging requests.
 * Validates the response and builds a client schema from the introspection result.
 *
 * @example
 * ```typescript
 * const schema = await fetchRemoteSchema('http://localhost:3080/metadata-graphql', 5000);
 * ```
 */
async function fetchRemoteSchema(url: string, timeout: number = 10000) {
	const introspectionQuery = getIntrospectionQuery();
	
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: introspectionQuery }),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`Failed to introspect remote schema: HTTP ${response.status} ${response.statusText}`);
		}

		const result = await response.json() as { data?: IntrospectionQuery; errors?: any[] };
		
		if (result.errors && result.errors.length > 0) {
			throw new Error(`Introspection errors: ${JSON.stringify(result.errors)}`);
		}

		if (!result.data) {
			throw new Error("No data returned from introspection query");
		}

		return buildClientSchema(result.data);
	} catch (error: any) {
		clearTimeout(timeoutId);
		if (error.name === 'AbortError') {
			throw new Error(`Request timeout after ${timeout}ms`);
		}
		throw error;
	}
}

/**
 * Create executor function for remote GraphQL endpoint
 * @function createRemoteExecutor
 * @param {string} url - The URL of the remote GraphQL endpoint
 * @returns {Function} Executor function compatible with schema stitching
 * @description Creates an executor function that forwards GraphQL operations to a remote
 * endpoint. The executor handles query printing, variable passing, and error formatting.
 * Used by schema stitching to delegate queries to the remote schema.
 *
 * @example
 * ```typescript
 * const executor = createRemoteExecutor('http://localhost:3080/metadata-graphql');
 * // Used in stitchSchemas configuration
 * ```
 */
function createRemoteExecutor(url: string) {
	return async ({ document, variables }: any) => {
		const query = print(document);
		
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query, variables }),
			});

			if (!response.ok) {
				throw new Error(`Remote GraphQL request failed: ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			console.error("Error executing remote GraphQL query:", error);
			throw error;
		}
	};
}

/**
 * GraphQL Service
 * @constant {Object} GraphQLService
 * @description Moleculer service that provides a unified GraphQL API by stitching together:
 * - Local canonical metadata schema (comics, user preferences, library statistics)
 * - Remote metadata-graphql schema (weekly pull lists, metadata sources)
 *
 * **Features:**
 * - Schema stitching with automatic fallback to local-only mode
 * - GraphQL query and mutation execution
 * - Automatic metadata resolution on import events
 * - Timeout handling and error recovery
 * - Debug logging for schema introspection
 *
 * **Actions:**
 * - `graphql.graphql` - Execute GraphQL queries/mutations
 * - `graphql.getSchema` - Get schema type definitions
 *
 * **Events:**
 * - `metadata.imported` - Triggers auto-resolution if enabled
 * - `comic.imported` - Triggers auto-resolution on import if enabled
 *
 * **Settings:**
 * - `metadataGraphqlUrl` - Remote metadata GraphQL endpoint URL
 *
 * @example
 * ```typescript
 * // Execute a GraphQL query via broker
 * const result = await broker.call('graphql.graphql', {
 *   query: 'query { comic(id: "123") { id } }',
 *   variables: {}
 * });
 * ```
 */
export default {
	name: "graphql",
	
	settings: {
		/**
		 * Remote metadata GraphQL endpoint URL
		 * @type {string}
		 * @default "http://localhost:3080/metadata-graphql"
		 * @description URL of the remote metadata GraphQL service to stitch with local schema.
		 * Can be overridden via METADATA_GRAPHQL_URL environment variable.
		 */
		metadataGraphqlUrl: process.env.METADATA_GRAPHQL_URL || "http://localhost:3080/metadata-graphql",
	},

	actions: {
		/**
		 * Execute GraphQL queries and mutations
		 * @action graphql
		 * @param {string} query - GraphQL query or mutation string
		 * @param {Object} [variables] - Variables for the GraphQL operation
		 * @param {string} [operationName] - Name of the operation to execute
		 * @returns {Promise<Object>} GraphQL execution result with data or errors
		 * @description Main action for executing GraphQL operations against the stitched schema.
		 * Called by moleculer-web from the /graphql HTTP endpoint. Provides broker and context
		 * to resolvers for service communication.
		 *
		 * @example
		 * ```typescript
		 * await broker.call('graphql.graphql', {
		 *   query: 'mutation { resolveMetadata(comicId: "123") { id } }',
		 *   variables: {}
		 * });
		 * ```
		 */
		graphql: {
			params: {
				query: { type: "string" },
				variables: { type: "object", optional: true },
				operationName: { type: "string", optional: true },
			},
			async handler(ctx: Context<{ query: string; variables?: any; operationName?: string }>) {
				try {
					const { query, variables, operationName } = ctx.params;
					
					// Execute the GraphQL query
					const result = await graphql({
						schema: this.schema,
						source: query,
						variableValues: variables,
						operationName,
						contextValue: {
							broker: this.broker,
							ctx,
						},
					});

					return result;
				} catch (error: any) {
					this.logger.error("GraphQL execution error:", error);
					return {
						errors: [{
							message: error.message,
							extensions: {
								code: "INTERNAL_SERVER_ERROR",
							},
						}],
					};
				}
			},
		},

		/**
		 * Get GraphQL schema type definitions
		 * @action getSchema
		 * @returns {Promise<Object>} Object containing schema type definitions as string
		 * @description Returns the local schema type definitions. Useful for schema
		 * documentation and introspection.
		 *
		 * @example
		 * ```typescript
		 * const { typeDefs } = await broker.call('graphql.getSchema');
		 * ```
		 */
		getSchema: {
			async handler() {
				return {
					typeDefs: typeDefs.loc?.source.body || "",
				};
			},
		},
	},

	events: {
		/**
		 * Handle metadata imported event
		 * @event metadata.imported
		 * @param {Object} params - Event parameters
		 * @param {string} params.comicId - ID of the comic with new metadata
		 * @param {string} params.source - Metadata source that was imported
		 * @description Triggered when new metadata is imported for a comic. If auto-merge
		 * is enabled in user preferences, automatically resolves canonical metadata.
		 *
		 * @example
		 * ```typescript
		 * broker.emit('metadata.imported', { comicId: '123', source: 'COMICVINE' });
		 * ```
		 */
		"metadata.imported": {
			async handler(ctx: any) {
				const { comicId, source } = ctx.params;
				this.logger.info(
					`Metadata imported for comic ${comicId} from ${source}`
				);

				// Optionally trigger auto-resolution if enabled
				try {
					const UserPreferences = require("../models/userpreferences.model").default;
					const preferences = await UserPreferences.findOne({
						userId: "default",
					});

					if (
						preferences?.autoMerge?.enabled &&
						preferences?.autoMerge?.onMetadataUpdate
					) {
						this.logger.info(
							`Auto-resolving metadata for comic ${comicId}`
						);
						// Call the graphql action
						await this.broker.call("graphql.graphql", {
							query: `
								mutation ResolveMetadata($comicId: ID!) {
									resolveMetadata(comicId: $comicId) {
										id
									}
								}
							`,
							variables: { comicId },
						});
					}
				} catch (error) {
					this.logger.error("Error in auto-resolution:", error);
				}
			},
		},

		/**
		 * Handle comic imported event
		 * @event comic.imported
		 * @param {Object} params - Event parameters
		 * @param {string} params.comicId - ID of the newly imported comic
		 * @description Triggered when a new comic is imported into the library. If auto-merge
		 * on import is enabled in user preferences, automatically resolves canonical metadata.
		 *
		 * @example
		 * ```typescript
		 * broker.emit('comic.imported', { comicId: '123' });
		 * ```
		 */
		"comic.imported": {
			async handler(ctx: any) {
				const { comicId } = ctx.params;
				this.logger.info(`Comic imported: ${comicId}`);

				// Optionally trigger auto-resolution if enabled
				try {
					const UserPreferences = require("../models/userpreferences.model").default;
					const preferences = await UserPreferences.findOne({
						userId: "default",
					});

					if (
						preferences?.autoMerge?.enabled &&
						preferences?.autoMerge?.onImport
					) {
						this.logger.info(
							`Auto-resolving metadata for newly imported comic ${comicId}`
						);
						// Call the graphql action
						await this.broker.call("graphql.graphql", {
							query: `
								mutation ResolveMetadata($comicId: ID!) {
									resolveMetadata(comicId: $comicId) {
										id
									}
								}
							`,
							variables: { comicId },
						});
					}
				} catch (error) {
					this.logger.error("Error in auto-resolution on import:", error);
				}
			},
		},
	},

	/**
	 * Service started lifecycle hook
	 * @async
	 * @function started
	 * @description Initializes the GraphQL service by creating the local schema and attempting
	 * to stitch it with the remote metadata schema. Implements the following workflow:
	 *
	 * 1. Create local executable schema from type definitions and resolvers
	 * 2. Attempt to introspect remote metadata GraphQL service
	 * 3. If successful, stitch local and remote schemas together
	 * 4. If failed, fall back to local schema only
	 * 5. Log available Query fields for debugging
	 *
	 * The service will continue to function with local schema only if remote stitching fails,
	 * but queries requiring remote types (like WeeklyPullList) will not be available.
	 */
	async started() {
		this.logger.info("GraphQL service starting...");
		
		// Create local schema
		const localSchema = makeExecutableSchema({
			typeDefs,
			resolvers,
		});

		// Try to stitch remote schema if available
		try {
			this.logger.info(`Attempting to introspect remote schema at ${this.settings.metadataGraphqlUrl}`);
			
			// Fetch and build the remote schema
			const remoteSchema = await fetchRemoteSchema(this.settings.metadataGraphqlUrl);
			
			this.logger.info("Successfully introspected remote metadata schema");
			
			// Log remote schema types for debugging
			const remoteQueryType = remoteSchema.getQueryType();
			if (remoteQueryType) {
				const remoteFields = Object.keys(remoteQueryType.getFields());
				this.logger.info(`Remote schema Query fields: ${remoteFields.join(', ')}`);
			}
			
			// Create executor for remote schema
			const remoteExecutor = createRemoteExecutor(this.settings.metadataGraphqlUrl);
			
			// Stitch schemas together with proper configuration
			this.schema = stitchSchemas({
				subschemas: [
					{
						schema: localSchema,
					},
					{
						schema: remoteSchema,
						executor: remoteExecutor,
					},
				],
				// Merge types from both schemas
				mergeTypes: true,
			});
			
			// Log stitched schema types for debugging
			const stitchedQueryType = this.schema.getQueryType();
			if (stitchedQueryType) {
				const stitchedFields = Object.keys(stitchedQueryType.getFields());
				this.logger.info(`Stitched schema Query fields: ${stitchedFields.join(', ')}`);
			}
			
			this.logger.info("Successfully stitched local and remote schemas");
		} catch (remoteError: any) {
			this.logger.warn(
				`Could not connect to remote metadata GraphQL at ${this.settings.metadataGraphqlUrl}: ${remoteError.message}`
			);
			this.logger.warn("Continuing with local schema only");
			
			// Use local schema only
			this.schema = localSchema;
		}
		
		this.logger.info("GraphQL service started successfully");
	},

	/**
	 * Service stopped lifecycle hook
	 * @function stopped
	 * @description Cleanup hook called when the service is stopped. Logs service shutdown.
	 */
	stopped() {
		this.logger.info("GraphQL service stopped");
	},
};
