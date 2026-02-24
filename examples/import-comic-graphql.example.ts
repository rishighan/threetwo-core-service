/**
 * Example: Importing Comics with GraphQL and Canonical Metadata
 * 
 * This example demonstrates how to import comics using the new GraphQL-based
 * import system that automatically resolves canonical metadata from multiple sources.
 */

import { ServiceBroker } from "moleculer";
import {
	importComicViaGraphQL,
	updateSourcedMetadataViaGraphQL,
	resolveMetadataViaGraphQL,
	analyzeMetadataConflictsViaGraphQL,
	getComicViaGraphQL,
} from "../utils/import.graphql.utils";

/**
 * Example 1: Basic Comic Import
 * Import a comic with ComicInfo.xml metadata
 */
async function example1_basicImport(broker: ServiceBroker) {
	console.log("\n=== Example 1: Basic Comic Import ===\n");

	const result = await importComicViaGraphQL(broker, {
		filePath: "/comics/amazing-spider-man-001.cbz",
		fileSize: 12345678,

		rawFileDetails: {
			name: "Amazing Spider-Man 001",
			filePath: "/comics/amazing-spider-man-001.cbz",
			fileSize: 12345678,
			extension: ".cbz",
			mimeType: "application/x-cbz",
			pageCount: 24,
		},

		inferredMetadata: {
			issue: {
				name: "Amazing Spider-Man",
				number: 1,
				year: "2023",
			},
		},

		sourcedMetadata: {
			comicInfo: {
				Title: "Amazing Spider-Man #1",
				Series: "Amazing Spider-Man",
				Number: "1",
				Publisher: "Marvel Comics",
				Summary: "Peter Parker's origin story begins...",
				Year: "2023",
				Month: "1",
			},
		},
	});

	console.log("Import Result:", {
		success: result.success,
		message: result.message,
		canonicalMetadataResolved: result.canonicalMetadataResolved,
		comicId: result.comic.id,
	});

	console.log("\nCanonical Metadata:");
	console.log("  Title:", result.comic.canonicalMetadata?.title?.value);
	console.log("  Source:", result.comic.canonicalMetadata?.title?.provenance?.source);
	console.log("  Series:", result.comic.canonicalMetadata?.series?.value);
	console.log("  Publisher:", result.comic.canonicalMetadata?.publisher?.value);

	return result.comic.id;
}

/**
 * Example 2: Import with Multiple Sources
 * Import a comic with metadata from ComicInfo.xml, ComicVine, and LOCG
 */
async function example2_multiSourceImport(broker: ServiceBroker) {
	console.log("\n=== Example 2: Multi-Source Import ===\n");

	const result = await importComicViaGraphQL(broker, {
		filePath: "/comics/batman-001.cbz",

		rawFileDetails: {
			name: "Batman 001",
			filePath: "/comics/batman-001.cbz",
			fileSize: 15000000,
			extension: ".cbz",
			pageCount: 32,
		},

		inferredMetadata: {
			issue: {
				name: "Batman",
				number: 1,
				year: "2023",
			},
		},

		sourcedMetadata: {
			// From ComicInfo.xml
			comicInfo: {
				Title: "Batman #1",
				Series: "Batman",
				Number: "1",
				Publisher: "DC Comics",
				Summary: "The Dark Knight returns...",
			},

			// From ComicVine API
			comicvine: {
				name: "Batman #1: The Court of Owls",
				issue_number: "1",
				description: "A new era begins for the Dark Knight...",
				cover_date: "2023-01-01",
				volumeInformation: {
					name: "Batman",
					publisher: {
						name: "DC Comics",
					},
				},
			},

			// From League of Comic Geeks
			locg: {
				name: "Batman #1",
				publisher: "DC Comics",
				description: "Batman faces a new threat...",
				rating: 4.8,
				pulls: 15000,
				cover: "https://example.com/batman-001-cover.jpg",
			},
		},
	});

	console.log("Import Result:", {
		success: result.success,
		canonicalMetadataResolved: result.canonicalMetadataResolved,
		comicId: result.comic.id,
	});

	console.log("\nCanonical Metadata (resolved from 3 sources):");
	console.log("  Title:", result.comic.canonicalMetadata?.title?.value);
	console.log("  Source:", result.comic.canonicalMetadata?.title?.provenance?.source);
	console.log("  Confidence:", result.comic.canonicalMetadata?.title?.provenance?.confidence);
	console.log("\n  Description:", result.comic.canonicalMetadata?.description?.value?.substring(0, 50) + "...");
	console.log("  Source:", result.comic.canonicalMetadata?.description?.provenance?.source);

	return result.comic.id;
}

