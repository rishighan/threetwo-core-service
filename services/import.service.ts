"use strict";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";

import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import {
	walkFolder,
	extractArchive,
	getCovers,
} from "../utils/uncompression.utils";
import {
	IExtractionOptions,
	IFolderData,
	IFolderResponse,
} from "../interfaces/folder.interface";

export default class ProductsService extends Service {
	// @ts-ignore
	public constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);
		console.log(DbMixin);
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
						hello: {
							rest: "POST /hello",
							params: {
								id: "string",
							},
							/** @param {Context} ctx  */
							async handler(
								ctx: Context<{ id: string; value: number }>
							) {
								return { koo: "loo" };
							},
						},
						getComicCovers: {
							rest: "POST /getComicCovers",
							params: {
								extractionOptions: "object",
								walkedFolders: "array",

							},

							async handler(
								ctx: Context<{
									extractionOptions: IExtractionOptions;
									walkedFolders: IFolderData[];
								}>
							) {
								console.log(ctx.params);
								const foo = await getCovers(
									ctx.params.extractionOptions,
									ctx.params.walkedFolders
								);
								return foo;
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
