const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");
const { Client } = require("@elastic/elasticsearch");
import ComicVineMetadataSchema from "./comicvine.metadata.model";
import { mongoosastic } from "mongoosastic-ts";
import {
	MongoosasticDocument,
	MongoosasticModel,
	MongoosasticPluginOpts,
} from "mongoosastic-ts/dist/types";
const ELASTICSEARCH_HOST = process.env.ELASTICSEARCH_URI || "http://localhost:9200";
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
	containedIn: String,
	pageCount: Number,
	cover: {
		filePath: String,
		stats: Object,
	},
	calibreMetadata: {
		coverWriteResult: String,
	},
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
			tags: [],
		},
		sourcedMetadata: {
			comicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
			comicvine: {
				type: ComicVineMetadataSchema,
				es_indexed: true,
				default: {},
			},
			shortboxed: {},
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
			wanted: Boolean,
			release: {},
			directconnect: Array,
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
	esClient: eSClient,
});
ComicSchema.plugin(paginate);

const Comic = mongoose.model("Comic", ComicSchema);
// 	stream = Comic.synchronize();
// let count = 0;

// stream.on("data", function (err, doc) {
// 	count++;
// });
// stream.on("close", function () {
// 	console.log("indexed " + count + " documents!");
// });
// stream.on("error", function (err) {
// 	console.log(err);
// });
export default Comic;
