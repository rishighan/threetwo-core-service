"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import {
	resizeImage,
	calculateLevenshteinDistance,
} from "../utils/imagetransformation.utils";
import https from "https";
import fs from "fs";
import path from "path";

export default class ProductsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "imagetransformation" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "imagetransformation",
					mixins: [],
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
						resize: {
							rest: "POST /resizeImage",
							params: {},
							async handler(
								ctx: Context<{
									imageFile: string | Buffer;
									newWidth: number;
									newHeight: number;
									outputPath: string;
								}>
							) {
								const resizeResult = await resizeImage(
									ctx.params.imageFile,
									ctx.params.outputPath,
									ctx.params.newWidth,
									ctx.params.newHeight
								);
								return { resizeOperationStatus: resizeResult };
							},
						},
						calculateLevenshteinDistance: {
							rest: "POST /calculateLevenshteinDistance",
							params: {},
							async handler(
								ctx: Context<{
									imagePath: string;
									imagePath2: string;
									options: {
										match_id: string,
									};
								}>
							) {
								const fileName = ctx.params.options.match_id + "_" + path.basename(
									ctx.params.imagePath
								);
								return new Promise((resolve, reject) => {
									https.get(ctx.params.imagePath2, (response) => {
										const fileStream = response.pipe(
											fs.createWriteStream(
												`./userdata/temporary/${fileName}`
											)
										);
										fileStream.on("finish", async () => {
											const levenshteinDistance = await calculateLevenshteinDistance(
												ctx.params.imagePath,
												path.resolve(
													`./userdata/temporary/${fileName}`
												)
											);
											resolve(levenshteinDistance);
										});

									}).end();
								});


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
