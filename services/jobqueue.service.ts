import { Context, Service, ServiceBroker } from "moleculer";
import JobResult from "../models/jobresult.model";
import { refineQuery } from "filename-parser";
import BullMqMixin from "moleculer-bullmq";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
const ObjectId = require("mongoose").Types.ObjectId;
import {
	extractFromArchive,
	uncompressEntireArchive,
} from "../utils/uncompression.utils";
import { isNil, isUndefined } from "lodash";
import { pubClient } from "../config/redis.config";
import path from "path";
const { MoleculerError } = require("moleculer").Errors;

console.log(process.env.REDIS_URI);
export default class JobQueueService extends Service {
	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "jobqueue",
			hooks: {},
			mixins: [DbMixin("comics", Comic), BullMqMixin],
			settings: {
				bullmq: {
					client: process.env.REDIS_URI,
				},
			},
			actions: {
				getJobCountsByType: {
					rest: "GET /getJobCountsByType",
					handler: async (ctx: Context<{}>) => {
						console.log(ctx.params);
						return await this.$resolve("jobqueue").getJobCounts();
					},
				},
				toggle: {
					rest: "GET /toggle",
					handler: async (ctx: Context<{ action: String }>) => {
						switch (ctx.params.action) {
							case "pause":
								this.pause();
								break;
							case "resume":
								this.resume();
								break;
							default:
								console.log(`Unknown queue action.`);
						}
					},
				},

				enqueue: {
					queue: true,
					rest: "GET /enqueue",
					handler: async (
						ctx: Context<{ action: string; description: string }>
					) => {
						const { action, description } = ctx.params;
						// Enqueue the job
						const job = await this.localQueue(
							ctx,
							action,
							ctx.params,
							{
								priority: 10,
							}
						);
						console.log(`Job ${job.id} enqueued`);
						console.log(`${description}`);

						return job.id;
					},
				},

				// Comic Book Import Job Queue - Enhanced for better metadata handling
				"enqueue.async": {
					handler: async (
						ctx: Context<{
							sessionId: String;
						}>
					) => {
						try {
							console.log(
								`Received Job ID ${ctx.locals.job.id}, processing...`
							);
							// 1. De-structure the job params
							const { fileObject } = ctx.locals.job.data.params;

							// 2. Extract metadata from the archive
							const result = await extractFromArchive(
								fileObject.filePath
							);
							const {
								name,
								filePath,
								fileSize,
								extension,
								mimeType,
								cover,
								containedIn,
								comicInfoJSON,
							} = result;

							// 3a. Infer any issue-related metadata from the filename
							const { inferredIssueDetails } = refineQuery(
								result.name
							);
							console.log(
								"Issue metadata inferred: ",
								JSON.stringify(inferredIssueDetails, null, 2)
							);

							// 3b. Prepare sourced metadata from various sources
							let sourcedMetadata = {
								comicInfo: comicInfoJSON || {},
								comicvine: {},
								metron: {},
								gcd: {},
								locg: {}
							};

							// Include any external metadata if provided
							if (!isNil(ctx.locals.job.data.params.sourcedMetadata)) {
								const providedMetadata = ctx.locals.job.data.params.sourcedMetadata;
								sourcedMetadata = {
									...sourcedMetadata,
									...providedMetadata
								};
							}

							// 3c. Prepare inferred metadata matching Comic model structure
							const inferredMetadata = {
								series: inferredIssueDetails?.name || "Unknown Series",
								issue: {
									name: inferredIssueDetails?.name || "Unknown Series",
									number: inferredIssueDetails?.number || 1,
									subtitle: inferredIssueDetails?.subtitle || "",
									year: inferredIssueDetails?.year || new Date().getFullYear().toString()
								},
								volume: 1, // Default volume since not available in inferredIssueDetails
								title: inferredIssueDetails?.name || path.basename(filePath, path.extname(filePath))
							};

							// 3d. Create canonical metadata - user-curated values with source attribution
							const canonicalMetadata = this.createCanonicalMetadata(sourcedMetadata, inferredMetadata);

							// 3e. Create comic payload with canonical metadata structure
							const comicPayload = {
								// File details
								rawFileDetails: {
									name,
									filePath,
									fileSize,
									extension,
									mimeType,
									containedIn,
									cover,
								},
								
								// Enhanced sourced metadata (now supports more sources)
								sourcedMetadata,
								
								// Original inferred metadata
								inferredMetadata,

								// New canonical metadata - user-curated values with source attribution
								canonicalMetadata,

								// Import status
								"acquisition.source.wanted": false,
								"acquisition.source.name": ctx.locals.job.data.params.sourcedFrom,
							};

							// 3f. Add bundleId if present
							let bundleId = null;
							if (!isNil(ctx.locals.job.data.params.bundleId)) {
								bundleId = ctx.locals.job.data.params.bundleId;
							}

							// 4. Use library service to import with enhanced metadata
							const importResult = await this.broker.call(
								"library.importFromJob",
								{
									importType: ctx.locals.job.data.params.importType,
									bundleId,
									payload: comicPayload,
								}
							);

							return {
								data: {
									importResult,
								},
								id: ctx.locals.job.id,
								sessionId: ctx.params.sessionId,
							};
						} catch (error) {
							console.error(
								`An error occurred processing Job ID ${ctx.locals.job.id}`
							);
							throw new MoleculerError(
								error,
								500,
								"ENHANCED_IMPORT_JOB_ERROR",
								{
									data: ctx.params.sessionId,
								}
							);
						}
					},
				},
				getJobResultStatistics: {
					rest: "GET /getJobResultStatistics",
					handler: async (ctx: Context<{}>) => {
						return await JobResult.aggregate([
							{
								$group: {
									_id: {
										sessionId: "$sessionId",
										status: "$status",
									},
									earliestTimestamp: {
										$min: "$timestamp",
									},
									count: {
										$sum: 1,
									},
								},
							},
							{
								$group: {
									_id: "$_id.sessionId",
									statuses: {
										$push: {
											status: "$_id.status",
											earliestTimestamp:
												"$earliestTimestamp",
											count: "$count",
										},
									},
								},
							},
							{
								$project: {
									_id: 0,
									sessionId: "$_id",
									completedJobs: {
										$reduce: {
											input: "$statuses",
											initialValue: 0,
											in: {
												$sum: [
													"$$value",
													{
														$cond: [
															{
																$eq: [
																	"$$this.status",
																	"completed",
																],
															},
															"$$this.count",
															0,
														],
													},
												],
											},
										},
									},
									failedJobs: {
										$reduce: {
											input: "$statuses",
											initialValue: 0,
											in: {
												$sum: [
													"$$value",
													{
														$cond: [
															{
																$eq: [
																	"$$this.status",
																	"failed",
																],
															},
															"$$this.count",
															0,
														],
													},
												],
											},
										},
									},
									earliestTimestamp: {
										$min: "$statuses.earliestTimestamp",
									},
								},
							},
						]);
					},
				},
				"uncompressFullArchive.async": {
					rest: "POST /uncompressFullArchive",
					handler: async (
						ctx: Context<{
							filePath: string;
							comicObjectId: string;
							options: any;
						}>
					) => {
						console.log(
							`Received Job ID ${JSON.stringify(
								ctx.locals
							)}, processing...`
						);
						const { filePath, options, comicObjectId } = ctx.params;
						const comicId = new ObjectId(comicObjectId);
						// 2. Extract metadata from the archive
						const result: string[] = await uncompressEntireArchive(
							filePath,
							options
						);
						if (Array.isArray(result) && result.length !== 0) {
							// Get the containing directory of the uncompressed archive
							const directoryPath = path.dirname(result[0]);
							// Add to mongo object
							await Comic.findByIdAndUpdate(
								comicId,
								{
									$set: {
										"rawFileDetails.archive": {
											uncompressed: true,
											expandedPath: directoryPath,
										},
									},
								},
								{ new: true, safe: true, upsert: true }
							);
							return result;
						}
					},
				},
			},

