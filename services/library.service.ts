/*
 * MIT License
 *
 * Copyright (c) 2022 Rishi Ghan
 *
 The MIT License (MIT)

Copyright (c) 2022 Rishi Ghan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

/*
 * Revision History:
 *     Initial:        2022/01/28        Rishi Ghan
 */

"use strict";
import { isNil } from "lodash";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { walkFolder, getSizeOfDirectory } from "../utils/file.utils";
import { extractFromArchive } from "../utils/uncompression.utils";
import { convertXMLToJSON } from "../utils/xml.utils";
import {
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
} from "threetwo-ui-typings";
const ObjectId = require("mongoose").Types.ObjectId;
import { pubClient } from "../config/redis.config";
import fsExtra from "fs-extra";
const through2 = require("through2");
import klaw from "klaw";
import path from "path";
import { COMICS_DIRECTORY, USERDATA_DIRECTORY } from "../constants/directories";
import AirDCPPSocket from "../shared/airdcpp.socket";
import { importComicViaGraphQL } from "../utils/import.graphql.utils";
import { getImportStatistics as getImportStats } from "../utils/import.utils";

console.log(`MONGO -> ${process.env.MONGO_URI}`);
export default class ImportService extends Service {
	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "library",
			mixins: [DbMixin("comics", Comic)],
			hooks: {},
			actions: {
				getHealthInformation: {
					rest: "GET /getHealthInformation",
					params: {},
					handler: async (ctx: Context<{}>) => {
						try {
							return await ctx.broker.call("$node.services");
						} catch (error) {
							return new Error("Service is down.");
						}
					},
				},
				walkFolders: {
					rest: "POST /walkFolders",
					params: {},
					async handler(
						ctx: Context<{
							basePathToWalk: string;
							extensions?: string[];
						}>
					) {
						console.log(ctx.params);
						return await walkFolder(ctx.params.basePathToWalk, [
							".cbz",
							".cbr",
							".cb7",
							...(ctx.params.extensions || []),
						]);
					},
				},
				convertXMLToJSON: {
					rest: "POST /convertXmlToJson",
					params: {},
					async handler(ctx: Context<{}>) {
						return convertXMLToJSON("lagos");
					},
				},
				uncompressFullArchive: {
					rest: "POST /uncompressFullArchive",
					params: {},
					handler: async (
						ctx: Context<{
							filePath: string;
							comicObjectId: string;
							options: any;
						}>
					) => {
						this.broker.call("jobqueue.enqueue", {
							filePath: ctx.params.filePath,
							comicObjectId: ctx.params.comicObjectId,
							options: ctx.params.options,
							action: "uncompressFullArchive.async",
							description: `Job for uncompressing archive at ${ctx.params.filePath}`,
						});
					},
				},
				importDownloadedComic: {
					rest: "POST /importDownloadedComic",
					params: {},
					handler: async (ctx: Context<{ bundle: any }>) => {
						console.log(ctx.params);
						// Find the comic by bundleId
						const referenceComicObject = await Comic.find({
							"acquisition.directconnect.downloads.bundleId": `${ctx.params.bundle.data.id}`,
						});
						// Determine source where the comic was added from
						// and gather identifying information about it
						const sourceName =
							referenceComicObject[0].acquisition.source.name;
						const { sourcedMetadata } = referenceComicObject[0];

						const filePath = `${COMICS_DIRECTORY}/${ctx.params.bundle.data.name}`;
						let comicExists = await Comic.exists({
							"rawFileDetails.name": `${path.basename(
								ctx.params.bundle.data.name,
								path.extname(ctx.params.bundle.data.name)
							)}`,
						});
						if (!comicExists) {
							// 2. Send the extraction job to the queue
							await broker.call("importqueue.processImport", {
								importType: "update",
								sourcedFrom: sourceName,
								bundleId: ctx.params.bundle.data.id,
								sourcedMetadata,
								fileObject: {
									filePath,
									// fileSize: item.stats.size,
								},
							});
						} else {
							console.log("Comic already exists in the library.");
						}
					},
				},
				newImport: {
					rest: "POST /newImport",
					// params: {},
					async handler(
						ctx: Context<{
							extractionOptions?: any;
							sessionId: string;
						}>
					) {
						try {
							// Get params to be passed to the import jobs
							const { sessionId } = ctx.params;
							const resolvedPath = path.resolve(COMICS_DIRECTORY);
							console.log(`Walking comics directory: ${resolvedPath}`);
							// 1. Walk the Source folder
							klaw(resolvedPath)
								.on("error", (err) => {
									console.error(`Error walking directory ${resolvedPath}:`, err);
								})
								// 1.1 Filter on .cb* extensions
								.pipe(
									through2.obj(function (item, enc, next) {
										let fileExtension = path.extname(
											item.path
										);
										if (
											[".cbz", ".cbr", ".cb7"].includes(
												fileExtension
											)
										) {
											this.push(item);
										}
										next();
									})
								)
								// 1.2 Pipe filtered results to the next step
								// 	   Enqueue the job in the queue
								.on("data", async (item) => {
									console.info(
										"Found a file at path: %s",
										item.path
									);
									let comicExists = await Comic.exists({
										"rawFileDetails.name": `${path.basename(
											item.path,
											path.extname(item.path)
										)}`,
									});
									if (!comicExists) {
										// 2.1 Reset the job counters in Redis
										await pubClient.set(
											"completedJobCount",
											0
										);
										await pubClient.set(
											"failedJobCount",
											0
										);
										// 2.2 Send the extraction job to the queue
										this.broker.call("jobqueue.enqueue", {
											fileObject: {
												filePath: item.path,
												fileSize: item.stats.size,
											},
											sessionId,
											importType: "new",
											action: "enqueue.async",
										});
									} else {
										console.log(
											"Comic already exists in the library."
										);
									}
								})
								.on("end", () => {
									console.log("All files traversed.");
								});
						} catch (error) {
							console.log(error);
						}
					},
				},
				getImportStatistics: {
					rest: "POST /getImportStatistics",
					timeout: 300000, // 5 minute timeout for large libraries
					async handler(
						ctx: Context<{
							directoryPath?: string;
						}>
					) {
						try {
							const { directoryPath } = ctx.params;
							const resolvedPath = path.resolve(directoryPath || COMICS_DIRECTORY);
							console.log(`[Import Statistics] Analyzing directory: ${resolvedPath}`);

							// Collect all comic files from the directory
							const localFiles: string[] = [];
							
							await new Promise<void>((resolve, reject) => {
								klaw(resolvedPath)
									.on("error", (err) => {
										console.error(`Error walking directory ${resolvedPath}:`, err);
										reject(err);
									})
									.pipe(
										through2.obj(function (item, enc, next) {
											const fileExtension = path.extname(item.path);
											if ([".cbz", ".cbr", ".cb7"].includes(fileExtension)) {
												localFiles.push(item.path);
											}
											next();
										})
									)
									.on("data", () => {}) // Required for stream to work
									.on("end", () => {
										console.log(`[Import Statistics] Found ${localFiles.length} comic files`);
										resolve();
									});
							});

							// Get statistics by comparing with database
							const stats = await getImportStats(localFiles);
							const percentageImported = stats.total > 0
								? ((stats.alreadyImported / stats.total) * 100).toFixed(2)
								: "0.00";

							return {
								success: true,
								directory: resolvedPath,
								stats: {
									totalLocalFiles: stats.total,
									alreadyImported: stats.alreadyImported,
									newFiles: stats.newFiles,
									percentageImported: `${percentageImported}%`,
								},
							};
						} catch (error) {
							console.error("[Import Statistics] Error:", error);
							throw new Errors.MoleculerError(
								"Failed to calculate import statistics",
								500,
								"IMPORT_STATS_ERROR",
								{ error: error.message }
							);
						}
					},
				},
				incrementalImport: {
					rest: "POST /incrementalImport",
					timeout: 60000, // 60 second timeout
					async handler(
						ctx: Context<{
							sessionId: string;
							directoryPath?: string;
						}>
					) {
						try {
							const { sessionId, directoryPath } = ctx.params;
							const resolvedPath = path.resolve(directoryPath || COMICS_DIRECTORY);
							console.log(`[Incremental Import] Starting for directory: ${resolvedPath}`);

							// Emit start event
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_STARTED", {
								message: "Starting incremental import analysis...",
								directory: resolvedPath,
							});

							// Step 1: Fetch imported files from database
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_PROGRESS", {
								message: "Fetching imported files from database...",
							});

