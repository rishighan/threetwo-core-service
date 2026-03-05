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
 * Fetch remote GraphQL schema via introspection
 */
async function fetchRemoteSchema(url: string) {
	const introspectionQuery = getIntrospectionQuery();
	
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query: introspectionQuery }),
	});

	if (!response.ok) {
		throw new Error(`Failed to introspect remote schema: ${response.statusText}`);
	}

	const result = await response.json() as { data?: IntrospectionQuery; errors?: any[] };
	
	if (result.errors) {
		throw new Error(`Introspection errors: ${JSON.stringify(result.errors)}`);
	}

	if (!result.data) {
		throw new Error("No data returned from introspection query");
	}

	return buildClientSchema(result.data);
}

/**
 * Create executor for remote GraphQL endpoint
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
 * Provides a GraphQL API for canonical metadata queries and mutations
 * Standalone service that exposes a graphql action for moleculer-web
 * Stitches remote metadata-graphql schema from port 3080
 */
export default {
	name: "graphql",
	
	settings: {
		// Remote metadata GraphQL endpoint
		metadataGraphqlUrl: process.env.METADATA_GRAPHQL_URL || "http://localhost:3080/metadata-graphql",
	},

	actions: {
		/**
		 * Execute GraphQL queries and mutations
		 * This action is called by moleculer-web from the /graphql route
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
		 * Get GraphQL schema
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
		 * Trigger metadata resolution when new metadata is imported
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
		 * Trigger metadata resolution when comic is imported
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
			
			// Create executor for remote schema
			const remoteExecutor = createRemoteExecutor(this.settings.metadataGraphqlUrl);
			
			// Wrap the remote schema with executor
			const wrappedRemoteSchema = wrapSchema({
				schema: remoteSchema,
				executor: remoteExecutor,
			});
			
			// Stitch schemas together
			this.schema = stitchSchemas({
				subschemas: [
					{
						schema: localSchema,
					},
					{
						schema: wrappedRemoteSchema,
					},
				],
			});
			
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

	stopped() {
		this.logger.info("GraphQL service stopped");
	},
};
