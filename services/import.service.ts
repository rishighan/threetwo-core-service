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
import { isNil, isUndefined, map } from "lodash";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { explodePath, walkFolder } from "../utils/file.utils";
import { convertXMLToJSON } from "../utils/xml.utils";
import https from "https";
import {
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
} from "threetwo-ui-typings";
import { unrarArchive } from "../utils/uncompression.utils";
import { extractCoverFromFile2 } from "../utils/uncompression.utils";
import { scrapeIssuesFromDOM } from "../utils/scraping.utils";
import axios from "axios";
const ObjectId = require("mongoose").Types.ObjectId;
import fsExtra from "fs-extra";
const through2 = require("through2");
import klaw from "klaw";
import path from "path";
import { COMICS_DIRECTORY, USERDATA_DIRECTORY } from "../constants/directories";

console.log(process.env.MONGO_URI);
export default class ImportService extends Service {
	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "import",
			mixins: [DbMixin("comics", Comic)],
			hooks: {},
			actions: {
				walkFolders: {
					rest: "POST /walkFolders",
					params: {
						basePathToWalk: "string",
					},
					async handler(ctx: Context<{ basePathToWalk: string }>) {
						return await walkFolder(ctx.params.basePathToWalk, [
							".cbz",
							".cbr",
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
				newImport: {
					rest: "POST /newImport",
					params: {},
					async handler(
						ctx: Context<{
							extractionOptions?: any;
						}>
					) {
						// 1. Walk the Source folder

						klaw(path.resolve(COMICS_DIRECTORY))
							// 1.1 Filter on .cb* extensions
							.pipe(
								through2.obj(function (item, enc, next) {
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
									// 2. Send the extraction job to the queue
									await broker.call("libraryqueue.enqueue", {
										fileObject: {
											filePath: item.path,
											fileSize: item.stats.size,
										},
									});
								} else {
									console.log(
										"Comic already exists in the library."
									);
								}
							})
							.on("end", () => {
								console.log("Import process complete.");
							});
					},
				},
				nicefyPath: {
					rest: "POST /nicefyPath",
					params: {},
					async handler(
						ctx: Context<{
							filePath: string;
						}>
					) {
						return explodePath(ctx.params.filePath);
					},
				},
				processAndImportToDB: {
					rest: "POST /processAndImportToDB",

					params: {},
					async handler(
						ctx: Context<{
							walkedFolder: {
								name: string;
								path: string;
								extension: string;
								containedIn: string;
								fileSize: number;
								isFile: boolean;
								isLink: boolean;
							};
						}>
					) {
						try {
							const { walkedFolder } = ctx.params;
							let comicExists = await Comic.exists({
								"rawFileDetails.name": `${walkedFolder.name}`,
							});
							// rough flow of import process
							// 1. Walk folder
							// 2. For each folder, call extract function
							// 3. For each successful extraction, run dbImport

							if (!comicExists) {
								// 1. Extract cover and cover metadata
								let comicBookCoverMetadata:
									| IExtractedComicBookCoverFile
									| IExtractComicBookCoverErrorResponse
									| IExtractedComicBookCoverFile[] = await extractCoverFromFile2(
									walkedFolder[0]
								);

								// 2. Add to mongo
								const dbImportResult = await this.broker.call(
									"import.rawImportToDB",
									{
										importStatus: {
											isImported: true,
											tagged: false,
											matchedResult: {
												score: "0",
											},
										},
										rawFileDetails: comicBookCoverMetadata,
										sourcedMetadata: {
											comicvine: {},
										},
									},
									{}
								);

								return {
									comicBookCoverMetadata,
									dbImportResult,
								};
							} else {
								console.info(
									`Comic: \"${walkedFolder.name}\" already exists in the database`
								);
							}
						} catch (error) {
							console.error("Error importing comic books", error);
						}
					},
				},
				rawImportToDB: {
					rest: "POST /rawImportToDB",
					params: {},
					async handler(
						ctx: Context<{
							sourcedMetadata: {
								comicvine: {
									volume: { api_detail_url: string };
									volumeInformation: {};
								};
							};
							rawFileDetails: {
								name: string;
							};
						}>
					) {
						let volumeDetails;
						const comicMetadata = ctx.params;
						if (
							comicMetadata.sourcedMetadata.comicvine &&
							!isNil(
								comicMetadata.sourcedMetadata.comicvine.volume
							)
						) {
							volumeDetails =
								await this.getComicVineVolumeMetadata(
									comicMetadata.sourcedMetadata.comicvine
										.volume.api_detail_url
								);
							comicMetadata.sourcedMetadata.comicvine.volumeInformation =
								volumeDetails;
						}
						return new Promise(async (resolve, reject) => {
							Comic.create(ctx.params, (error, data) => {
								if (data) {
									resolve(data);
								} else if (error) {
									throw new Errors.MoleculerError(
										"Failed to import comic book",
										400,
										"IMS_FAILED_COMIC_BOOK_IMPORT",
										data
									);
								}
							});
						});
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
						const matchedResult = ctx.params.match;
						let volumeDetailsPromise;
						if (!isNil(matchedResult.volume)) {
							volumeDetailsPromise =
								this.getComicVineVolumeMetadata(
									matchedResult.volume.api_detail_url
								);
						}
						return new Promise(async (resolve, reject) => {
							const volumeDetails = await volumeDetailsPromise;
							matchedResult.volumeInformation = volumeDetails;
							Comic.findByIdAndUpdate(
								comicObjectId,
								{
									sourcedMetadata: {
										comicvine: matchedResult,
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
						});
					},
				},
				applyAirDCPPDownloadMetadata: {
					rest: "POST /applyAirDCPPDownloadMetadata",
					params: {},
					async handler(
						ctx: Context<{
							comicObjectId: string;
							resultId: string;
							bundleId: string;
							directoryIds: [];
							searchInstanceId: string;
						}>
					) {
						const comicObjectId = new ObjectId(
							ctx.params.comicObjectId
						);
						return new Promise((resolve, reject) => {
							Comic.findByIdAndUpdate(
								comicObjectId,
								{
									$push: {
										"acquisition.directconnect": {
											resultId: ctx.params.resultId,
											bundleId: ctx.params.bundleId,
											directoryIds:
												ctx.params.directoryIds,
											searchInstanceId:
												ctx.params.searchInstanceId,
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
					async handler(ctx: Context<{ paginationOptions: object }>) {
						return await Comic.paginate(
							{},
							ctx.params.paginationOptions
						);
					},
				},
				getComicBookById: {
					rest: "POST /getComicBookById",
					params: { id: "string" },
					async handler(ctx: Context<{ id: string }>) {
						return await Comic.findById(ctx.params.id);
					},
				},
				getComicBookGroups: {
					rest: "GET /getComicBookGroups",
					params: {},
					async handler(ctx: Context<{}>) {
						let volumesMetadata = [];
						// 1. get volumes with issues mapped where issue count > 2
						const volumes = await Comic.aggregate([
							{
								$group: {
									_id: "$sourcedMetadata.comicvine.volume.id",
									comicObjectId: { $first: "$_id" },
									volumeURI: {
										$last: "$sourcedMetadata.comicvine.volume.api_detail_url",
									},
									count: { $sum: 1 },
								},
							},
							{
								$match: {
									count: { $gte: 1 },
								},
							},
							{ $sort: { updatedAt: -1 } },
							{ $skip: 0 },
							{ $limit: 5 },
						]);
						// 2. Map over the aggregation result and get volume metadata from CV
						// 2a. Make a call to comicvine-service
						volumesMetadata = map(volumes, async (volume) => {
							console.log(volume);
							if (!isNil(volume.volumeURI)) {
								const volumeMetadata = await ctx.call(
									"comicvine.getVolumes",
									{
										volumeURI: volume.volumeURI,
										data: {
											format: "json",
											fieldList:
												"id,name,deck,api_detail_url",
											limit: "1",
											offset: "0",
										},
									}
								);
								volumeMetadata["comicObjectId"] =
									volume.comicObjectId;
								return volumeMetadata;
							}
						});

						return Promise.all(volumesMetadata);
					},
				},
				findIssuesForSeriesInLibrary: {
					rest: "POST /findIssuesForSeriesInLibrary",
					params: {},
					handler: async (
						ctx: Context<{ comicObjectID: string }>
					) => {
						// 1. Query mongo to get the comic document by its _id
						const comicBookDetails: any = await this.broker.call(
							"import.getComicBookById",
							{ id: ctx.params.comicObjectID }
						);

						// 2. Query CV and get metadata for them
						const foo =
							await comicBookDetails.sourcedMetadata.comicvine.volumeInformation.issues.map(
								async (issue: any, idx: any) => {
									const metadata: any = await axios.request({
										url: `${issue.api_detail_url}?api_key=${process.env.COMICVINE_API_KEY}`,
										params: {
											resources: "issues",
											limit: "100",
											format: "json",
										},
										headers: {
											"User-Agent": "ThreeTwo",
										},
									});
									const issueMetadata = metadata.data.results;

									// 2a. Enqueue the Elasticsearch job
									if (
										!isUndefined(issueMetadata.volume.name) &&
										!isUndefined(issueMetadata.issue_number)
									) {
										await ctx.broker.call(
											"libraryqueue.issuesForSeries",
											{
												queryObject: {
													issueId: issue.id,
													issueName:
														issueMetadata.volume
															.name,
													issueNumber:
														issueMetadata.issue_number,
													issueMetadata,
												},
											}
										);
									}
									// 3. Just return the issues
									return issueMetadata;
								}
							);
						return Promise.all(foo);
					},
				},
				flushDB: {
					rest: "POST /flushDB",
					params: {},
					async handler(ctx: Context<{}>) {
						return await Comic.collection
							.drop()
							.then((data) => {
								console.info(data);
								const foo = fsExtra.emptyDirSync(
									path.resolve(`${USERDATA_DIRECTORY}/covers`)
								);
								const foo2 = fsExtra.emptyDirSync(
									path.resolve(
										`${USERDATA_DIRECTORY}/expanded`
									)
								);
								return { data, foo, foo2 };
							})
							.catch((error) => error);
					},
				},
				scrapeIssueNamesFromDOM: {
					rest: "POST /scrapeIssueNamesFromDOM",
					params: {},
					async handler(ctx: Context<{ html: string }>) {
						return scrapeIssuesFromDOM(ctx.params.html);
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
						return await unrarArchive(
							ctx.params.filePath,
							ctx.params.options
						);
					},
				},
			},
			methods: {
				getComicVineVolumeMetadata: (apiDetailURL) =>
					new Promise((resolve, reject) => {
						const options = {
							headers: {
								"User-Agent": "ThreeTwo",
							},
						};
						return https
							.get(
								`${apiDetailURL}?api_key=${process.env.COMICVINE_API_KEY}&format=json&limit=1&offset=0`,
								options,
								(resp) => {
									let data = "";
									resp.on("data", (chunk) => {
										data += chunk;
									});

									resp.on("end", () => {
										console.log(
											`${apiDetailURL} returned data.`
										);
										const volumeInformation =
											JSON.parse(data);
										resolve(volumeInformation.results);
									});
								}
							)
							.on("error", (err) => {
								console.info("Error: " + err.message);
								reject(err);
							});
					}),
			},
		});
	}
}
