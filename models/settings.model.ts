const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const SettingsScehma = mongoose.Schema({
	directConnect: {
		client: {
			host: {
				username: String,
				password: String,
				hostname: String,
				port: String,
				protocol: String,
			},
			airDCPPUserSettings: Object,

			hubs: Array,
		},
	},
});

const Settings = mongoose.model("Settings", SettingsScehma);
export default Settings;
