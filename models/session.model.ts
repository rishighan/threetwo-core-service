const mongoose = require("mongoose");

const SessionScehma = mongoose.Schema({
	sessionId: String,
	socketId: String,
});

const Session = mongoose.model("Session", SessionScehma);
export default Session;
