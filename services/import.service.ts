"use strict";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";
import fs from "fs";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { map, flatten, isUndefined } from "lodash";
import {
	extractArchive,
	getCovers,
	walkFolder,
} from "../utils/uncompression.utils";
import {
	IExtractionOptions,
	IExtractedComicBookCoverFile,
	IFolderData,
} from "../interfaces/folder.interface";
import axios from "axios";
import { Readable } from "stream";
import through2 from "through2";
import oboe from "oboe";
import H from "highland";
import { stringify } from "highland-json";
const JsonStreamStringify = require("json-stream-stringify");
const IO = require("socket.io")();
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { ignore } = require("stream-json/filters/Ignore");
const { streamValues } = require("stream-json/streamers/StreamValues");
const StreamArray = require("stream-json/streamers/StreamArray");

export default class ProductsService extends Service {
	// @ts-ignore
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
						// 						getComicCovers: {
						// 							rest: "POST /getComicCovers",
						// 							params: {
						// 								extractionOptions: "object",
						// 								walkedFolders: "array",
						// 							},
						// 							async handler(
						// 								ctx: Context<{
						// 									extractionOptions: IExtractionOptions;
						// 									walkedFolders: IFolderData[];
						// 								}>
						// 							) {
						// 								switch (
						// 									ctx.params.extractionOptions.extractionMode
						// 								) {
						// 									case "bulk":
						// 										map(
						// 											ctx.params.walkedFolders,
						// 											async (folder, idx) => {
						// 												let foo = await extractArchive(
						// 													ctx.params
						// 														.extractionOptions,
						// 													folder
						// 												);
						// 												// console.log("levar", foo);
						// 												let jsonStream =
						// 													new JsonStreamStringify({
						// 														foo,
						// 													});
						// 												return jsonStream;
						// 											}
						// 										);
						//
						// 									case "single":
						// 										return await extractArchive(
						// 											ctx.params.extractionOptions,
						// 											ctx.params.walkedFolders[0]
						// 										);
						// 									default:
						// 										console.log(
						// 											"Unknown extraction mode selected."
						// 										);
						// 										return {
						// 											message:
						// 												"Unknown extraction mode selected.",
						// 											errorCode: "90",
						// 											data: `${ctx.params.extractionOptions}`,
						// 										};
						// 								}
						// 							},
						// 						},
					},
					methods: {},
				},
				schema
			)
		);
	}
}
