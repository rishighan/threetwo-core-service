import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "../interfaces/folder.interface";
const Validator = require("fastest-validator");

export const validateComicBookMetadata = (
	comicBookMetadataObject: IExtractedComicBookCoverFile
): boolean => {
	console.log(comicBookMetadataObject);
	const validator = new Validator();
	const sch = {
		name: { type: "string" },
		fileSize: { type: "number", positive: true, integer: true },
		path: { type: "string" },
	};
	const check = validator.compile(sch);
	return check(comicBookMetadataObject);
};