/**
 * Example 3: Update Metadata After Import
 * Import a comic, then fetch and add ComicVine metadata
 */
async function example3_updateMetadataAfterImport(broker: ServiceBroker) {
	console.log("\n=== Example 3: Update Metadata After Import ===\n");

	// Step 1: Import with basic metadata
	console.log("Step 1: Initial import with ComicInfo.xml only");
	const importResult = await importComicViaGraphQL(broker, {
		filePath: "/comics/x-men-001.cbz",

		rawFileDetails: {
			name: "X-Men 001",
			filePath: "/comics/x-men-001.cbz",
			fileSize: 10000000,
			extension: ".cbz",
		},

		sourcedMetadata: {
			comicInfo: {
				Title: "X-Men #1",
				Series: "X-Men",
				Number: "1",
				Publisher: "Marvel Comics",
			},
		},
	});

	const comicId = importResult.comic.id;
	console.log("  Comic imported:", comicId);
	console.log("  Initial title:", importResult.comic.canonicalMetadata?.title?.value);
	console.log("  Initial source:", importResult.comic.canonicalMetadata?.title?.provenance?.source);

	// Step 2: Fetch and add ComicVine metadata
	console.log("\nStep 2: Adding ComicVine metadata");
	const comicVineData = {
		name: "X-Men #1: Mutant Genesis",
		issue_number: "1",
		description: "The X-Men are reborn in this landmark issue...",
		cover_date: "2023-01-01",
		volumeInformation: {
			name: "X-Men",
			publisher: {
				name: "Marvel Comics",
			},
		},
	};

	const updatedComic = await updateSourcedMetadataViaGraphQL(
		broker,
		comicId,
		"comicvine",
		comicVineData
	);

	console.log("  Updated title:", updatedComic.canonicalMetadata?.title?.value);
	console.log("  Updated source:", updatedComic.canonicalMetadata?.title?.provenance?.source);
	console.log("  Description added:", updatedComic.canonicalMetadata?.description?.value?.substring(0, 50) + "...");

	return comicId;
}

/**
 * Example 4: Analyze Metadata Conflicts
 * See how conflicts between sources are resolved
 */
async function example4_analyzeConflicts(broker: ServiceBroker) {
	console.log("\n=== Example 4: Analyze Metadata Conflicts ===\n");

	// Import with conflicting metadata
	const result = await importComicViaGraphQL(broker, {
		filePath: "/comics/superman-001.cbz",

		rawFileDetails: {
			name: "Superman 001",
			filePath: "/comics/superman-001.cbz",
			fileSize: 14000000,
			extension: ".cbz",
		},

		sourcedMetadata: {
			comicInfo: {
				Title: "Superman #1",
				Series: "Superman",
				Publisher: "DC Comics",
			},
			comicvine: {
				name: "Superman #1: Man of Steel",
				volumeInformation: {
					name: "Superman",
					publisher: {
						name: "DC Comics",
					},
				},
			},
			locg: {
				name: "Superman #1 (2023)",
				publisher: "DC",
			},
		},
	});

	const comicId = result.comic.id;
	console.log("Comic imported:", comicId);

	// Analyze conflicts
	console.log("\nAnalyzing metadata conflicts...");
	const conflicts = await analyzeMetadataConflictsViaGraphQL(broker, comicId);

	console.log(`\nFound ${conflicts.length} field(s) with conflicts:\n`);

	for (const conflict of conflicts) {
		console.log(`Field: ${conflict.field}`);
		console.log(`  Candidates:`);
		for (const candidate of conflict.candidates) {
			console.log(`    - "${candidate.value}" from ${candidate.provenance.source} (confidence: ${candidate.provenance.confidence})`);
		}
		console.log(`  Resolved: "${conflict.resolved.value}" from ${conflict.resolved.provenance.source}`);
		console.log(`  Reason: ${conflict.resolutionReason}`);
		console.log();
	}

	return comicId;
}

/**
 * Example 5: Manual Metadata Resolution
 * Manually trigger metadata resolution
 */
