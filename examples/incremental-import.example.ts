/**
 * Example: Incremental Import
 * 
 * This example demonstrates how to use the incremental import feature
 * to import only new files that haven't been previously imported.
 */

import { ServiceBroker } from "moleculer";
import {
	getImportedFilePaths,
	getImportedFileNames,
	getImportStatistics,
	batchCheckImported,
	getComicsNeedingReimport,
	findDuplicateFiles,
} from "../utils/import.utils";

/**
 * Example 1: Basic Incremental Import
 * Import only new files from your comics directory
 */
async function example1_basicIncrementalImport(broker: ServiceBroker) {
	console.log("\n=== Example 1: Basic Incremental Import ===\n");

	try {
		// Call the incremental import endpoint
		const result: any = await broker.call("library.incrementalImport", {
			sessionId: "incremental-session-" + Date.now(),
		});

		console.log("Import Result:");
		console.log(`  Success: ${result.success}`);
		console.log(`  Message: ${result.message}`);
		console.log("\nStatistics:");
		console.log(`  Total files found: ${result.stats.total}`);
		console.log(`  Already imported: ${result.stats.alreadyImported}`);
		console.log(`  New files: ${result.stats.newFiles}`);
		console.log(`  Queued for import: ${result.stats.queued}`);

		return result;
	} catch (error) {
		console.error("Error during incremental import:", error);
		throw error;
	}
}

/**
 * Example 2: Get Import Statistics
 * Check how many files are imported vs. new without starting an import
 */
async function example2_getImportStatistics(broker: ServiceBroker) {
	console.log("\n=== Example 2: Get Import Statistics ===\n");

	try {
		const result: any = await broker.call("library.getImportStatistics", {
			// Optional: specify a custom directory path
			// directoryPath: "/path/to/comics"
		});

		console.log("Import Statistics:");
		console.log(`  Directory: ${result.directory}`);
		console.log(`  Total local files: ${result.stats.totalLocalFiles}`);
		console.log(`  Already imported: ${result.stats.alreadyImported}`);
		console.log(`  New files to import: ${result.stats.newFiles}`);
		console.log(`  Percentage imported: ${result.stats.percentageImported}`);

		return result;
	} catch (error) {
		console.error("Error getting import statistics:", error);
		throw error;
	}
}

/**
 * Example 3: Check Specific Files
 * Check if specific files are already imported
 */
async function example3_checkSpecificFiles() {
	console.log("\n=== Example 3: Check Specific Files ===\n");

	const filesToCheck = [
		"/comics/batman-001.cbz",
		"/comics/superman-001.cbz",
		"/comics/wonder-woman-001.cbz",
	];

	try {
		const results = await batchCheckImported(filesToCheck);

		console.log("File Import Status:");
		results.forEach((isImported, filePath) => {
			console.log(`  ${filePath}: ${isImported ? "✓ Imported" : "✗ Not imported"}`);
		});

		return results;
	} catch (error) {
		console.error("Error checking files:", error);
		throw error;
	}
}

/**
 * Example 4: Get All Imported File Paths
 * Retrieve a list of all imported file paths from the database
 */
async function example4_getAllImportedPaths() {
	console.log("\n=== Example 4: Get All Imported File Paths ===\n");

	try {
		const importedPaths = await getImportedFilePaths();

		console.log(`Total imported files: ${importedPaths.size}`);
		
		// Show first 10 as examples
		const pathArray = Array.from(importedPaths);
		console.log("\nFirst 10 imported files:");
		pathArray.slice(0, 10).forEach((path, index) => {
			console.log(`  ${index + 1}. ${path}`);
		});

		if (pathArray.length > 10) {
			console.log(`  ... and ${pathArray.length - 10} more`);
		}

		return importedPaths;
	} catch (error) {
		console.error("Error getting imported paths:", error);
		throw error;
	}
}

/**
 * Example 5: Get All Imported File Names
 * Retrieve a list of all imported file names (without paths)
 */
async function example5_getAllImportedNames() {
	console.log("\n=== Example 5: Get All Imported File Names ===\n");

	try {
		const importedNames = await getImportedFileNames();

		console.log(`Total imported file names: ${importedNames.size}`);
		
		// Show first 10 as examples
		const nameArray = Array.from(importedNames);
		console.log("\nFirst 10 imported file names:");
		nameArray.slice(0, 10).forEach((name, index) => {
			console.log(`  ${index + 1}. ${name}`);
		});

		if (nameArray.length > 10) {
			console.log(`  ... and ${nameArray.length - 10} more`);
		}

		return importedNames;
	} catch (error) {
		console.error("Error getting imported names:", error);
		throw error;
	}
}

/**
 * Example 6: Find Comics Needing Re-import
 * Find comics that have files but incomplete metadata
 */
