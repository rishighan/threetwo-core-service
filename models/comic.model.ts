const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const ComicSchema = mongoose.Schema({
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
	comicInfo: {
		blackAndWhite: String,
		characters: [String],
		count: String,
		genre: String,
		manga: String,
		month: String,
		number: String,
		pageCount: String,
		pages: [],
		publisher: String,
		summary: String,
		title: String,
		writer: String,
		year: String,
	},
	sourcedMetadata: {
		comicvine: {},
		shortboxed: {},
		gcd: {},
	},
	rawFileDetails: {
		name: String,
		path: String,
		fileSize: Number,
		containedIn: String,
	},
	acquisition: {
		wanted: Boolean,
		release: {},
		directconnect: {},
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
});

ComicSchema.plugin(paginate);
const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
