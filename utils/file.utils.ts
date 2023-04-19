const Walk = require("@root/walk");
const fse = require("fs-extra");

import path from "path";
import fs from "fs";
import { FileMagic, MagicFlags } from "@npcz/magic";
const { readdir, stat } = require("fs/promises");
import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "threetwo-ui-typings";
import { includes, remove, indexOf } from "lodash";
import { Errors } from "moleculer";
import { sanitize } from "sanitize-filename-ts";

const ALLOWED_IMAGE_FILE_FORMATS = [".jpg", ".jpeg", ".png"];

// Tell FileMagic where to find the magic.mgc file
FileMagic.magicFile = require.resolve("@npcz/magic/dist/magic.mgc");

// We can only use MAGIC_PRESERVE_ATIME on operating suystems that support
// it and that includes OS X for example. It's a good practice as we don't
// want to change the last access time because we are just checking the file
// contents type
if (process.platform === "darwin" || process.platform === "linux") {
	FileMagic.defaulFlags = MagicFlags.MAGIC_PRESERVE_ATIME;
}

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

// returns a promise which resolves true if file exists:
export const checkFileExists = (filepath) => {
	return new Promise((resolve, reject) => {
		fs.access(filepath, fs.constants.F_OK, (error) => {
			resolve(!error);
		});
	});
};

export const getSizeOfDirectory = async (
	directoryPath: string,
	extensions: string[]
) => {
	const files = await readdir(directoryPath);
	const stats = files.map((file) => stat(path.join(directoryPath, file)));

	return (await Promise.all(stats)).reduce(
		(accumulator, { size }) => accumulator + size,
		0
	);
};

export const isValidImageFileExtension = (fileName: string): boolean => {
	return includes(ALLOWED_IMAGE_FILE_FORMATS, path.extname(fileName));
};

/**
 * This function constructs paths for a target extraction folder and an input file based on extraction
 * options and a walked folder.
 * @param {IExtractionOptions} extractionOptions - An object containing options for the extraction
 * process, such as the target extraction folder.
 * @param {IFolderData} walkedFolder - `walkedFolder` is an object that represents a folder that has
 * been walked through during a file extraction process. It contains the following properties:
 */
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

/**
 * Method that gets file metadata from a filepath.
 * Extracts the file extension, file name with and without the extension
 * @param {string} filePath
 * @returns {Object} object
 */
export const getFileConstituents = (filePath: string) => {
	const extension = path.extname(filePath);
	const fileNameWithExtension = path.basename(filePath);
	const fileNameWithoutExtension = path.basename(
		filePath,
		path.extname(filePath)
	);
	return {
		extension,
		fileNameWithoutExtension,
		fileNameWithExtension,
	};
};

/**
 * Method that infers MIME type from a filepath
 * @param {string} filePath
 * @returns {Promise} string
 */
export const getMimeType = async (filePath: string) => {
	return await FileMagic.getInstance().then((magic: FileMagic) => {
		return magic.detect(
			path.resolve(filePath),
			magic.flags | MagicFlags.MAGIC_MIME
		);
	});
};

/**
 * This function creates a directory at a specified path using the fse.ensureDir method and throws an
 * error if it fails.
 * @param {any} options - The options parameter is an optional object that can be passed to the
 * fse.ensureDir method to configure its behavior. It can include properties such as mode, which sets
 * the permissions of the directory, and fs, which specifies the file system module to use.
 * @param {string} directoryPath - The `directoryPath` parameter is a string that represents the path
 * of the directory that needs to be created.
 */
export const createDirectory = async (options: any, directoryPath: string) => {
	try {
		await fse.ensureDir(directoryPath, options);
		console.info(`Directory [ %s ] was created.`, directoryPath);
	} catch (error) {
		throw new Errors.MoleculerError(
			"Failed to create directory",
			500,
			"FileOpsError",
			error
		);
	}
};

const filterOutDotFiles = (entities) =>
	entities.filter((ent) => !ent.name.startsWith("."));
