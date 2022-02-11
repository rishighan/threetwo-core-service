const Walk = require("@root/walk");

import path from "path";
import fs from "fs";
import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "threetwo-ui-typings";
import { includes, remove, indexOf } from "lodash";

const ALLOWED_IMAGE_FILE_FORMATS = [".jpg", ".jpeg", ".png"];

export const walkFolder = async (
	folder: string,
	formats: string[]
): Promise<IFolderData[]> => {
	const result: IFolderData[] = [];
	let walkResult: IFolderData = {
		name: "",
		filePath: "",
		extension: "",
		containedIn: "",
		isFile: false,
		isLink: true,
		fileSize: 0,
	};

	const walk = Walk.create({ sort: filterOutDotFiles });
	await walk(folder, async (err, pathname, dirent) => {
		if (err) {
			console.log("Failed to lstat directory", { error: err });
			return false;
		}
		if ([...formats].includes(path.extname(dirent.name))) {
			walkResult = {
				name: path.basename(dirent.name, path.extname(dirent.name)),
				filePath: path.resolve(pathname),
				extension: path.extname(dirent.name),
				fileSize: fs.statSync(path.resolve(pathname)).size,
				containedIn: path.dirname(pathname),
				isFile: dirent.isFile(),
				isLink: dirent.isSymbolicLink(),
			};
			console.log(
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

export const getSizeOfDirectory = async (
	path: string,
	extensions: string[]
) => {
	const arrayOfFiles = await walkFolder(path, extensions);
	let totalSize = 0;

	arrayOfFiles.forEach((file) => {
		totalSize += file.fileSize;
	});
	return totalSize;
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
