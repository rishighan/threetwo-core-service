const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const SettingsScehma = mongoose.Schema({
	directConnect: {
		client: {
			name: String,
			version: String,
			airdcppUserSettings: Object,
			hostname: String,
			protocol: String,
			username: String,
			password: String,
			hubs: [{}],
		},
	},
});

const Settings = mongoose.model("Settings", SettingsScehma);
export default Settings;
