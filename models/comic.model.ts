const paginate = require("mongoose-paginate-v2");
const { Client } = require("@elastic/elasticsearch");
import ComicVineMetadataSchema from "./comicvine.metadata.model";
import { mongoosastic } from "mongoosastic-ts";
const mongoose = require("mongoose")
import {
	MongoosasticDocument,
	MongoosasticModel,
	MongoosasticPluginOpts,
} from "mongoosastic-ts/dist/types";
const ELASTICSEARCH_HOST =
	process.env.ELASTICSEARCH_URI || "http://localhost:9200";
console.log(`ELASTICSEARCH -> ${ELASTICSEARCH_HOST}`);
export const eSClient = new Client({
	node: ELASTICSEARCH_HOST,
	auth: {
		username: "elastic",
		password: "password",
	},
});

const RawFileDetailsSchema = mongoose.Schema({
	_id: false,
	name: String,
	filePath: String,
	fileSize: Number,
	extension: String,
	mimeType: String,
	containedIn: String,
	pageCount: Number,
	cover: {
		filePath: String,
		stats: Object,
	},
});

const LOCGSchema = mongoose.Schema({
	_id: false,
	name: String,
	publisher: String,
	url: String,
	cover: String,
	description: String,
	price: String,
	rating: Number,
	pulls: Number,
	potw: Number,
});
const DirectConnectBundleSchema = mongoose.Schema({
	bundleId: Number,
	name: String,
	size: String,
	type: {},
});

const ComicSchema = mongoose.Schema(
	{
		importStatus: {
			isImported: Boolean,
			tagged: Boolean,
			matchedResult: {
				score: String,
			},
		},
		userAddedMetadata: {
			tags: [String],
		},
		sourcedMetadata: {
			comicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
			comicvine: {
				type: ComicVineMetadataSchema,
				es_indexed: true,
				default: {},
			},
			shortboxed: {},
			locg: {
				type: LOCGSchema,
				es_indexed: true,
				default: {},
			},
			gcd: {},
		},
		rawFileDetails: {
			type: RawFileDetailsSchema,
			es_indexed: true,
			default: {},
		},
		inferredMetadata: {
			issue: {
				name: { type: String, es_indexed: true },
				number: {
					type: Number,
					es_indexed: true,
					required: false,
					default: 0,
				},
				year: String,
				subtitle: { type: String, es_indexed: true },
			},
		},
		acquisition: {
			source: {
				wanted: Boolean,
				name: String,
			},
			release: {},
			directconnect: {
				downloads: {
					type: [DirectConnectBundleSchema],
					es_indexed: true,
					default: [],
				},
			},
			torrent: {
				sourceApplication: String,
				magnet: String,
				tracker: String,
				status: String,
			},
			usenet: {
				sourceApplication: String,
			},
		},
	},
	{ timestamps: true, minimize: false }
);

ComicSchema.plugin(mongoosastic, {
	index: "comics",
	type: "comic",
	esClient: eSClient,
} as MongoosasticPluginOpts);
ComicSchema.plugin(paginate);

const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
