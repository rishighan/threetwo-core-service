/**
 * Import utilities for checking existing records and managing incremental imports
 */

import Comic from "../models/comic.model";
import path from "path";

/**
 * Get all imported file paths from MongoDB as a Set for O(1) lookup
 * @returns Set of normalized file paths
 */
export async function getImportedFilePaths(): Promise<Set<string>> {
	try {
		// Query only the rawFileDetails.filePath field for efficiency
		const comics = await Comic.find(
			{ "rawFileDetails.filePath": { $exists: true, $ne: null } },
			{ "rawFileDetails.filePath": 1, _id: 0 }
		).lean();

		const filePaths = new Set<string>();
		
		for (const comic of comics) {
			if (comic.rawFileDetails?.filePath) {
				// Normalize the path to handle different path formats
				const normalizedPath = path.normalize(comic.rawFileDetails.filePath);
				filePaths.add(normalizedPath);
			}
		}

		console.log(`Found ${filePaths.size} imported files in database`);
		return filePaths;
	} catch (error) {
		console.error("Error fetching imported file paths:", error);
		throw error;
	}
}

/**
 * Get all imported file names (without extension) as a Set
 * @returns Set of file names for path-independent matching
 */
export async function getImportedFileNames(): Promise<Set<string>> {
	try {
		// Query only the rawFileDetails.name field for efficiency
		const comics = await Comic.find(
			{ "rawFileDetails.name": { $exists: true, $ne: null } },
			{ "rawFileDetails.name": 1, _id: 0 }
		).lean();

		const fileNames = new Set<string>();
		
		for (const comic of comics) {
			if (comic.rawFileDetails?.name) {
				fileNames.add(comic.rawFileDetails.name);
			}
		}

		console.log(`Found ${fileNames.size} imported file names in database`);
		return fileNames;
	} catch (error) {
		console.error("Error fetching imported file names:", error);
		throw error;
	}
}

/**
 * Check if a file path exists in the database
 * @param filePath - Full file path to check
 * @returns true if file is imported
 */
export async function isFileImported(filePath: string): Promise<boolean> {
	try {
		const normalizedPath = path.normalize(filePath);
		const exists = await Comic.exists({
			"rawFileDetails.filePath": normalizedPath,
		});
		return exists !== null;
	} catch (error) {
		console.error(`Error checking if file is imported: ${filePath}`, error);
		return false;
	}
}

/**
 * Check if a file name exists in the database
 * @param fileName - File name without extension
 * @returns true if file name is imported
 */
export async function isFileNameImported(fileName: string): Promise<boolean> {
	try {
		const exists = await Comic.exists({
			"rawFileDetails.name": fileName,
		});
		return exists !== null;
	} catch (error) {
		console.error(`Error checking if file name is imported: ${fileName}`, error);
		return false;
	}
}

/**
 * Filter array to only new (unimported) files
 * @param files - Array of objects with path property
 * @param importedPaths - Set of imported paths
 * @returns Filtered array of new files
 */
export function filterNewFiles<T extends { path: string }>(
	files: T[],
	importedPaths: Set<string>
): T[] {
	return files.filter((file) => {
		const normalizedPath = path.normalize(file.path);
		return !importedPaths.has(normalizedPath);
	});
}

/**
 * Filter array to only new files by name
 * @param files - Array of objects with name property
 * @param importedNames - Set of imported names
 * @returns Filtered array of new files
 */
export function filterNewFilesByName<T extends { name: string }>(
	files: T[],
	importedNames: Set<string>
): T[] {
	return files.filter((file) => !importedNames.has(file.name));
}

/**
 * Compare local files against database to get import statistics
 * Uses batch queries for better performance with large libraries
 * @param localFilePaths - Array of local file paths
 * @returns Statistics object with counts and imported paths Set
 */