async function example5_manualResolution(broker: ServiceBroker) {
	console.log("\n=== Example 5: Manual Metadata Resolution ===\n");

	// Import without auto-resolution (if disabled)
	const result = await importComicViaGraphQL(broker, {
		filePath: "/comics/wonder-woman-001.cbz",

		rawFileDetails: {
			name: "Wonder Woman 001",
			filePath: "/comics/wonder-woman-001.cbz",
			fileSize: 13000000,
			extension: ".cbz",
		},

		sourcedMetadata: {
			comicInfo: {
				Title: "Wonder Woman #1",
				Series: "Wonder Woman",
			},
		},
	});

	const comicId = result.comic.id;
	console.log("Comic imported:", comicId);
	console.log("Auto-resolved:", result.canonicalMetadataResolved);

	// Manually trigger resolution
	console.log("\nManually resolving metadata...");
	const resolvedComic = await resolveMetadataViaGraphQL(broker, comicId);

	console.log("Resolved metadata:");
	console.log("  Title:", resolvedComic.canonicalMetadata?.title?.value);
	console.log("  Series:", resolvedComic.canonicalMetadata?.series?.value);

	return comicId;
}

/**
 * Example 6: Get Comic with Full Canonical Metadata
 * Retrieve a comic with all its canonical metadata
 */
async function example6_getComicWithMetadata(broker: ServiceBroker, comicId: string) {
	console.log("\n=== Example 6: Get Comic with Full Metadata ===\n");

	const comic = await getComicViaGraphQL(broker, comicId);

	console.log("Comic ID:", comic.id);
	console.log("\nCanonical Metadata:");
	console.log("  Title:", comic.canonicalMetadata?.title?.value);
	console.log("    Source:", comic.canonicalMetadata?.title?.provenance?.source);
	console.log("    Confidence:", comic.canonicalMetadata?.title?.provenance?.confidence);
	console.log("    Fetched:", comic.canonicalMetadata?.title?.provenance?.fetchedAt);
	console.log("    User Override:", comic.canonicalMetadata?.title?.userOverride || false);

	console.log("\n  Series:", comic.canonicalMetadata?.series?.value);
	console.log("    Source:", comic.canonicalMetadata?.series?.provenance?.source);

	console.log("\n  Publisher:", comic.canonicalMetadata?.publisher?.value);
	console.log("    Source:", comic.canonicalMetadata?.publisher?.provenance?.source);

	if (comic.canonicalMetadata?.description) {
		console.log("\n  Description:", comic.canonicalMetadata.description.value?.substring(0, 100) + "...");
		console.log("    Source:", comic.canonicalMetadata.description.provenance?.source);
	}

	if (comic.canonicalMetadata?.creators?.length > 0) {
		console.log("\n  Creators:");
		for (const creator of comic.canonicalMetadata.creators) {
			console.log(`    - ${creator.name} (${creator.role}) from ${creator.provenance.source}`);
		}
	}

	console.log("\nRaw File Details:");
	console.log("  Name:", comic.rawFileDetails?.name);
	console.log("  Path:", comic.rawFileDetails?.filePath);
	console.log("  Size:", comic.rawFileDetails?.fileSize);
	console.log("  Pages:", comic.rawFileDetails?.pageCount);

	console.log("\nImport Status:");
	console.log("  Imported:", comic.importStatus?.isImported);
	console.log("  Tagged:", comic.importStatus?.tagged);
}

/**
 * Run all examples
 */
async function runAllExamples(broker: ServiceBroker) {
	console.log("╔════════════════════════════════════════════════════════════╗");
	console.log("║  Comic Import with GraphQL & Canonical Metadata Examples  ║");
	console.log("╚════════════════════════════════════════════════════════════╝");

	try {
		// Example 1: Basic import
		const comicId1 = await example1_basicImport(broker);

		// Example 2: Multi-source import
		const comicId2 = await example2_multiSourceImport(broker);

		// Example 3: Update after import
		const comicId3 = await example3_updateMetadataAfterImport(broker);

		// Example 4: Analyze conflicts
		const comicId4 = await example4_analyzeConflicts(broker);

		// Example 5: Manual resolution
		const comicId5 = await example5_manualResolution(broker);

		// Example 6: Get full metadata
		await example6_getComicWithMetadata(broker, comicId2);

		console.log("\n╔════════════════════════════════════════════════════════════╗");
		console.log("║  All examples completed successfully!                      ║");
		console.log("╚════════════════════════════════════════════════════════════╝\n");
	} catch (error) {
		console.error("\n❌ Error running examples:", error);
		throw error;
	}
}

/**
 * Usage in your service
 */
export {
	example1_basicImport,
	example2_multiSourceImport,
	example3_updateMetadataAfterImport,
	example4_analyzeConflicts,
	example5_manualResolution,
	example6_getComicWithMetadata,
	runAllExamples,
};

// If running directly
if (require.main === module) {
	console.log("Note: This is an example file. To run these examples:");
	console.log("1. Ensure your Moleculer broker is running");
	console.log("2. Import and call the example functions from your service");
	console.log("3. Or integrate the patterns into your library.service.ts");
}
