import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "threetwo-ui-typings";
const Validator = require("fastest-validator");

export const validateComicBookMetadata = (
	comicBookMetadataObject: IExtractedComicBookCoverFile
): boolean => {
	const validator = new Validator();
	const sch = {
		name: { type: "string" },
		fileSize: { type: "number", positive: true, integer: true },
		path: { type: "string" },
	};
	const check = validator.compile(sch);
	if (check(comicBookMetadataObject)) {
		console.log(`Valid comic book metadata: ${comicBookMetadataObject}`);
	} else {
		console.log(
			`Comic book metadata was invalid:
			${comicBookMetadataObject}`
		);
	}
	return check(comicBookMetadataObject);
};