export async function getImportStatistics(localFilePaths: string[]): Promise<{
	total: number;
	alreadyImported: number;
	newFiles: number;
	importedPaths: Set<string>;
}> {
	console.log(`[Import Stats] Checking ${localFilePaths.length} files against database...`);
	
	// Normalize all paths upfront
	const normalizedPaths = localFilePaths.map((p) => path.normalize(p));
	
	// Use batch query instead of fetching all comics
	// This is much faster for large libraries
	const importedComics = await Comic.find(
		{
			"rawFileDetails.filePath": { $in: normalizedPaths },
		},
		{ "rawFileDetails.filePath": 1, _id: 0 }
	).lean();

	// Build Set of imported paths
	const importedPaths = new Set<string>(
		importedComics
			.map((c: any) => c.rawFileDetails?.filePath)
			.filter(Boolean)
			.map((p: string) => path.normalize(p))
	);

	const alreadyImported = importedPaths.size;
	const newFiles = localFilePaths.length - alreadyImported;

	console.log(`[Import Stats] Results: ${alreadyImported} already imported, ${newFiles} new files`);

	return {
		total: localFilePaths.length,
		alreadyImported,
		newFiles,
		importedPaths,
	};
}

/**
 * Batch check multiple files in a single query (more efficient than individual checks)
 * @param filePaths - Array of file paths to check
 * @returns Map of filePath -> isImported boolean
 */
export async function batchCheckImported(
	filePaths: string[]
): Promise<Map<string, boolean>> {
	try {
		const normalizedPaths = filePaths.map((p) => path.normalize(p));
		
		// Query all at once
		const importedComics = await Comic.find(
			{
				"rawFileDetails.filePath": { $in: normalizedPaths },
			},
			{ "rawFileDetails.filePath": 1, _id: 0 }
		).lean();

		// Create a map of imported paths
		const importedSet = new Set(
			importedComics
				.map((c: any) => c.rawFileDetails?.filePath)
				.filter(Boolean)
				.map((p: string) => path.normalize(p))
		);

		// Build result map
		const resultMap = new Map<string, boolean>();
		for (let i = 0; i < filePaths.length; i++) {
			resultMap.set(filePaths[i], importedSet.has(normalizedPaths[i]));
		}

		return resultMap;
	} catch (error) {
		console.error("Error batch checking imported files:", error);
		throw error;
	}
}

/**
 * Find comics with files but missing canonical metadata
 * @returns Array of comic documents needing re-import
 */
export async function getComicsNeedingReimport(): Promise<any[]> {
	try {
		// Find comics that have files but missing canonical metadata
		const comics = await Comic.find({
			"rawFileDetails.filePath": { $exists: true, $ne: null },
			$or: [
				{ canonicalMetadata: { $exists: false } },
				{ "canonicalMetadata.title": { $exists: false } },
				{ "canonicalMetadata.series": { $exists: false } },
			],
		}).lean();

		console.log(`Found ${comics.length} comics needing re-import`);
		return comics;
	} catch (error) {
		console.error("Error finding comics needing re-import:", error);
		throw error;
	}
}

/**
 * Find files with same name but different paths
 * @returns Array of duplicates with name, paths, and count
 */
export async function findDuplicateFiles(): Promise<
	Array<{ name: string; paths: string[]; count: number }>
> {
	try {
		const duplicates = await Comic.aggregate([
			{
				$match: {
					"rawFileDetails.name": { $exists: true, $ne: null },
				},
			},
			{
				$group: {
					_id: "$rawFileDetails.name",
					paths: { $push: "$rawFileDetails.filePath" },
					count: { $sum: 1 },
				},
			},
			{
				$match: {
					count: { $gt: 1 },
				},
			},
			{
				$project: {
					_id: 0,
					name: "$_id",
					paths: 1,
					count: 1,
				},
			},
			{
				$sort: { count: -1 },
			},
		]);

		console.log(`Found ${duplicates.length} duplicate file names`);
		return duplicates;
	} catch (error) {
		console.error("Error finding duplicate files:", error);
		throw error;
	}
}