			events: {
				async "uncompressFullArchive.async.active"(
					ctx: Context<{ id: number }>
				) {
					console.log(
						`Uncompression Job ID ${ctx.params.id} is set to active.`
					);
				},
				async "uncompressFullArchive.async.completed"(
					ctx: Context<{ id: number }>
				) {
					console.log(
						`Uncompression Job ID ${ctx.params.id} completed.`
					);
					const job = await this.job(ctx.params.id);
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "LS_UNCOMPRESSION_JOB_COMPLETE",
						args: [
							{
								uncompressedArchive: job.returnvalue,
							},
						],
					});
					return job.returnvalue;
				},
				// use the `${QUEUE_NAME}.QUEUE_EVENT` scheme
				async "enqueue.async.active"(ctx: Context<{ id: Number }>) {
					console.log(`Job ID ${ctx.params.id} is set to active.`);
				},
				async drained(ctx) {
					console.log("Queue drained.");
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "LS_IMPORT_QUEUE_DRAINED",
						args: [
							{
								message: "drained",
							},
						],
					});
				},
				async "enqueue.async.completed"(ctx: Context<{ id: Number }>) {
					// 1. Fetch the job result using the job Id
					const job = await this.job(ctx.params.id);
					// 2. Increment the completed job counter
					await pubClient.incr("completedJobCount");
					// 3. Fetch the completed job count for the final payload to be sent to the client
					const completedJobCount = await pubClient.get(
						"completedJobCount"
					);
					// 4. Emit the LS_COVER_EXTRACTED event with the necessary details
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "LS_COVER_EXTRACTED",
						args: [
							{
								completedJobCount,
								importResult: job.returnvalue.data.importResult,
							},
						],
					});
					// 5. Persist the job results in mongo for posterity
					await JobResult.create({
						id: ctx.params.id,
						status: "completed",
						timestamp: job.timestamp,
						sessionId: job.returnvalue.sessionId,
						failedReason: {},
					});

					console.log(`Job ID ${ctx.params.id} completed.`);
				},

				async "enqueue.async.failed"(ctx) {
					const job = await this.job(ctx.params.id);
					await pubClient.incr("failedJobCount");
					const failedJobCount = await pubClient.get(
						"failedJobCount"
					);

					await JobResult.create({
						id: ctx.params.id,
						status: "failed",
						failedReason: job.failedReason,
						sessionId: job.data.params.sessionId,
						timestamp: job.timestamp,
					});

					// 4. Emit the LS_COVER_EXTRACTION_FAILED event with the necessary details
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "LS_COVER_EXTRACTION_FAILED",
						args: [
							{
								failedJobCount,
								importResult: job,
							},
						],
					});
				},
			},
			methods: {
				/**
				 * Create canonical metadata structure with source attribution for user-driven curation
				 * @param sourcedMetadata - Metadata from various external sources
				 * @param inferredMetadata - Metadata inferred from filename/file analysis
				 */
				createCanonicalMetadata(sourcedMetadata: any, inferredMetadata: any) {
					const currentTime = new Date();
					
					// Priority order: comicInfo -> comicvine -> metron -> gcd -> locg -> inferred
					const sourcePriority = ['comicInfo', 'comicvine', 'metron', 'gcd', 'locg'];

					// Helper function to extract actual value from metadata (handle arrays, etc.)
					const extractValue = (value: any) => {
						if (Array.isArray(value)) {
							return value.length > 0 ? value[0] : null;
						}
						return value;
					};

					// Helper function to find the best value and its source
					const findBestValue = (fieldName: string, defaultValue: any = null, defaultSource: string = 'inferred') => {
						for (const source of sourcePriority) {
							const rawValue = sourcedMetadata[source]?.[fieldName];
							if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
								const extractedValue = extractValue(rawValue);
								if (extractedValue !== null && extractedValue !== '') {
									return {
										value: extractedValue,
										source: source,
										userSelected: false,
										lastModified: currentTime
									};
								}
							}
						}
						return {
							value: defaultValue,
							source: defaultSource,
							userSelected: false,
							lastModified: currentTime
						};
					};

					// Helper function for series-specific field resolution
					const findSeriesValue = (fieldNames: string[], defaultValue: any = null) => {
						for (const source of sourcePriority) {
							const metadata = sourcedMetadata[source];
							if (metadata) {
								for (const fieldName of fieldNames) {
									const rawValue = metadata[fieldName];
									if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
										const extractedValue = extractValue(rawValue);
										if (extractedValue !== null && extractedValue !== '') {
											return {
												value: extractedValue,
												source: source,
												userSelected: false,
												lastModified: currentTime
											};
										}
									}
								}
							}
						}
						return {
							value: defaultValue,
							source: 'inferred',
							userSelected: false,
							lastModified: currentTime
						};
					};

					const canonical: any = {
						// Core identifying information
						title: findBestValue('title', inferredMetadata.title),

						// Series information
						series: {
							name: findSeriesValue(['series', 'seriesName', 'name'], inferredMetadata.series),
							volume: findBestValue('volume', inferredMetadata.volume || 1),
							startYear: findBestValue('startYear', inferredMetadata.issue?.year ? parseInt(inferredMetadata.issue.year) : new Date().getFullYear())
						},

						// Issue information
						issueNumber: findBestValue('issueNumber', inferredMetadata.issue?.number?.toString() || "1"),

						// Publishing information
						publisher: findBestValue('publisher', null),
						publicationDate: findBestValue('publicationDate', null),
						coverDate: findBestValue('coverDate', null),

						// Content information
						pageCount: findBestValue('pageCount', null),
						summary: findBestValue('summary', null),

						// Creator information - collect from all sources for richer data
						creators: [],

						// Character and genre arrays with source tracking
						characters: {
							values: [],
							source: 'inferred',
							userSelected: false,
							lastModified: currentTime
						},

						genres: {
							values: [],
							source: 'inferred',
							userSelected: false,
							lastModified: currentTime
						},

						// Canonical metadata tracking
						lastCanonicalUpdate: currentTime,
						hasUserModifications: false,

						// Quality and completeness tracking
						completeness: {
							score: 0,
							missingFields: [],
							lastCalculated: currentTime
						}
					};

					// Handle creators - combine from all sources but track source attribution
					const allCreators: any[] = [];
					for (const source of sourcePriority) {
						const metadata = sourcedMetadata[source];
						if (metadata?.creators) {
							metadata.creators.forEach((creator: any) => {
								allCreators.push({
									name: extractValue(creator.name),
									role: extractValue(creator.role),
									source: source,
									userSelected: false,
									lastModified: currentTime
								});
							});
						} else {
							// Handle legacy writer/artist fields
							if (metadata?.writer) {
								allCreators.push({
									name: extractValue(metadata.writer),
									role: 'Writer',
									source: source,
									userSelected: false,
									lastModified: currentTime
								});
							}
							if (metadata?.artist) {
								allCreators.push({
									name: extractValue(metadata.artist),
									role: 'Artist',
									source: source,
									userSelected: false,
									lastModified: currentTime
								});
							}
						}
					}
					canonical.creators = allCreators;

					// Handle characters - combine from all sources
					const allCharacters = new Set();
					let characterSource = 'inferred';
					for (const source of sourcePriority) {
						if (sourcedMetadata[source]?.characters && sourcedMetadata[source].characters.length > 0) {
							sourcedMetadata[source].characters.forEach((char: string) => allCharacters.add(char));
							if (characterSource === 'inferred') characterSource = source; // Use the first source found
						}
					}
					canonical.characters = {
						values: Array.from(allCharacters),
						source: characterSource,
						userSelected: false,
						lastModified: currentTime
					};

					// Handle genres - combine from all sources
					const allGenres = new Set();
					let genreSource = 'inferred';
					for (const source of sourcePriority) {
						if (sourcedMetadata[source]?.genres && sourcedMetadata[source].genres.length > 0) {
							sourcedMetadata[source].genres.forEach((genre: string) => allGenres.add(genre));
							if (genreSource === 'inferred') genreSource = source; // Use the first source found
						}
					}
					canonical.genres = {
						values: Array.from(allGenres),
						source: genreSource,
						userSelected: false,
						lastModified: currentTime
					};

					// Calculate completeness score
					const requiredFields = ['title', 'series.name', 'issueNumber', 'publisher'];
					const optionalFields = ['publicationDate', 'coverDate', 'pageCount', 'summary'];
					const missingFields = [];
					let filledCount = 0;

					// Check required fields
					requiredFields.forEach(field => {
						const fieldPath = field.split('.');
						let value = canonical;
						for (const path of fieldPath) {
							value = value?.[path];
						}
						if (value?.value) {
							filledCount++;
						} else {
							missingFields.push(field);
						}
					});

					// Check optional fields
					optionalFields.forEach(field => {
						if (canonical[field]?.value) {
							filledCount++;
						}
					});

					const totalFields = requiredFields.length + optionalFields.length;
					canonical.completeness = {
						score: Math.round((filledCount / totalFields) * 100),
						missingFields: missingFields,
						lastCalculated: currentTime
					};

					return canonical;
				}
			},
		});
	}
}
