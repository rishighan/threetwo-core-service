import { Service, ServiceBroker } from "moleculer";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../models/graphql/typedef";
import { resolvers } from "../models/graphql/resolvers";

/**
 * GraphQL Service
 * Provides a GraphQL API for canonical metadata queries and mutations
 * Integrates Apollo Server with Moleculer
 */
export default class GraphQLService extends Service {
	private apolloServer?: ApolloServer;

	public constructor(broker: ServiceBroker) {
		super(broker);

		this.parseServiceSchema({
			name: "graphql",
			
			settings: {
				// GraphQL endpoint path
				path: "/graphql",
			},

			actions: {
				/**
				 * Execute a GraphQL query
				 */
				query: {
					params: {
						query: "string",
						variables: { type: "object", optional: true },
						operationName: { type: "string", optional: true },
					},
					async handler(ctx: any) {
						try {
							if (!this.apolloServer) {
								throw new Error("Apollo Server not initialized");
							}

							const { query, variables, operationName } = ctx.params;

							const response = await this.apolloServer.executeOperation(
								{
									query,
									variables,
									operationName,
								},
								{
									contextValue: {
										broker: this.broker,
										ctx,
									},
								}
							);

							if (response.body.kind === "single") {
								return response.body.singleResult;
							}

							return response;
						} catch (error) {
							this.logger.error("GraphQL query error:", error);
							throw error;
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

			methods: {
				/**
				 * Initialize Apollo Server
				 */
				async initApolloServer() {
					this.logger.info("Initializing Apollo Server...");

					this.apolloServer = new ApolloServer({
						typeDefs,
						resolvers,
						introspection: true, // Enable GraphQL Playground in development
						formatError: (error) => {
							this.logger.error("GraphQL Error:", error);
							return {
								message: error.message,
								locations: error.locations,
								path: error.path,
								extensions: {
									code: error.extensions?.code,
								},
							};
						},
					});

					await this.apolloServer.start();
					this.logger.info("Apollo Server started successfully");
				},

				/**
				 * Stop Apollo Server
				 */
				async stopApolloServer() {
					if (this.apolloServer) {
						this.logger.info("Stopping Apollo Server...");
						await this.apolloServer.stop();
						this.apolloServer = undefined;
						this.logger.info("Apollo Server stopped");
					}
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
								await this.broker.call("graphql.query", {
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
								await this.broker.call("graphql.query", {
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

			started: async function (this: any) {
				await this.initApolloServer();
			},

			stopped: async function (this: any) {
				await this.stopApolloServer();
			},
		});
	}
}
