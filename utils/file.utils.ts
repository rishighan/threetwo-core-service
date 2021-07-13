const Walk = require("@root/walk");

import path from "path";
import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "../interfaces/folder.interface";
import { logger } from "./logger.utils";
import { includes, remove, indexOf } from "lodash";

const ALLOWED_IMAGE_FILE_FORMATS = [".jpg", ".jpeg", ".png"];

export const walkFolder = async (folder: string): Promise<IFolderData[]> => {
	const result: IFolderData[] = [];
	let walkResult: IFolderData = {
		name: "",
		extension: "",
		containedIn: "",
		isFile: false,
		isLink: true,
	};

	const walk = Walk.create({ sort: filterOutDotFiles });
	await walk(folder, async (err, pathname, dirent) => {
		if (err) {
			logger.error("Failed to lstat directory", { error: err });
			return false;
		}
		if ([".cbz", ".cbr"].includes(path.extname(dirent.name))) {
			walkResult = {
				name: path.basename(dirent.name, path.extname(dirent.name)),
				extension: path.extname(dirent.name),
				containedIn: path.dirname(pathname),
				isFile: dirent.isFile(),
				isLink: dirent.isSymbolicLink(),
			};
			logger.info(
				`Scanned ${dirent.name} contained in ${path.dirname(pathname)}`
			);
			result.push(walkResult);
		}
	});
	return result;
};

export const explodePath = (filePath: string): IExplodedPathResponse => {
	const exploded = filePath.split("/");
	const fileName = remove(
		exploded,
		(item) => indexOf(exploded, item) === exploded.length - 1
	).join("");

	return {
		exploded,
		fileName,
	};
};

export const isValidImageFileExtension = (fileName: string): boolean => {
	return includes(ALLOWED_IMAGE_FILE_FORMATS, path.extname(fileName));
};

export const constructPaths = (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
) => ({
	targetPath:
		extractionOptions.targetExtractionFolder + "/" + walkedFolder.name,
	inputFilePath:
		walkedFolder.containedIn +
		"/" +
		walkedFolder.name +
		walkedFolder.extension,
});

const filterOutDotFiles = (entities) =>
	entities.filter((ent) => !ent.name.startsWith("."));
