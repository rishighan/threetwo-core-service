const sharp = require("sharp");
import { ISharpResizedImageStats } from "threetwo-ui-typings";
const imghash = require("imghash");
const leven = require("leven");
import { isNull, reject } from "lodash";
import fs from "fs";

export const extractMetadataFromImage = async (
	imageFilePath: string
): Promise<unknown> => {
	const image = await sharp(imageFilePath)
		.metadata()
		.then((metadata) => {
			return metadata;
		});
	return image;
};

export const resizeImage = async (
	imageFile: string | Buffer,
	outputPath: string,
	newWidth: number,
	newHeight?: number
): Promise<ISharpResizedImageStats> => {
	const buffer = await sharp(imageFile)
		.resize(newWidth, newHeight, {
			fit: sharp.fit.inside,
			withoutEnlargement: true,
		})
		.toBuffer();
	return await sharp(buffer).toFile(`${outputPath}`, (err, info) => {
		if (err) {
			console.log("Failed to resize image:");
			console.log(err);
			return err;
		}

		console.log(
			"Image file resized with the following parameters: %o",
			info
		);
		return info;
	});
};

export const analyze = async (inputFilePath: string | Buffer) => {
	const stats = await sharp(inputFilePath).stats();
	// const { r, g, b } = dominant;
	return stats;
};

export const getColorHistogramData = async (
	inputFilePath: string | Buffer,
	isValueHistogram: Boolean
) => {
	const { data, info } = await sharp(inputFilePath)
		// output the raw pixels
		.raw()
		.toBuffer({ resolveWithObject: true });
	const src = new Uint32Array(data.buffer);
	// const src = new Uint8ClampedArray(data.buffer);
	console.log(src);

	let histBrightness = new Array(256).fill(0);
	let histR = new Array(256).fill(0);
	let histG = new Array(256).fill(0);
	let histB = new Array(256).fill(0);

	for (let i = 0; i < src.length; i++) {
		let r = src[i] & 0xff;
		let g = (src[i] >> 8) & 0xff;
		let b = (src[i] >> 16) & 0xff;
		histBrightness[r]++;
		histBrightness[g]++;
		histBrightness[b]++;
		histR[r]++;
		histG[g]++;
		histB[b]++;
	}

	let maxBrightness = 0;
	if (isValueHistogram) {
		for (let i = 1; i < 256; i++) {
			if (maxBrightness < histBrightness[i]) {
				maxBrightness = histBrightness[i];
			}
		}
	} else {
		for (let i = 0; i < 256; i++) {
			if (maxBrightness < histR[i]) {
				maxBrightness = histR[i];
			} else if (maxBrightness < histG[i]) {
				maxBrightness = histG[i];
			} else if (maxBrightness < histB[i]) {
				maxBrightness = histB[i];
			}
		}
	}

	return {
		r: histR,
		g: histG,
		b: histB,
		maxBrightness,
	};
};

export const calculateLevenshteinDistance = async (
	imagePath1: string,
	imagePath2: string
): Promise<Record<string, unknown>> => {
	const hash1 = await imghash.hash(imagePath1);
	const hash2 = await imghash.hash(imagePath2);
	if (!isNull(hash1) && !isNull(hash2)) {
		return new Promise((resolve, reject) => {
			resolve({ levenshteinDistance: leven(hash1, hash2) });
		});
	} else {
		reject("Can't calculate the Levenshtein distance");
	}
};
