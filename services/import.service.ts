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
import { walkFolder } from "../utils/file.utils";
import { convertXMLToJSON } from "../utils/xml.utils";
import https from "https";
const ObjectId = require("mongoose").Types.ObjectId;


export default class ProductsService extends Service {
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "import" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "import",
					mixins: [DbMixin("comics", Comic)],
					settings: {
						// Available fields in the responses
						fields: ["_id", "name", "quantity", "price"],

						// Validator for the `create` & `insert` actions.
						entityValidator: {
							name: "string|min:3",
							price: "number|positive",
						},
					},
					hooks: {},
					actions: {
						walkFolders: {
							rest: "POST /walkFolders",
							params: {
								basePathToWalk: "string",
							},
							async handler(
								ctx: Context<{ basePathToWalk: string }>
							) {
								return await walkFolder(
									ctx.params.basePathToWalk
								);
							},
						},
						convertXMLToJSON: {
							rest: "POST /convertXmlToJson",
							params: {},
							async handler(ctx: Context<{}>) {
								return convertXMLToJSON("lagos");
							},
						},
						rawImportToDB: {
							rest: "POST /rawImportToDB",
							params: {},
							async handler(ctx: Context<{ payload: object }>) {
								return new Promise((resolve, reject) => {
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
							async handler(ctx: Context<{ match: object, comicObjectId: string }>) {
								// 1. find mongo object by id
								// 2. import payload into sourcedMetadata.comicvine
								const comicObjectId = new ObjectId(ctx.params.comicObjectId);
								return new Promise((resolve, reject) => {
									Comic.findByIdAndUpdate(comicObjectId, { sourcedMetadata: { comicvine: ctx.params.match } }, { new: true }, (err, result) => {
										if (err) {
											console.log(err);
											reject(err);
										} else {
											// 3. Fetch and append volume information
											if (!isNil(result.sourcedMetadata.comicvine)) {
												https.get('https://comicvine.gamespot.com/api/volume/4050-50171/?api_key=a5fa0663683df8145a85d694b5da4b87e1c92c69&format=json&limit=1&offset=0&field_list=id,name,deck,image,first_issue,last_issue,publisher,count_of_issues', (resp) => {

													let data = '';
													resp.on('data', (chunk) => {
														data += chunk;
													});
													
													resp.on('end', () => {
														const volumeInformation = JSON.parse(data);
														result.sourcedMetadata.comicvine.volumeInformation = volumeInformation.results;
														resolve(result);
													});

												}).on("error", (err) => {
													console.log("Error: " + err.message);
												});
											}
											
										}
									})
								});
							}
						},
						getComicBooks: {
							rest: "POST /getComicBooks",
							params: {},
							async handler(
								ctx: Context<{ paginationOptions: object }>
							) {
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
					},
					methods: {},
				},
				schema
			)
		);
	}
}