							const importedFileNames = new Set<string>();
							const comics = await Comic.find(
								{ "rawFileDetails.name": { $exists: true, $ne: null } },
								{ "rawFileDetails.name": 1, _id: 0 }
							).lean();

							for (const comic of comics) {
								if (comic.rawFileDetails?.name) {
									importedFileNames.add(comic.rawFileDetails.name);
								}
							}

							console.log(`[Incremental Import] Found ${importedFileNames.size} imported files in database`);

							// Step 2: Scan directory for comic files
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_PROGRESS", {
								message: "Scanning directory for comic files...",
							});

							const localFiles: Array<{ path: string; name: string; size: number }> = [];

							await new Promise<void>((resolve, reject) => {
								klaw(resolvedPath)
									.on("error", (err) => {
										console.error(`Error walking directory ${resolvedPath}:`, err);
										reject(err);
									})
									.pipe(
										through2.obj(function (item, enc, next) {
											const fileExtension = path.extname(item.path);
											if ([".cbz", ".cbr", ".cb7"].includes(fileExtension)) {
												const fileName = path.basename(item.path, fileExtension);
												localFiles.push({
													path: item.path,
													name: fileName,
													size: item.stats.size,
												});
											}
											next();
										})
									)
									.on("data", () => {}) // Required for stream to work
									.on("end", () => {
										console.log(`[Incremental Import] Found ${localFiles.length} comic files in directory`);
										resolve();
									});
							});

							// Step 3: Filter to only new files
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_PROGRESS", {
								message: `Found ${localFiles.length} comic files, filtering...`,
							});

							const newFiles = localFiles.filter(file => !importedFileNames.has(file.name));

							console.log(`[Incremental Import] ${newFiles.length} new files to import`);

							// Step 4: Reset job counters and queue new files
							if (newFiles.length > 0) {
								this.broker.broadcast("LS_INCREMENTAL_IMPORT_PROGRESS", {
									message: `Queueing ${newFiles.length} new files for import...`,
								});

								// Reset counters once at the start
								await pubClient.set("completedJobCount", 0);
								await pubClient.set("failedJobCount", 0);
								console.log("[Incremental Import] Job counters reset");

								// Queue all new files
								for (const file of newFiles) {
									await this.broker.call("jobqueue.enqueue", {
										fileObject: {
											filePath: file.path,
											fileSize: file.size,
										},
										sessionId,
										importType: "new",
										sourcedFrom: "library",
										action: "enqueue.async",
									});
								}
							}

							// Emit completion event
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_COMPLETE", {
								message: `Successfully queued ${newFiles.length} files for import`,
								stats: {
									total: localFiles.length,
									alreadyImported: localFiles.length - newFiles.length,
									newFiles: newFiles.length,
									queued: newFiles.length,
								},
							});

							return {
								success: true,
								message: `Incremental import complete: ${newFiles.length} new files queued`,
								stats: {
									total: localFiles.length,
									alreadyImported: localFiles.length - newFiles.length,
									newFiles: newFiles.length,
									queued: newFiles.length,
								},
							};
						} catch (error) {
							console.error("[Incremental Import] Error:", error);
							
							// Emit error event
							this.broker.broadcast("LS_INCREMENTAL_IMPORT_ERROR", {
								message: error.message || "Unknown error during incremental import",
								error: error,
							});

							throw new Errors.MoleculerError(
								"Failed to perform incremental import",
								500,
								"INCREMENTAL_IMPORT_ERROR",
								{ error: error.message }
							);
						}
					},
				},
				rawImportToDB: {
					rest: "POST /rawImportToDB",
					params: {},
					async handler(
						ctx: Context<{
							bundleId?: string;
							importType: string;
							payload: {
								_id?: string;
								sourcedMetadata: {
									comicvine?: any;
									locg?: {};
									comicInfo?: any;
									metron?: any;
									gcd?: any;
								};
								inferredMetadata: {
									issue: Object;
								};
								rawFileDetails: {
									name: string;
									filePath: string;
									fileSize?: number;
									extension?: string;
									mimeType?: string;
									containedIn?: string;
									cover?: any;
								};
								wanted?: {
									issues: [];
									volume: { id: number };
									source: string;
									markEntireVolumeWanted: Boolean;
								};
								acquisition?: {
									source?: {
										wanted?: boolean;
										name?: string;
									};
									directconnect?: {
										downloads: [];
									};
								};
								importStatus?: {
									isImported: boolean;
									tagged: boolean;
									matchedResult?: {
										score: string;
									};
								};
							};
						}>
					) {
						try {
							console.log(
								"[GraphQL Import] Processing import via GraphQL..."
							);
							console.log(
								JSON.stringify(ctx.params.payload, null, 4)
							);
							const { payload } = ctx.params;
							const { wanted } = payload;

							// Use GraphQL import for new comics
							if (
								!wanted ||
								!wanted.volume ||
								!wanted.volume.id
							) {
								console.log(
									"[GraphQL Import] No valid identifier - creating new comic via GraphQL"
								);

								// Import via GraphQL
								const result = await importComicViaGraphQL(
									this.broker,
									{
										filePath: payload.rawFileDetails.filePath,
										fileSize: payload.rawFileDetails.fileSize,
										rawFileDetails: payload.rawFileDetails,
										inferredMetadata: payload.inferredMetadata,
										sourcedMetadata: payload.sourcedMetadata,
										wanted: payload.wanted ? {
											...payload.wanted,
											markEntireVolumeWanted: Boolean(payload.wanted.markEntireVolumeWanted)
										} : undefined,
										acquisition: payload.acquisition,
									}
								);

								if (result.success) {
									console.log(
										`[GraphQL Import] Comic imported successfully: ${result.comic.id}`
									);
									console.log(
										`[GraphQL Import] Canonical metadata resolved: ${result.canonicalMetadataResolved}`
									);

									return {
										success: true,
										message: result.message,
										data: result.comic,
									};
								} else {
									console.log(
										`[GraphQL Import] Import returned success=false: ${result.message}`
									);
									return {
										success: false,
										message: result.message,
										data: result.comic,
									};
								}
							}

							// For comics with wanted.volume.id, use upsert logic
							console.log(
								"[GraphQL Import] Comic has wanted.volume.id - using upsert logic"
							);

							let condition = {
								"wanted.volume.id": wanted.volume.id,
							};

							let update: any = {
								$set: {
									rawFileDetails: payload.rawFileDetails,
									inferredMetadata: payload.inferredMetadata,
									sourcedMetadata: payload.sourcedMetadata,
								},
								$setOnInsert: {
									"wanted.source": payload.wanted.source,
									"wanted.markEntireVolumeWanted":
										payload.wanted.markEntireVolumeWanted,
									"wanted.volume": payload.wanted.volume,
								},
							};

							if (wanted.issues && wanted.issues.length > 0) {
								update.$addToSet = {
									"wanted.issues": { $each: wanted.issues },
								};
							}

							const options = {
								upsert: true,
								new: true,
							};

							const result = await Comic.findOneAndUpdate(
								condition,
								update,
								options
							);

							console.log(
								"[GraphQL Import] Document upserted:",
								result._id
							);

							// Trigger canonical metadata resolution via GraphQL
							try {
								console.log(
									"[GraphQL Import] Triggering metadata resolution..."
								);
								await this.broker.call("graphql.query", {
									query: `
										mutation ResolveMetadata($comicId: ID!) {
											resolveMetadata(comicId: $comicId) {
												id
											}
										}
									`,
									variables: { comicId: result._id.toString() },
								});
								console.log(
									"[GraphQL Import] Metadata resolution triggered"
								);
							} catch (resolveError) {
								console.error(
									"[GraphQL Import] Error resolving metadata:",
									resolveError
								);
								// Don't fail the import if resolution fails
							}

							return {
								success: true,
								message: "Document successfully upserted.",
								data: result,
							};
						} catch (error) {
							console.error("[GraphQL Import] Error:", error);
							throw new Errors.MoleculerError(
								"Operation failed.",
								500
							);
						}
					},
				},
				getComicsMarkedAsWanted: {
					rest: "GET /getComicsMarkedAsWanted",
					handler: async (ctx: Context<{}>) => {
						try {
							// Query to find comics where 'markEntireVolumeAsWanted' is true or 'issues' array is not empty
							const wantedComics = await Comic.find({
								wanted: { $exists: true },
								$or: [
									{ "wanted.markEntireVolumeWanted": true },
									{ "wanted.issues": { $not: { $size: 0 } } },
								],
							});

							console.log(wantedComics); // Output the found comics
							return wantedComics;
						} catch (error) {
							console.error("Error finding comics:", error);
							throw error;
						}
					},
				},

				applyComicVineMetadata: {
					rest: "POST /applyComicVineMetadata",
					params: {},
					async handler(
						ctx: Context<{
							match: {
								volume: { api_detail_url: string };
								volumeInformation: object;
							};
							comicObjectId: string;
						}>
					) {
						// 1. Find mongo object by id
						// 2. Import payload into sourcedMetadata.comicvine
						const comicObjectId = new ObjectId(
							ctx.params.comicObjectId
						);

						return new Promise(async (resolve, reject) => {
							let volumeDetails = {};
							const matchedResult = ctx.params.match;
							if (!isNil(matchedResult.volume)) {
								const volumeDetails = await this.broker.call(
									"comicvine.getVolumes",
									{
										volumeURI:
											matchedResult.volume.api_detail_url,
									}
								);
								matchedResult.volumeInformation =
									volumeDetails.results;
								Comic.findByIdAndUpdate(
									comicObjectId,
									{
										$set: {
											"sourcedMetadata.comicvine":
												matchedResult,
										},
									},
									{ new: true },
									(err, result) => {
										if (err) {
											console.info(err);
											reject(err);
										} else {
											// 3. Fetch and append volume information
											resolve(result);
										}
									}
								);
							}
						});
					},
				},
				applyAirDCPPDownloadMetadata: {
					rest: "POST /applyAirDCPPDownloadMetadata",
					params: {},
					async handler(
						ctx: Context<{
							bundleId: String;
							comicObjectId: String;
							name: String;
							size: Number;
							type: String;
						}>
					) {
						console.log(JSON.stringify(ctx.params, null, 2));
						const comicObjectId = new ObjectId(
							ctx.params.comicObjectId
						);

						return new Promise((resolve, reject) => {
							Comic.findByIdAndUpdate(
								comicObjectId,
								{
									$push: {
										"acquisition.directconnect.downloads": {
											bundleId: ctx.params.bundleId,
											name: ctx.params.name,
											size: ctx.params.size,
											type: ctx.params.type,
										},
									},
								},
								{ new: true, safe: true, upsert: true },
								(err, result) => {
									if (err) {
										reject(err);
									} else {
										resolve(result);
									}
								}
							);
						});
					},
				},
				applyTorrentDownloadMetadata: {
					rest: "POST /applyTorrentDownloadMetadata",
					handler: async (
						ctx: Context<{
							torrentToDownload: any;
							comicObjectId: String;
							infoHash: String;
							name: String;
							announce: [String];
						}>
					) => {
						const {
							name,
							torrentToDownload,
							comicObjectId,
							announce,
							infoHash,
						} = ctx.params;
						console.log(JSON.stringify(ctx.params, null, 4));
						try {
							return await Comic.findByIdAndUpdate(
								new ObjectId(comicObjectId),
								{
									$push: {
										"acquisition.torrent": {
											infoHash,
											name,
											announce,
										},
									},
								},
								{ new: true, safe: true, upsert: true }
							);
						} catch (err) {
							console.log(err);
						}
					},
				},
				getInfoHashes: {
					rest: "GET /getInfoHashes",
					handler: async (ctx: Context<{}>) => {
						try {
							return await Comic.aggregate([
								{
									$unwind: "$acquisition.torrent",
								},
								{
									$group: {
										_id: "$_id",
										infoHashes: {
											$push: "$acquisition.torrent.infoHash",
										},
									},
								},
							]);
						} catch (err) {
							return err;
						}
					},
				},
				getComicBooks: {
					rest: "POST /getComicBooks",
					params: {},
					async handler(
						ctx: Context<{
							paginationOptions: object;
							predicate: object;
						}>
					) {
						return await Comic.paginate(ctx.params.predicate, {
							...ctx.params.paginationOptions,
							// allowDiskUse: true,
						});
					},
				},
				getComicBookById: {
					rest: "POST /getComicBookById",
					params: { id: "string" },
					async handler(ctx: Context<{ id: string }>) {
						console.log(ctx.params.id);
						return await Comic.findById(
							new ObjectId(ctx.params.id)
						);
					},
				},
				getComicBooksByIds: {
					rest: "POST /getComicBooksByIds",
					params: { ids: "array" },
					handler: async (ctx: Context<{ ids: [string] }>) => {
						console.log(ctx.params.ids);
						const queryIds = ctx.params.ids.map(
							(id) => new ObjectId(id)
						);
						return await Comic.find({
							_id: {
								$in: queryIds,
							},
						});
					},
				},
				getComicBookGroups: {
					rest: "GET /getComicBookGroups",
					params: {},
					async handler(ctx: Context<{}>) {
						// 1. get volumes with issues mapped where issue count > 2
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
						return volumes;
					},
				},

				findIssuesForSeries: {
					rest: "POST /findIssueForSeries",
					params: {},
					handler: async (
						ctx: Context<{
							queryObjects: [
								{
									issueId: string;
									issueName: string;
									volumeName: string;
									issueNumber: string;
								}
							];
						}>
					) => {
						// 2a. Elasticsearch query
						const { queryObjects } = ctx.params;
						// construct the query for ElasticSearch
						let elasticSearchQuery = {};
						const elasticSearchQueries = queryObjects.map(
							(queryObject) => {
								console.log("Volume: ", queryObject.volumeName);
								console.log("Issue: ", queryObject.issueName);
								if (queryObject.issueName === null) {
									queryObject.issueName = "";
								}
								if (queryObject.volumeName === null) {
									queryObject.volumeName = "";
								}
								elasticSearchQuery = {
									bool: {
										must: [
											{
												match_phrase: {
													"rawFileDetails.name":
														queryObject.volumeName,
												},
											},
											{
												term: {
													"inferredMetadata.issue.number":
														parseInt(
															queryObject.issueNumber,
															10
														),
												},
											},
										],
									},
								};

								return [
									{
										index: "comics",
										search_type: "dfs_query_then_fetch",
									},
									{
										query: elasticSearchQuery,
									},
								];
							}
						);
						console.log(
							JSON.stringify(elasticSearchQueries, null, 2)
						);

						return await ctx.broker.call("search.searchComic", {
							elasticSearchQueries,
							queryObjects,
						});
					},
				},

				libraryStatistics: {
					rest: "GET /libraryStatistics",
					params: {},
					handler: async (ctx: Context<{}>) => {
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
													$in: [
														".cbr",
														".cbz",
														".cb7",
													],
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
									// mostPopulatCharacter: [],
								},
							},
						]);
						return {
							totalDocuments: totalCount,
							comicDirectorySize,
							statistics,
						};
					},
				},

				// This method belongs in library service,
				// because bundles can only exist for comics _in the library_
				// (wanted or imported)
				getBundles: {
					rest: "POST /getBundles",
					params: {},
					handler: async (
						ctx: Context<{
							comicObjectId: string;
							config: any;
						}>
					) => {
						try {
							// 1. Get the comic object Id
							const { config } = ctx.params;
							const comicObject = await Comic.findById(
								new ObjectId(ctx.params.comicObjectId)
							);
							// 2. Init AirDC++
							const ADCPPSocket = new AirDCPPSocket(config);
							await ADCPPSocket.connect();
							// 3. Get the bundles for the comic object
							if (comicObject) {
								// make the call to get the bundles from AirDC++ using the bundleId
								const bundles =
									comicObject.acquisition.directconnect.downloads.map(
										async (bundle) => {
											return await ADCPPSocket.get(
												`queue/bundles/${bundle.bundleId}`
											);
										}
									);
								return Promise.all(bundles);
							}
						} catch (error) {
							throw new Errors.MoleculerError(
								"Couldn't fetch bundles from AirDC++",
								500
							);
						}
					},
				},
				flushDB: {
					rest: "POST /flushDB",
					params: {},
					handler: async (ctx: Context<{}>) => {
						return await Comic.collection
							.drop()
							.then(async (data) => {
								console.info(data);
								const coversFolderDeleteResult =
									fsExtra.emptyDirSync(
										path.resolve(
											`${USERDATA_DIRECTORY}/covers`
										)
									);
								const expandedFolderDeleteResult =
									fsExtra.emptyDirSync(
										path.resolve(
											`${USERDATA_DIRECTORY}/expanded`
										)
									);
								const eSIndicesDeleteResult =
									await ctx.broker.call(
										"search.deleteElasticSearchIndices",
										{}
									);
								return {
									data,
									coversFolderDeleteResult,
									expandedFolderDeleteResult,
									eSIndicesDeleteResult,
								};
							})
							.catch((error) => error);
					},
				},
				unrarArchive: {
					rest: "POST /unrarArchive",
					params: {},
					timeout: 10000,
					async handler(
						ctx: Context<{
							filePath: string;
							options: IExtractionOptions;
						}>
					) {
						console.log(ctx.params);
					},
				},
			},
			methods: {},
		});
	}
}
