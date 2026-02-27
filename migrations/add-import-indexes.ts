/**
 * Migration script to add indexes for import performance optimization
 * 
 * This migration adds indexes to the Comic collection to dramatically improve
 * the performance of import statistics queries, especially for large libraries.
 * 
 * Run this script once to add indexes to an existing database:
 * npx ts-node migrations/add-import-indexes.ts
 */

import mongoose from "mongoose";
import Comic from "../models/comic.model";

// Suppress Mongoose 7 deprecation warning
mongoose.set('strictQuery', false);

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/threetwo";

async function addIndexes() {
	try {
		console.log("Connecting to MongoDB...");
		await mongoose.connect(MONGO_URI);
		console.log("Connected successfully");

		console.log("\nAdding indexes to Comic collection...");
		
		// Get the collection
		const collection = Comic.collection;
		
		// Check existing indexes
		console.log("\nExisting indexes:");
		const existingIndexes = await collection.indexes();
		const existingIndexMap = new Map();
		
		existingIndexes.forEach((index) => {
			const keyStr = JSON.stringify(index.key);
			console.log(`  - ${keyStr} (name: ${index.name})`);
			existingIndexMap.set(keyStr, index.name);
		});

		// Helper function to create index if it doesn't exist
		async function createIndexIfNeeded(
			key: any,
			options: any,
			description: string
		) {
			const keyStr = JSON.stringify(key);
			
			if (existingIndexMap.has(keyStr)) {
				console.log(`  ⏭️  Index on ${description} already exists (${existingIndexMap.get(keyStr)})`);
				return;
			}
			
			console.log(`  Creating index on ${description}...`);
			try {
				await collection.createIndex(key, options);
				console.log("  ✓ Created");
			} catch (error: any) {
				// If index already exists with different name, that's okay
				if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
					console.log(`  ⏭️  Index already exists (skipping)`);
				} else {
					throw error;
				}
			}
		}

		// Add new indexes
		console.log("\nCreating new indexes...");
		
		// Index for import statistics queries (most important)
		await createIndexIfNeeded(
			{ "rawFileDetails.filePath": 1 },
			{
				name: "rawFileDetails_filePath_1",
				background: true // Create in background to avoid blocking
			},
			"rawFileDetails.filePath"
		);

		// Index for duplicate detection
		await createIndexIfNeeded(
			{ "rawFileDetails.name": 1 },
			{
				name: "rawFileDetails_name_1",
				background: true
			},
			"rawFileDetails.name"
		);

		// Index for wanted comics queries
		await createIndexIfNeeded(
			{ "wanted.volume.id": 1 },
			{
				name: "wanted_volume_id_1",
				background: true,
				sparse: true // Only index documents that have this field
			},
			"wanted.volume.id"
		);

		// Verify indexes were created
		console.log("\nFinal indexes:");
		const finalIndexes = await collection.indexes();
		finalIndexes.forEach((index) => {
			console.log(`  - ${JSON.stringify(index.key)} (name: ${index.name})`);
		});

		console.log("\n✅ Migration completed successfully!");
		console.log("\nPerformance improvements:");
		console.log("  - Import statistics queries should be 10-100x faster");
		console.log("  - Large libraries (10,000+ comics) will see the most benefit");
		console.log("  - Timeout errors should be eliminated");

	} catch (error) {
		console.error("\n❌ Migration failed:", error);
		throw error;
	} finally {
		await mongoose.disconnect();
		console.log("\nDisconnected from MongoDB");
	}
}

// Run the migration
if (require.main === module) {
	addIndexes()
		.then(() => {
			console.log("\nMigration script completed");
			process.exit(0);
		})
		.catch((error) => {
			console.error("\nMigration script failed:", error);
			process.exit(1);
		});
}

export default addIndexes;