async function example6_findComicsNeedingReimport() {
	console.log("\n=== Example 6: Find Comics Needing Re-import ===\n");

	try {
		const comics = await getComicsNeedingReimport();

		console.log(`Found ${comics.length} comics needing re-import`);

		if (comics.length > 0) {
			console.log("\nFirst 5 comics needing re-import:");
			comics.slice(0, 5).forEach((comic: any, index) => {
				console.log(`  ${index + 1}. ${comic.rawFileDetails?.name || "Unknown"}`);
				console.log(`     Path: ${comic.rawFileDetails?.filePath || "N/A"}`);
				console.log(`     Has title: ${!!comic.canonicalMetadata?.title?.value}`);
				console.log(`     Has series: ${!!comic.canonicalMetadata?.series?.value}`);
			});

			if (comics.length > 5) {
				console.log(`  ... and ${comics.length - 5} more`);
			}
		}

		return comics;
	} catch (error) {
		console.error("Error finding comics needing re-import:", error);
		throw error;
	}
}

/**
 * Example 7: Find Duplicate Files
 * Find files with the same name but different paths
 */
async function example7_findDuplicates() {
	console.log("\n=== Example 7: Find Duplicate Files ===\n");

	try {
		const duplicates = await findDuplicateFiles();

		console.log(`Found ${duplicates.length} duplicate file names`);

		if (duplicates.length > 0) {
			console.log("\nDuplicate files:");
			duplicates.slice(0, 5).forEach((dup, index) => {
				console.log(`  ${index + 1}. ${dup.name} (${dup.count} copies)`);
				dup.paths.forEach((path: string) => {
					console.log(`     - ${path}`);
				});
			});

			if (duplicates.length > 5) {
				console.log(`  ... and ${duplicates.length - 5} more`);
			}
		}

		return duplicates;
	} catch (error) {
		console.error("Error finding duplicates:", error);
		throw error;
	}
}

/**
 * Example 8: Custom Import Statistics for Specific Directory
 * Get statistics for a custom directory path
 */
async function example8_customDirectoryStats(directoryPath: string) {
	console.log("\n=== Example 8: Custom Directory Statistics ===\n");
	console.log(`Analyzing directory: ${directoryPath}`);

	try {
		const klaw = require("klaw");
		const through2 = require("through2");
		const path = require("path");

		// Collect all comic files in the custom directory
		const localFiles: string[] = [];

		await new Promise<void>((resolve, reject) => {
			klaw(directoryPath)
				.on("error", (err: Error) => {
					console.error(`Error walking directory:`, err);
					reject(err);
				})
				.pipe(
					through2.obj(function (item: any, enc: any, next: any) {
						const fileExtension = path.extname(item.path);
						if ([".cbz", ".cbr", ".cb7"].includes(fileExtension)) {
							localFiles.push(item.path);
						}
						next();
					})
				)
				.on("end", () => {
					resolve();
				});
		});

		// Get statistics
		const stats = await getImportStatistics(localFiles);

		console.log("\nStatistics:");
		console.log(`  Total files: ${stats.total}`);
		console.log(`  Already imported: ${stats.alreadyImported}`);
		console.log(`  New files: ${stats.newFiles}`);
		console.log(`  Percentage: ${((stats.alreadyImported / stats.total) * 100).toFixed(2)}%`);

		return stats;
	} catch (error) {
		console.error("Error getting custom directory stats:", error);
		throw error;
	}
}

/**
 * Run all examples
 */
async function runAllExamples(broker: ServiceBroker) {
	console.log("╔════════════════════════════════════════════════════════════╗");
	console.log("║          Incremental Import Examples                       ║");
	console.log("╚════════════════════════════════════════════════════════════╝");

	try {
		// Example 1: Basic incremental import
		await example1_basicIncrementalImport(broker);

		// Example 2: Get statistics without importing
		await example2_getImportStatistics(broker);

		// Example 3: Check specific files
		await example3_checkSpecificFiles();

		// Example 4: Get all imported paths
		await example4_getAllImportedPaths();

		// Example 5: Get all imported names
		await example5_getAllImportedNames();

		// Example 6: Find comics needing re-import
		await example6_findComicsNeedingReimport();

		// Example 7: Find duplicates
		await example7_findDuplicates();

		// Example 8: Custom directory stats (uncomment and provide path)
		// await example8_customDirectoryStats("/path/to/custom/comics");

		console.log("\n╔════════════════════════════════════════════════════════════╗");
		console.log("║  All examples completed successfully!                      ║");
		console.log("╚════════════════════════════════════════════════════════════╝\n");
	} catch (error) {
		console.error("\n❌ Error running examples:", error);
		throw error;
	}
}

/**
 * Usage in your service or application
 */
export {
	example1_basicIncrementalImport,
	example2_getImportStatistics,
	example3_checkSpecificFiles,
	example4_getAllImportedPaths,
	example5_getAllImportedNames,
	example6_findComicsNeedingReimport,
	example7_findDuplicates,
	example8_customDirectoryStats,
	runAllExamples,
};

// If running directly
if (require.main === module) {
	console.log("Note: This is an example file. To run these examples:");
	console.log("1. Ensure your Moleculer broker is running");
	console.log("2. Import and call the example functions from your service");
	console.log("3. Or integrate the patterns into your application");
	console.log("\nQuick Start:");
	console.log("  - Use example1_basicIncrementalImport() to import only new files");
	console.log("  - Use example2_getImportStatistics() to check status before importing");
	console.log("  - Use example3_checkSpecificFiles() to verify specific files");
}
