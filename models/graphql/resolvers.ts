/**
 * @fileoverview GraphQL resolvers for comic metadata operations
 * @module models/graphql/resolvers
 * @description Implements all GraphQL query and mutation resolvers for the comic library system.
 * Handles comic retrieval, metadata resolution, user preferences, library statistics,
 * and search operations. Integrates with the metadata resolution system to provide
 * sophisticated multi-source metadata merging.
 *
 * @see {@link module:models/graphql/typedef} for schema definitions
 * @see {@link module:utils/metadata.resolution.utils} for metadata resolution logic
 */

import Comic, { MetadataSource } from "../comic.model";
import UserPreferences, {
	ConflictResolutionStrategy,
} from "../userpreferences.model";
import {
	resolveMetadataField,
	buildCanonicalMetadata,
	MetadataField,
	ResolutionPreferences,
} from "../../utils/metadata.resolution.utils";

/**
 * GraphQL resolvers for canonical metadata queries and mutations
 * @constant {Object} resolvers
 * @description Complete resolver map implementing all queries, mutations, and field resolvers
 * defined in the GraphQL schema. Organized into Query, Mutation, and type-specific resolvers.
 */
export const resolvers = {
	Query: {
		/**
		 * Get a single comic by ID
		 * @async
		 * @function comic
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {string} args.id - Comic ID (MongoDB ObjectId)
		 * @returns {Promise<Comic|null>} Comic document or null if not found
		 * @throws {Error} If database query fails
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   comic(id: "507f1f77bcf86cd799439011") {
		 *     id
		 *     canonicalMetadata { title { value } }
		 *   }
		 * }
		 * ```
		 */
		comic: async (_: any, { id }: { id: string }) => {
			try {
				const comic = await Comic.findById(id);
				return comic;
			} catch (error) {
				console.error("Error fetching comic:", error);
				throw new Error("Failed to fetch comic");
			}
		},

		/**
		 * Get comic books with advanced pagination and filtering
		 * @async
		 * @function getComicBooks
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {Object} args.paginationOptions - Pagination configuration (page, limit, sort, etc.)
		 * @param {Object} [args.predicate={}] - MongoDB query predicate for filtering
		 * @returns {Promise<PaginatedResult>} Paginated comic results with metadata
		 * @throws {Error} If database query fails
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   getComicBooks(
		 *     paginationOptions: { page: 1, limit: 20, sort: "createdAt" }
		 *     predicate: {}
		 *   ) {
		 *     docs { id canonicalMetadata { title { value } } }
		 *     totalDocs
		 *     hasNextPage
		 *   }
		 * }
		 * ```
		 */
		getComicBooks: async (
			_: any,
			{
				paginationOptions,
				predicate = {},
			}: {
				paginationOptions: any;
				predicate?: any;
			}
		) => {
			try {
				const result = await Comic.paginate(predicate, paginationOptions);
				return result;
			} catch (error) {
				console.error("Error fetching comic books:", error);
				throw new Error("Failed to fetch comic books");
			}
		},

		/**
		 * Get comic book groups (volumes with multiple issues)
		 * @async
		 * @function getComicBookGroups
		 * @returns {Promise<Array>} Array of volume groups with issue information
		 * @throws {Error} If aggregation fails
		 * @description Aggregates comics by volume using ComicVine volume information.
		 * Returns the 5 most recently updated volumes with their metadata.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   getComicBookGroups {
		 *     id
		 *     volumes { name publisher { name } }
		 *   }
		 * }
		 * ```
		 */
		getComicBookGroups: async () => {
			try {
				const volumes = await Comic.aggregate([
					{
						$project: {
							volumeInfo:
								"$sourcedMetadata.comicvine.volumeInformation",
						},
					},
					{
						$unwind: "$volumeInfo",
					},
					{
						$group: {
							_id: "$_id",
							volumes: {
								$addToSet: "$volumeInfo",
							},
						},
					},
					{
						$unwind: "$volumes",
					},
					{ $sort: { updatedAt: -1 } },
					{ $skip: 0 },
					{ $limit: 5 },
				]);

				return volumes.map((vol) => ({
					id: vol._id.toString(),
					volumes: vol.volumes,
				}));
			} catch (error) {
				console.error("Error fetching comic book groups:", error);
				throw new Error("Failed to fetch comic book groups");
			}
		},

		/**
		 * Get library statistics
		 * @async
		 * @function getLibraryStatistics
		 * @returns {Promise<Object>} Library statistics including counts, sizes, and aggregations
		 * @throws {Error} If statistics calculation fails
		 * @description Calculates comprehensive library statistics including:
		 * - Total document count
		 * - Directory size and file count
		 * - File type distribution
		 * - Volume/issue groupings
		 * - Comics with/without ComicInfo.xml
		 * - Publisher statistics
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   getLibraryStatistics {
		 *     totalDocuments
		 *     comicDirectorySize { totalSizeInGB }
		 *     statistics { publisherWithMostComicsInLibrary { id count } }
		 *   }
		 * }
		 * ```
		 */
		getLibraryStatistics: async () => {
			try {
				const { getSizeOfDirectory } = require("../../utils/file.utils");
				const { COMICS_DIRECTORY } = require("../../constants/directories");

				const comicDirectorySize = await getSizeOfDirectory(
					COMICS_DIRECTORY,
					[".cbz", ".cbr", ".cb7"]
				);
				const totalCount = await Comic.countDocuments({});
				const statistics = await Comic.aggregate([
					{
						$facet: {
							fileTypes: [
								{
									$match: {
										"rawFileDetails.extension": {
											$in: [".cbr", ".cbz", ".cb7"],
										},
									},
								},
								{
									$group: {
										_id: "$rawFileDetails.extension",
										data: { $push: "$$ROOT._id" },
									},
								},
							],
							issues: [
								{
									$match: {
										"sourcedMetadata.comicvine.volumeInformation":
											{
												$gt: {},
											},
									},
								},
								{
									$group: {
										_id: "$sourcedMetadata.comicvine.volumeInformation",
										data: { $push: "$$ROOT._id" },
									},
								},
							],
							fileLessComics: [
								{
									$match: {
										rawFileDetails: {
											$exists: false,
										},
									},
								},
							],
							issuesWithComicInfoXML: [
								{
									$match: {
										"sourcedMetadata.comicInfo": {
											$exists: true,
											$gt: { $size: 0 },
										},
									},
								},
							],
							publisherWithMostComicsInLibrary: [
								{
									$unwind:
										"$sourcedMetadata.comicvine.volumeInformation.publisher",
								},
								{
									$group: {
										_id: "$sourcedMetadata.comicvine.volumeInformation.publisher.name",
										count: { $sum: 1 },
									},
								},
								{ $sort: { count: -1 } },
								{ $limit: 1 },
							],
						},
					},
				]);

				return {
					totalDocuments: totalCount,
					comicDirectorySize,
					statistics,
				};
			} catch (error) {
				console.error("Error fetching library statistics:", error);
				throw new Error("Failed to fetch library statistics");
			}
		},

		/**
		 * Search issues using Elasticsearch
		 * @async
		 * @function searchIssue
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {Object} [args.query] - Search query with volumeName and issueNumber
		 * @param {Object} [args.pagination={size:10,from:0}] - Pagination options
		 * @param {string} args.type - Search type (all, volumeName, wanted, volumes)
		 * @param {Object} context - GraphQL context with broker
		 * @returns {Promise<Object>} Elasticsearch search results
		 * @throws {Error} If search service is unavailable or search fails
		 * @description Delegates to the search service via Moleculer broker to perform
		 * Elasticsearch queries for comic issues.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   searchIssue(
		 *     query: { volumeName: "Batman", issueNumber: "1" }
		 *     pagination: { size: 10, from: 0 }
		 *     type: all
		 *   ) {
		 *     hits { hits { _source { id } } }
		 *   }
		 * }
		 * ```
		 */
		searchIssue: async (
			_: any,
			{
				query,
				pagination = { size: 10, from: 0 },
				type,
			}: {
				query?: { volumeName?: string; issueNumber?: string };
				pagination?: { size?: number; from?: number };
				type: string;
			},
			context: any
		) => {
			try {
				// Get broker from context (set up in GraphQL service)
				const broker = context?.broker;
				
				if (!broker) {
					throw new Error("Broker not available in context");
				}

				// Call the search service through the broker
				const result = await broker.call("search.issue", {
					query: query || {},
					pagination,
					type,
				});

				return result;
			} catch (error) {
				console.error("Error searching issues:", error);
				throw new Error(`Failed to search issues: ${error.message}`);
			}
		},

		/**
		 * List comics with pagination and filtering
		 * @async
		 * @function comics
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {number} [args.limit=10] - Items per page
		 * @param {number} [args.page=1] - Page number
		 * @param {string} [args.search] - Search term for title/series/filename
		 * @param {string} [args.publisher] - Filter by publisher
		 * @param {string} [args.series] - Filter by series
		 * @returns {Promise<Object>} Paginated comics with page info
		 * @throws {Error} If database query fails
		 * @description Lists comics with optional text search and filtering.
		 * Searches across canonical metadata title, series, and raw filename.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   comics(limit: 20, page: 1, search: "Batman", publisher: "DC Comics") {
		 *     comics { id canonicalMetadata { title { value } } }
		 *     totalCount
		 *     pageInfo { hasNextPage currentPage totalPages }
		 *   }
		 * }
		 * ```
		 */
		comics: async (
			_: any,
			{
				limit = 10,
				page = 1,
				search,
				publisher,
				series,
			}: {
				limit?: number;
				page?: number;
				search?: string;
				publisher?: string;
				series?: string;
			}
		) => {
			try {
				const query: any = {};

				// Build search query
				if (search) {
					query.$or = [
						{ "canonicalMetadata.title.value": new RegExp(search, "i") },
						{ "canonicalMetadata.series.value": new RegExp(search, "i") },
						{ "rawFileDetails.name": new RegExp(search, "i") },
					];
				}

				if (publisher) {
					query["canonicalMetadata.publisher.value"] = new RegExp(
						publisher,
						"i"
					);
				}

				if (series) {
					query["canonicalMetadata.series.value"] = new RegExp(series, "i");
				}

				const options = {
					page,
					limit,
					sort: { createdAt: -1 },
				};

				const result = await Comic.paginate(query, options);

				return {
					comics: result.docs,
					totalCount: result.totalDocs,
					pageInfo: {
						hasNextPage: result.hasNextPage,
						hasPreviousPage: result.hasPrevPage,
						currentPage: result.page,
						totalPages: result.totalPages,
					},
				};
			} catch (error) {
				console.error("Error fetching comics:", error);
				throw new Error("Failed to fetch comics");
			}
		},

		/**
		 * Get user preferences for metadata resolution
		 * @async
		 * @function userPreferences
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {string} [args.userId='default'] - User ID
		 * @returns {Promise<UserPreferences>} User preferences document
		 * @throws {Error} If database query fails
		 * @description Retrieves user preferences for metadata resolution.
		 * Creates default preferences if none exist for the user.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   userPreferences(userId: "default") {
		 *     conflictResolution
		 *     minConfidenceThreshold
		 *     sourcePriorities { source priority enabled }
		 *   }
		 * }
		 * ```
		 */
		userPreferences: async (
			_: any,
			{ userId = "default" }: { userId?: string }
		) => {
			try {
				let preferences = await UserPreferences.findOne({ userId });

				// Create default preferences if none exist
				if (!preferences) {
					preferences = await UserPreferences.create({ userId });
				}

				return preferences;
			} catch (error) {
				console.error("Error fetching user preferences:", error);
				throw new Error("Failed to fetch user preferences");
			}
		},

		/**
		 * Analyze metadata conflicts for a comic
		 * @async
		 * @function analyzeMetadataConflicts
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {string} args.comicId - Comic ID to analyze
		 * @returns {Promise<Array>} Array of metadata conflicts with candidates and resolution
		 * @throws {Error} If comic or preferences not found, or analysis fails
		 * @description Analyzes metadata conflicts by comparing values from different sources
		 * for key fields (title, series, issueNumber, description, publisher).
		 * Returns conflicts with all candidates and the resolved value.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   analyzeMetadataConflicts(comicId: "507f1f77bcf86cd799439011") {
		 *     field
		 *     candidates { value provenance { source confidence } }
		 *     resolved { value provenance { source } }
		 *     resolutionReason
		 *   }
		 * }
		 * ```
		 */
		analyzeMetadataConflicts: async (
			_: any,
			{ comicId }: { comicId: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const conflicts: any[] = [];

				// Analyze each field for conflicts
				const fields = [
					"title",
					"series",
					"issueNumber",
					"description",
					"publisher",
				];

				for (const field of fields) {
					const candidates = extractCandidatesForField(
						field,
						comic.sourcedMetadata
					);

					if (candidates.length > 1) {
						const resolved = resolveMetadataField(
							field,
							candidates,
							convertPreferences(preferences)
						);

						conflicts.push({
							field,
							candidates,
							resolved,
							resolutionReason: getResolutionReason(
								resolved,
								candidates,
								preferences
							),
						});
					}
				}

				return conflicts;
			} catch (error) {
				console.error("Error analyzing metadata conflicts:", error);
				throw new Error("Failed to analyze metadata conflicts");
			}
		},

		/**
		 * Preview canonical metadata resolution without saving
		 * @async
		 * @function previewCanonicalMetadata
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Query arguments
		 * @param {string} args.comicId - Comic ID to preview
		 * @param {Object} [args.preferences] - Optional preference overrides for preview
		 * @returns {Promise<CanonicalMetadata>} Preview of resolved canonical metadata
		 * @throws {Error} If comic or preferences not found
		 * @description Previews how canonical metadata would be resolved with current
		 * or provided preferences without saving to the database. Useful for testing
		 * different resolution strategies.
		 *
		 * @example
		 * ```graphql
		 * query {
		 *   previewCanonicalMetadata(
		 *     comicId: "507f1f77bcf86cd799439011"
		 *     preferences: { conflictResolution: CONFIDENCE }
		 *   ) {
		 *     title { value provenance { source confidence } }
		 *   }
		 * }
		 * ```
		 */
		previewCanonicalMetadata: async (
			_: any,
			{
				comicId,
				preferences: preferencesInput,
			}: { comicId: string; preferences?: any }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				let preferences = await UserPreferences.findOne({
					userId: "default",
				});

				// Use provided preferences or default
				if (preferencesInput) {
					preferences = applyPreferencesInput(preferences, preferencesInput);
				}

				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const canonical = buildCanonicalMetadata(
					comic.sourcedMetadata,
					convertPreferences(preferences)
				);

				return canonical;
			} catch (error) {
				console.error("Error previewing canonical metadata:", error);
				throw new Error("Failed to preview canonical metadata");
			}
		},

		/**
			* Get cached import statistics (fast, real-time)
			* @async
			* @function getCachedImportStatistics
			* @param {any} _ - Parent resolver (unused)
			* @param {Object} args - Query arguments (none)
			* @param {Object} context - GraphQL context with broker
			* @returns {Promise<Object>} Cached import statistics
			* @throws {Error} If statistics service is unavailable
			* @description Retrieves cached import statistics from the API service.
			* This is a fast, real-time query that doesn't require filesystem scanning.
			*
			* @example
			* ```graphql
			* query {
			*   getCachedImportStatistics {
			*     success
			*     stats {
			*       totalLocalFiles
			*       alreadyImported
			*       newFiles
			*       percentageImported
			*       pendingFiles
			*     }
			*     lastUpdated
			*   }
			* }
			* ```
			*/
		getCachedImportStatistics: async (
			_: any,
			args: {},
			context: any
		) => {
			try {
				const broker = context?.broker;
				
				if (!broker) {
					throw new Error("Broker not available in context");
				}

				const result = await broker.call("api.getCachedImportStatistics");
				return result;
			} catch (error) {
				console.error("Error fetching cached import statistics:", error);
				throw new Error(`Failed to fetch cached import statistics: ${error.message}`);
			}
		},

		/**
			* Get job result statistics grouped by session
			* @async
			* @function getJobResultStatistics
			* @param {any} _ - Parent resolver (unused)
			* @param {Object} args - Query arguments (none)
			* @param {Object} context - GraphQL context with broker
			* @returns {Promise<Array>} Array of job result statistics by session
			* @throws {Error} If job queue service is unavailable
			* @description Retrieves job result statistics grouped by session ID,
			* including counts of completed and failed jobs and earliest timestamp.
			*
			* @example
			* ```graphql
			* query {
			*   getJobResultStatistics {
			*     sessionId
			*     completedJobs
			*     failedJobs
			*     earliestTimestamp
			*   }
			* }
			* ```
			*/
		getJobResultStatistics: async (
			_: any,
			args: {},
			context: any
		) => {
			try {
				const broker = context?.broker;
				
				if (!broker) {
					throw new Error("Broker not available in context");
				}

				const result = await broker.call("jobqueue.getJobResultStatistics");
				return result;
			} catch (error) {
				console.error("Error fetching job result statistics:", error);
				throw new Error(`Failed to fetch job result statistics: ${error.message}`);
			}
		},
	},

	Mutation: {
		/**
		 * Update user preferences for metadata resolution
		 * @async
		 * @function updateUserPreferences
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} [args.userId='default'] - User ID
		 * @param {Object} args.preferences - Preferences to update
		 * @returns {Promise<UserPreferences>} Updated preferences document
		 * @throws {Error} If update fails
		 * @description Updates user preferences for metadata resolution including
		 * source priorities, conflict resolution strategy, confidence thresholds,
		 * field preferences, and auto-merge settings.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   updateUserPreferences(
		 *     userId: "default"
		 *     preferences: {
		 *       conflictResolution: CONFIDENCE
		 *       minConfidenceThreshold: 0.8
		 *       autoMerge: { enabled: true, onImport: true }
		 *     }
		 *   ) {
		 *     id
		 *     conflictResolution
		 *   }
		 * }
		 * ```
		 */
		updateUserPreferences: async (
			_: any,
			{
				userId = "default",
				preferences: preferencesInput,
			}: { userId?: string; preferences: any }
		) => {
			try {
				let preferences = await UserPreferences.findOne({ userId });

				if (!preferences) {
					preferences = new UserPreferences({ userId });
				}

				// Update preferences
				if (preferencesInput.sourcePriorities) {
					preferences.sourcePriorities = preferencesInput.sourcePriorities.map(
						(sp: any) => ({
							source: sp.source,
							priority: sp.priority,
							enabled: sp.enabled,
							fieldOverrides: sp.fieldOverrides
								? new Map(
										sp.fieldOverrides.map((fo: any) => [fo.field, fo.priority])
								  )
								: new Map(),
						})
					);
				}

				if (preferencesInput.conflictResolution) {
					preferences.conflictResolution = preferencesInput.conflictResolution;
				}

				if (preferencesInput.minConfidenceThreshold !== undefined) {
					preferences.minConfidenceThreshold =
						preferencesInput.minConfidenceThreshold;
				}

				if (preferencesInput.preferRecent !== undefined) {
					preferences.preferRecent = preferencesInput.preferRecent;
				}

				if (preferencesInput.fieldPreferences) {
					preferences.fieldPreferences = new Map(
						preferencesInput.fieldPreferences.map((fp: any) => [
							fp.field,
							fp.preferredSource,
						])
					);
				}

				if (preferencesInput.autoMerge) {
					preferences.autoMerge = {
						...preferences.autoMerge,
						...preferencesInput.autoMerge,
					};
				}

				await preferences.save();
				return preferences;
			} catch (error) {
				console.error("Error updating user preferences:", error);
				throw new Error("Failed to update user preferences");
			}
		},

		/**
		 * Manually set a metadata field (creates user override)
		 * @async
		 * @function setMetadataField
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} args.comicId - Comic ID
		 * @param {string} args.field - Field name to set
		 * @param {any} args.value - New value for the field
		 * @returns {Promise<Comic>} Updated comic document
		 * @throws {Error} If comic not found or update fails
		 * @description Manually sets a metadata field value, creating a user override
		 * that takes precedence over all source data. Marks the field with userOverride flag.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   setMetadataField(
		 *     comicId: "507f1f77bcf86cd799439011"
		 *     field: "title"
		 *     value: "Batman: The Dark Knight Returns"
		 *   ) {
		 *     id
		 *     canonicalMetadata { title { value userOverride } }
		 *   }
		 * }
		 * ```
		 */
		setMetadataField: async (
			_: any,
			{ comicId, field, value }: { comicId: string; field: string; value: any }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				// Set the field with user override
				const fieldPath = `canonicalMetadata.${field}`;
				const update = {
					[fieldPath]: {
						value,
						provenance: {
							source: MetadataSource.MANUAL,
							confidence: 1.0,
							fetchedAt: new Date(),
						},
						userOverride: true,
					},
				};

				const updatedComic = await Comic.findByIdAndUpdate(
					comicId,
					{ $set: update },
					{ new: true }
				);

				return updatedComic;
			} catch (error) {
				console.error("Error setting metadata field:", error);
				throw new Error("Failed to set metadata field");
			}
		},

		/**
		 * Trigger metadata resolution for a comic
		 * @async
		 * @function resolveMetadata
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} args.comicId - Comic ID to resolve
		 * @returns {Promise<Comic>} Comic with resolved canonical metadata
		 * @throws {Error} If comic or preferences not found, or resolution fails
		 * @description Triggers metadata resolution for a comic, building canonical
		 * metadata from all available sources using current user preferences.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   resolveMetadata(comicId: "507f1f77bcf86cd799439011") {
		 *     id
		 *     canonicalMetadata { title { value provenance { source } } }
		 *   }
		 * }
		 * ```
		 */
		resolveMetadata: async (_: any, { comicId }: { comicId: string }) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				// Build canonical metadata
				const canonical = buildCanonicalMetadata(
					comic.sourcedMetadata,
					convertPreferences(preferences)
				);

				// Update comic with canonical metadata
				comic.canonicalMetadata = canonical;
				await comic.save();

				return comic;
			} catch (error) {
				console.error("Error resolving metadata:", error);
				throw new Error("Failed to resolve metadata");
			}
		},

		/**
		 * Bulk resolve metadata for multiple comics
		 * @async
		 * @function bulkResolveMetadata
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string[]} args.comicIds - Array of comic IDs to resolve
		 * @returns {Promise<Comic[]>} Array of comics with resolved metadata
		 * @throws {Error} If preferences not found or resolution fails
		 * @description Resolves metadata for multiple comics in bulk using current
		 * user preferences. Skips comics that don't exist.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   bulkResolveMetadata(comicIds: ["507f...", "507f..."]) {
		 *     id
		 *     canonicalMetadata { title { value } }
		 *   }
		 * }
		 * ```
		 */
		bulkResolveMetadata: async (
			_: any,
			{ comicIds }: { comicIds: string[] }
		) => {
			try {
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const resolvedComics = [];

				for (const comicId of comicIds) {
					const comic = await Comic.findById(comicId);
					if (comic) {
						const canonical = buildCanonicalMetadata(
							comic.sourcedMetadata,
							convertPreferences(preferences)
						);

						comic.canonicalMetadata = canonical;
						await comic.save();
						resolvedComics.push(comic);
					}
				}

				return resolvedComics;
			} catch (error) {
				console.error("Error bulk resolving metadata:", error);
				throw new Error("Failed to bulk resolve metadata");
			}
		},

		/**
		 * Remove user override for a field
		 * @async
		 * @function removeMetadataOverride
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} args.comicId - Comic ID
		 * @param {string} args.field - Field name to remove override from
		 * @returns {Promise<Comic>} Updated comic document
		 * @throws {Error} If comic or preferences not found, or update fails
		 * @description Removes a user override for a field and re-resolves it from
		 * source data using current preferences.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   removeMetadataOverride(
		 *     comicId: "507f1f77bcf86cd799439011"
		 *     field: "title"
		 *   ) {
		 *     id
		 *     canonicalMetadata { title { value userOverride } }
		 *   }
		 * }
		 * ```
		 */
		removeMetadataOverride: async (
			_: any,
			{ comicId, field }: { comicId: string; field: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				// Re-resolve the field without user override
				const candidates = extractCandidatesForField(
					field,
					comic.sourcedMetadata
				).filter((c) => !c.userOverride);

				const resolved = resolveMetadataField(
					field,
					candidates,
					convertPreferences(preferences)
				);

				if (resolved) {
					const fieldPath = `canonicalMetadata.${field}`;
					await Comic.findByIdAndUpdate(comicId, {
						$set: { [fieldPath]: resolved },
					});
				}

				const updatedComic = await Comic.findById(comicId);
				return updatedComic;
			} catch (error) {
				console.error("Error removing metadata override:", error);
				throw new Error("Failed to remove metadata override");
			}
		},

		/**
		 * Refresh metadata from a specific source
		 * @async
		 * @function refreshMetadataFromSource
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} args.comicId - Comic ID
		 * @param {MetadataSource} args.source - Source to refresh from
		 * @returns {Promise<Comic>} Updated comic document
		 * @throws {Error} Not implemented - requires integration with metadata services
		 * @description Placeholder for refreshing metadata from a specific external source.
		 * Would trigger a re-fetch from the specified source and update sourced metadata.
		 */
		refreshMetadataFromSource: async (
			_: any,
			{ comicId, source }: { comicId: string; source: MetadataSource }
		) => {
			try {
				// This would trigger a re-fetch from the external source
				// Implementation depends on your existing metadata fetching services
				throw new Error("Not implemented - requires integration with metadata services");
			} catch (error) {
				console.error("Error refreshing metadata from source:", error);
				throw new Error("Failed to refresh metadata from source");
			}
		},

		/**
		 * Import a new comic with automatic metadata resolution
		 * @async
		 * @function importComic
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {Object} args.input - Comic import data including file details and metadata
		 * @returns {Promise<Object>} Import result with success status and comic
		 * @throws {Error} If import fails
		 * @description Imports a new comic into the library with all metadata sources.
		 * Automatically resolves canonical metadata if auto-merge is enabled in preferences.
		 * Checks for duplicates before importing.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   importComic(input: {
		 *     filePath: "/comics/batman-1.cbz"
		 *     rawFileDetails: { name: "batman-1.cbz", fileSize: 12345 }
		 *     sourcedMetadata: { comicInfo: "{...}" }
		 *   }) {
		 *     success
		 *     comic { id }
		 *     message
		 *     canonicalMetadataResolved
		 *   }
		 * }
		 * ```
		 */
		importComic: async (_: any, { input }: { input: any }) => {
			try {
				console.log("Importing comic via GraphQL:", input.filePath);

				// 1. Check if comic already exists
				const existingComic = await Comic.findOne({
					"rawFileDetails.name": input.rawFileDetails?.name,
				});

				if (existingComic) {
					return {
						success: false,
						comic: existingComic,
						message: "Comic already exists in the library",
						canonicalMetadataResolved: false,
					};
				}

				// 2. Prepare comic data
				const comicData: any = {
					importStatus: {
						isImported: true,
						tagged: false,
					},
				};

				// Add raw file details
				if (input.rawFileDetails) {
					comicData.rawFileDetails = input.rawFileDetails;
				}

				// Add inferred metadata
				if (input.inferredMetadata) {
					comicData.inferredMetadata = input.inferredMetadata;
				}

				// Add sourced metadata
				if (input.sourcedMetadata) {
					comicData.sourcedMetadata = {};
					
					if (input.sourcedMetadata.comicInfo) {
						comicData.sourcedMetadata.comicInfo = JSON.parse(
							input.sourcedMetadata.comicInfo
						);
					}
					if (input.sourcedMetadata.comicvine) {
						comicData.sourcedMetadata.comicvine = JSON.parse(
							input.sourcedMetadata.comicvine
						);
					}
					if (input.sourcedMetadata.metron) {
						comicData.sourcedMetadata.metron = JSON.parse(
							input.sourcedMetadata.metron
						);
					}
					if (input.sourcedMetadata.gcd) {
						comicData.sourcedMetadata.gcd = JSON.parse(
							input.sourcedMetadata.gcd
						);
					}
					if (input.sourcedMetadata.locg) {
						comicData.sourcedMetadata.locg = input.sourcedMetadata.locg;
					}
				}

				// Add wanted information
				if (input.wanted) {
					comicData.wanted = input.wanted;
				}

				// Add acquisition information
				if (input.acquisition) {
					comicData.acquisition = input.acquisition;
				}

				// 3. Create the comic document
				const comic = await Comic.create(comicData);
				console.log(`Comic created with ID: ${comic._id}`);

				// 4. Check if auto-resolution is enabled
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});

				let canonicalMetadataResolved = false;

				if (
					preferences?.autoMerge?.enabled &&
					preferences?.autoMerge?.onImport
				) {
					console.log("Auto-resolving canonical metadata...");

					// Build canonical metadata
					const canonical = buildCanonicalMetadata(
						comic.sourcedMetadata,
						convertPreferences(preferences)
					);

					// Update comic with canonical metadata
					comic.canonicalMetadata = canonical;
					await comic.save();

					canonicalMetadataResolved = true;
					console.log("Canonical metadata resolved successfully");
				}

				return {
					success: true,
					comic,
					message: "Comic imported successfully",
					canonicalMetadataResolved,
				};
			} catch (error) {
				console.error("Error importing comic:", error);
				throw new Error(`Failed to import comic: ${error.message}`);
			}
		},

		/**
		 * Update sourced metadata and trigger resolution
		 * @async
		 * @function updateSourcedMetadata
		 * @param {any} _ - Parent resolver (unused)
		 * @param {Object} args - Mutation arguments
		 * @param {string} args.comicId - Comic ID
		 * @param {MetadataSource} args.source - Source being updated
		 * @param {string} args.metadata - JSON string of new metadata
		 * @returns {Promise<Comic>} Updated comic with re-resolved canonical metadata
		 * @throws {Error} If comic not found, JSON invalid, or update fails
		 * @description Updates sourced metadata from a specific source and automatically
		 * re-resolves canonical metadata if auto-merge on update is enabled.
		 *
		 * @example
		 * ```graphql
		 * mutation {
		 *   updateSourcedMetadata(
		 *     comicId: "507f1f77bcf86cd799439011"
		 *     source: COMICVINE
		 *     metadata: "{\"name\": \"Batman #1\", ...}"
		 *   ) {
		 *     id
		 *     canonicalMetadata { title { value } }
		 *   }
		 * }
		 * ```
		 */
		updateSourcedMetadata: async (
			_: any,
			{
				comicId,
				source,
				metadata,
			}: { comicId: string; source: MetadataSource; metadata: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				// Parse and update the sourced metadata
				const parsedMetadata = JSON.parse(metadata);
				const sourceKey = source.toLowerCase();

				if (!comic.sourcedMetadata) {
					comic.sourcedMetadata = {};
				}

				comic.sourcedMetadata[sourceKey] = parsedMetadata;
				await comic.save();

				console.log(
					`Updated ${source} metadata for comic ${comicId}`
				);

				// Check if auto-resolution is enabled
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});

				if (
					preferences?.autoMerge?.enabled &&
					preferences?.autoMerge?.onMetadataUpdate
				) {
					console.log("Auto-resolving canonical metadata after update...");

					// Build canonical metadata
					const canonical = buildCanonicalMetadata(
						comic.sourcedMetadata,
						convertPreferences(preferences)
					);

					// Update comic with canonical metadata
					comic.canonicalMetadata = canonical;
					await comic.save();

					console.log("Canonical metadata resolved after update");
				}

				return comic;
			} catch (error) {
				console.error("Error updating sourced metadata:", error);
				throw new Error(`Failed to update sourced metadata: ${error.message}`);
			}
		},
	},

	/**
	 * Field resolvers for Comic type
	 * @description Custom field resolvers for transforming Comic data
	 */
	Comic: {
		/**
		 * Resolve Comic ID field
		 * @param {any} comic - Comic document
		 * @returns {string} String representation of MongoDB ObjectId
		 */
		id: (comic: any) => comic._id.toString(),
		
		/**
		 * Resolve sourced metadata field
		 * @param {any} comic - Comic document
		 * @returns {Object} Sourced metadata with JSON-stringified sources
		 * @description Converts sourced metadata objects to JSON strings for GraphQL transport
		 */
		sourcedMetadata: (comic: any) => ({
			comicInfo: JSON.stringify(comic.sourcedMetadata?.comicInfo || {}),
			comicvine: JSON.stringify(comic.sourcedMetadata?.comicvine || {}),
			metron: JSON.stringify(comic.sourcedMetadata?.metron || {}),
			gcd: JSON.stringify(comic.sourcedMetadata?.gcd || {}),
			locg: comic.sourcedMetadata?.locg || null,
		}),
	},

	/**
	 * Field resolvers for FileTypeStats type
	 * @description Resolves ID field for file type statistics
	 */
	FileTypeStats: {
		/**
		 * Resolve FileTypeStats ID
		 * @param {any} stats - Statistics document
		 * @returns {string} ID value
		 */
		id: (stats: any) => stats._id || stats.id,
	},

	/**
	 * Field resolvers for PublisherStats type
	 * @description Resolves ID field for publisher statistics
	 */
	PublisherStats: {
		/**
		 * Resolve PublisherStats ID
		 * @param {any} stats - Statistics document
		 * @returns {string} ID value
		 */
		id: (stats: any) => stats._id || stats.id,
	},

	/**
	 * Field resolvers for IssueStats type
	 * @description Resolves ID field for issue statistics
	 */
	IssueStats: {
		/**
		 * Resolve IssueStats ID
		 * @param {any} stats - Statistics document
		 * @returns {string} ID value
		 */
		id: (stats: any) => stats._id || stats.id,
	},

	/**
	 * Field resolvers for UserPreferences type
	 * @description Custom resolvers for transforming UserPreferences data
	 */
	UserPreferences: {
		/**
		 * Resolve UserPreferences ID
		 * @param {any} prefs - Preferences document
		 * @returns {string} String representation of MongoDB ObjectId
		 */
		id: (prefs: any) => prefs._id.toString(),
		
		/**
		 * Resolve field preferences
		 * @param {any} prefs - Preferences document
		 * @returns {Array} Array of field preference objects
		 * @description Converts Map to array of {field, preferredSource} objects
		 */
		fieldPreferences: (prefs: any) => {
			if (!prefs.fieldPreferences) return [];
			return Array.from(prefs.fieldPreferences.entries()).map(
				([field, preferredSource]) => ({
					field,
					preferredSource,
				})
			);
		},
		
		/**
		 * Resolve source priorities
		 * @param {any} prefs - Preferences document
		 * @returns {Array} Array of source priority objects with field overrides
		 * @description Converts fieldOverrides Map to array format for GraphQL
		 */
		sourcePriorities: (prefs: any) => {
			return prefs.sourcePriorities.map((sp: any) => ({
				...sp,
				fieldOverrides: sp.fieldOverrides
					? Array.from(sp.fieldOverrides.entries()).map(([field, priority]) => ({
							field,
							priority,
					  }))
					: [],
			}));
		},
	},
};

