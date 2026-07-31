import path from "path";

/**
 * Converts an absolute file path under USERDATA_DIRECTORY into the web-servable
 * path exposed by the "/userdata" static route in api.service.ts. Storing paths
 * this way (instead of relative to process.cwd()) keeps them stable regardless
 * of the directory the process happens to be launched from.
 */
export const toUserdataWebPath = (
	absoluteFilePath: string,
	userDataDirectory: string
): string => {
	const relative = path.relative(userDataDirectory, absoluteFilePath);
	return path.posix.join("/userdata", relative.split(path.sep).join("/"));
};
