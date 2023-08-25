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
					params: {
						basePathToWalk: "string",
					},
					async handler(ctx: Context<{ basePathToWalk: string }>) {
						return await walkFolder(ctx.params.basePathToWalk, [
							".cbz",
							".cbr",
							".cb7",
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
						ctx: Context<{ filePath: string; options: any }>
					) => {
						await broker.call("importqueue.uncompressResize", {
							filePath: ctx.params.filePath,
							options: ctx.params.options,
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
						}>
					) {
						try {
							// 1. Walk the Source folder
							klaw(path.resolve(COMICS_DIRECTORY))
								// 1.1 Filter on .cb* extensions
								.pipe(
									through2.obj(function(item, enc, next) {
										let fileExtension = path.extname(item.path);
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
										await pubClient.set("completedJobCount", 0);
										await pubClient.set("failedJobCount", 0);
										// 2.2 Send the extraction job to the queue
										this.broker.call('jobqueue.enqueue', {
											fileObject: {
												filePath: item.path,
												fileSize: item.stats.size,
											},
											importType: "new",
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
									comicvine?: {
										volume: { api_detail_url: string };
										volumeInformation: {};
									};
									locg?: {};
								};
								inferredMetadata: {
									issue: Object;
								};
								rawFileDetails: {
									name: string;
								};
								acquisition: {
									source: {
										wanted: boolean;
										name?: string;
									};
									directconnect: {
										downloads: [];
									};
								};
							};
						}>
					) {
						try {
							let volumeDetails;
							const comicMetadata = ctx.params.payload;
							// When an issue is added from the search CV feature
							// we solicit volume information and add that to mongo
							if (
								comicMetadata.sourcedMetadata.comicvine &&
								!isNil(
									comicMetadata.sourcedMetadata.comicvine
										.volume
								)
							) {
								volumeDetails = await this.broker.call(
									"comicvine.getVolumes",
									{
										volumeURI:
											comicMetadata.sourcedMetadata
												.comicvine.volume
												.api_detail_url,
									}
								);
								comicMetadata.sourcedMetadata.comicvine.volumeInformation =
									volumeDetails.results;
							}

							console.log("Saving to Mongo...");
							console.log(
								`Import type: [${ctx.params.importType}]`
							);
							switch (ctx.params.importType) {
								case "new":
									return await Comic.create(comicMetadata);
								case "update":
									return await Comic.findOneAndUpdate(
										{
											"acquisition.directconnect.downloads.bundleId":
												ctx.params.bundleId,
										},
										comicMetadata,
										{
											upsert: true,
											new: true,
										}
									);
								default:
									return false;
							}
						} catch (error) {
							console.log(error);
							throw new Errors.MoleculerError(
								"Import failed.",
								500
							);
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
						return await Comic.findById(ctx.params.id);
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