/**
 * Extract metadata field candidates from sourced metadata
 * @private
 * @function extractCandidatesForField
 * @param {string} field - Field name to extract
 * @param {any} sourcedMetadata - Sourced metadata object
 * @returns {MetadataField[]} Array of metadata field candidates with provenance
 * @description Extracts all available values for a field from different metadata sources.
 * Maps field names to source-specific paths and extracts values with provenance information.
 */
function extractCandidatesForField(
	field: string,
	sourcedMetadata: any
): MetadataField[] {
	const candidates: MetadataField[] = [];

	// Map field names to source paths
	const mappings: Record<string, any> = {
		title: [
			{ source: MetadataSource.COMICVINE, path: "name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Title", data: sourcedMetadata.comicInfo },
			{ source: MetadataSource.LOCG, path: "name", data: sourcedMetadata.locg },
		],
		series: [
			{ source: MetadataSource.COMICVINE, path: "volumeInformation.name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Series", data: sourcedMetadata.comicInfo },
		],
		issueNumber: [
			{ source: MetadataSource.COMICVINE, path: "issue_number", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Number", data: sourcedMetadata.comicInfo },
		],
		description: [
			{ source: MetadataSource.COMICVINE, path: "description", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.LOCG, path: "description", data: sourcedMetadata.locg },
			{ source: MetadataSource.COMICINFO_XML, path: "Summary", data: sourcedMetadata.comicInfo },
		],
		publisher: [
			{ source: MetadataSource.COMICVINE, path: "volumeInformation.publisher.name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.LOCG, path: "publisher", data: sourcedMetadata.locg },
			{ source: MetadataSource.COMICINFO_XML, path: "Publisher", data: sourcedMetadata.comicInfo },
		],
	};

	const fieldMappings = mappings[field] || [];

	for (const mapping of fieldMappings) {
		if (!mapping.data) continue;

		const value = getNestedValue(mapping.data, mapping.path);
		if (value !== null && value !== undefined) {
			candidates.push({
				value,
				provenance: {
					source: mapping.source,
					confidence: 0.9,
					fetchedAt: new Date(),
				},
			});
		}
	}

	return candidates;
}

/**
 * Get nested value from object using dot notation path
 * @private
 * @function getNestedValue
 * @param {any} obj - Object to traverse
 * @param {string} path - Dot-notation path (e.g., "volumeInformation.name")
 * @returns {any} Value at path or undefined
 * @description Safely traverses nested object properties using dot notation.
 */
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Convert UserPreferences model to ResolutionPreferences format
 * @private
 * @function convertPreferences
 * @param {any} prefs - UserPreferences document
 * @returns {ResolutionPreferences} Preferences in resolution utility format
 * @description Transforms UserPreferences model to the format expected by
 * metadata resolution utilities.
 */
function convertPreferences(prefs: any): ResolutionPreferences {
	return {
		sourcePriorities: prefs.sourcePriorities.map((sp: any) => ({
			source: sp.source,
			priority: sp.priority,
			enabled: sp.enabled,
			fieldOverrides: sp.fieldOverrides,
		})),
		conflictResolution: prefs.conflictResolution,
		minConfidenceThreshold: prefs.minConfidenceThreshold,
		preferRecent: prefs.preferRecent,
		fieldPreferences: prefs.fieldPreferences,
	};
}

/**
 * Get human-readable resolution reason
 * @private
 * @function getResolutionReason
 * @param {MetadataField|null} resolved - Resolved metadata field
 * @param {MetadataField[]} candidates - All candidate fields
 * @param {any} preferences - User preferences
 * @returns {string} Human-readable explanation of resolution
 * @description Generates explanation for why a particular field value was chosen.
 */
function getResolutionReason(
	resolved: MetadataField | null,
	candidates: MetadataField[],
	preferences: any
): string {
	if (!resolved) return "No valid candidates";

	if (resolved.userOverride) {
		return "User override";
	}

	const priority = preferences.getSourcePriority(resolved.provenance.source);
	return `Resolved using ${resolved.provenance.source} (priority: ${priority}, confidence: ${resolved.provenance.confidence})`;
}

/**
 * Apply preference input overrides to existing preferences
 * @private
 * @function applyPreferencesInput
 * @param {any} prefs - Existing preferences document
 * @param {any} input - Input preferences to apply
 * @returns {any} Updated preferences object
 * @description Merges input preferences with existing preferences for preview operations.
 */
function applyPreferencesInput(prefs: any, input: any): any {
	const updated = { ...prefs.toObject() };

	if (input.sourcePriorities) {
		updated.sourcePriorities = input.sourcePriorities;
	}
	if (input.conflictResolution) {
		updated.conflictResolution = input.conflictResolution;
	}
	if (input.minConfidenceThreshold !== undefined) {
		updated.minConfidenceThreshold = input.minConfidenceThreshold;
	}
	if (input.preferRecent !== undefined) {
		updated.preferRecent = input.preferRecent;
	}

	return updated;
}
