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

export default class LibraryService extends Service {
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "library" }
	) {
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
							extensions: string[];
						}>
					) {
						console.log(ctx.params);
						return await walkFolder(ctx.params.basePathToWalk, [
							".cbz",
							".cbr",
							".cb7",
							...ctx.params.extensions,
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
					async handler(ctx) {
						const { sessionId } = ctx.params;
						try {
							// Initialize Redis counters once at the start of the import
							await pubClient.set("completedJobCount", 0);
							await pubClient.set("failedJobCount", 0);

							// Convert klaw to use a promise-based approach for better flow control
							const files = await this.getComicFiles(
								COMICS_DIRECTORY
							);
							for (const file of files) {
								console.info(
									"Found a file at path:",
									file.path
								);
								const comicExists = await Comic.exists({
									"rawFileDetails.name": path.basename(
										file.path,
										path.extname(file.path)
									),
								});

								if (!comicExists) {
									// Send the extraction job to the queue
									await this.broker.call("jobqueue.enqueue", {
										fileObject: {
											filePath: file.path,
											fileSize: file.stats.size,
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
							}
							console.log("All files traversed.");
						} catch (error) {
							console.error(
								"Error during newImport processing:",
								error
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
								};
								inferredMetadata: {
									issue: Object;
								};
								rawFileDetails: {
									name: string;
								};
								wanted: {
									issues: [];
									volume: { id: number };
									source: string;
									markEntireVolumeWanted: Boolean;
								};
								acquisition: {
									directconnect: {
										downloads: [];
									};
								};
							};
						}>
					) {
						try {
							console.log(
								JSON.stringify(ctx.params.payload, null, 4)
							);
							const { payload } = ctx.params;
							const { wanted } = payload;

							console.log("Saving to Mongo...");

							if (
								!wanted ||
								!wanted.volume ||
								!wanted.volume.id
							) {
								console.log(
									"No valid identifier for upsert. Attempting to create a new document with minimal data..."
								);
								const newDocument = new Comic(payload); // Using the entire payload for the new document

								await newDocument.save();
								return {
									success: true,
									message:
										"New document created due to lack of valid identifiers.",
									data: newDocument,
								};
							}

							let condition = {
								"wanted.volume.id": wanted.volume.id,
							};

							let update: any = {
								// Using 'any' to bypass strict type checks; alternatively, define a more accurate type
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
								"Operation completed. Document updated or inserted:",
								result
							);

							return {
								success: true,
								message: "Document successfully upserted.",
								data: result,
							};
						} catch (error) {
							console.log(error);
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
			methods: {
				// Method to walk the directory and filter comic files
				getComicFiles: (directory) => {
					return new Promise((resolve, reject) => {
						const files = [];
						klaw(directory)
							.pipe(
								through2.obj(function (item, enc, next) {
									const fileExtension = path.extname(
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
							.on("data", (item) => {
								files.push(item);
							})
							.on("end", () => resolve(files))
							.on("error", (err) => reject(err));
					});
				},
			},
		});
	}
}
