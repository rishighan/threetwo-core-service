const mongoose = require("mongoose");
const paginate = require("mongoose-paginate");

const ComicSchema = mongoose.Schema({
	name: String,
	type: String,
	import: {
		isImported: Boolean,
		matchedResult: {
			score: String,
		},
	},
	userAddedMetadata: {
		tags: [],
	},

	comicStructure: {
		cover: {
			thumb: String,
			medium: String,
			large: String,
		},
		collection: {
			publishDate: String,
			type: String, // issue, series, trade paperback
			metadata: {
				publisher: String,
				issueNumber: String,
				description: String,
				synopsis: String,
				team: {
					writer: String,
					inker: String,
					penciler: String,
					colorist: String,
				},
			},
		},
	},
	sourcedMetadata: {
		comicvine: {},
		shortboxed: {},
		gcd: {},
	},
	rawFileDetails: {
		fileName: String,
		path: String,
		extension: String,
	},
	acquisition: {
		wanted: Boolean,
		release: {},
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
