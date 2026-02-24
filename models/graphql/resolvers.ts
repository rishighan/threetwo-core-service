import Comic, { MetadataSource } from "../comic.model";
import UserPreferences, {
	ConflictResolutionStrategy,
} from "../userpreferences.model";
import {
	resolveMetadataField,
	buildCanonicalMetadata,
	MetadataField,
	ResolutionPreferences,
} from "../../utils/metadata.resolution.utils";

/**
 * GraphQL Resolvers for canonical metadata queries and mutations
 */
export const resolvers = {
	Query: {
		/**
		 * Get a single comic by ID
		 */
		comic: async (_: any, { id }: { id: string }) => {
			try {
				const comic = await Comic.findById(id);
				return comic;
			} catch (error) {
				console.error("Error fetching comic:", error);
				throw new Error("Failed to fetch comic");
			}
		},

		/**
		 * List comics with pagination and filtering
		 */
		comics: async (
			_: any,
			{
				limit = 10,
				page = 1,
				search,
				publisher,
				series,
			}: {
				limit?: number;
				page?: number;
				search?: string;
				publisher?: string;
				series?: string;
			}
		) => {
			try {
				const query: any = {};

				// Build search query
				if (search) {
					query.$or = [
						{ "canonicalMetadata.title.value": new RegExp(search, "i") },
						{ "canonicalMetadata.series.value": new RegExp(search, "i") },
						{ "rawFileDetails.name": new RegExp(search, "i") },
					];
				}

				if (publisher) {
					query["canonicalMetadata.publisher.value"] = new RegExp(
						publisher,
						"i"
					);
				}

				if (series) {
					query["canonicalMetadata.series.value"] = new RegExp(series, "i");
				}

				const options = {
					page,
					limit,
					sort: { createdAt: -1 },
				};

				const result = await Comic.paginate(query, options);

				return {
					comics: result.docs,
					totalCount: result.totalDocs,
					pageInfo: {
						hasNextPage: result.hasNextPage,
						hasPreviousPage: result.hasPrevPage,
						currentPage: result.page,
						totalPages: result.totalPages,
					},
				};
			} catch (error) {
				console.error("Error fetching comics:", error);
				throw new Error("Failed to fetch comics");
			}
		},

		/**
		 * Get user preferences
		 */
		userPreferences: async (
			_: any,
			{ userId = "default" }: { userId?: string }
		) => {
			try {
				let preferences = await UserPreferences.findOne({ userId });

				// Create default preferences if none exist
				if (!preferences) {
					preferences = await UserPreferences.create({ userId });
				}

				return preferences;
			} catch (error) {
				console.error("Error fetching user preferences:", error);
				throw new Error("Failed to fetch user preferences");
			}
		},

		/**
		 * Analyze metadata conflicts for a comic
		 */
		analyzeMetadataConflicts: async (
			_: any,
			{ comicId }: { comicId: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const conflicts: any[] = [];

				// Analyze each field for conflicts
				const fields = [
					"title",
					"series",
					"issueNumber",
					"description",
					"publisher",
				];

				for (const field of fields) {
					const candidates = extractCandidatesForField(
						field,
						comic.sourcedMetadata
					);

					if (candidates.length > 1) {
						const resolved = resolveMetadataField(
							field,
							candidates,
							convertPreferences(preferences)
						);

						conflicts.push({
							field,
							candidates,
							resolved,
							resolutionReason: getResolutionReason(
								resolved,
								candidates,
								preferences
							),
						});
					}
				}

				return conflicts;
			} catch (error) {
				console.error("Error analyzing metadata conflicts:", error);
				throw new Error("Failed to analyze metadata conflicts");
			}
		},

		/**
		 * Preview canonical metadata resolution without saving
		 */
		previewCanonicalMetadata: async (
			_: any,
			{
				comicId,
				preferences: preferencesInput,
			}: { comicId: string; preferences?: any }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				let preferences = await UserPreferences.findOne({
					userId: "default",
				});

				// Use provided preferences or default
				if (preferencesInput) {
					preferences = applyPreferencesInput(preferences, preferencesInput);
				}

				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const canonical = buildCanonicalMetadata(
					comic.sourcedMetadata,
					convertPreferences(preferences)
				);

				return canonical;
			} catch (error) {
				console.error("Error previewing canonical metadata:", error);
				throw new Error("Failed to preview canonical metadata");
			}
		},
	},

	Mutation: {
		/**
		 * Update user preferences
		 */
		updateUserPreferences: async (
			_: any,
			{
				userId = "default",
				preferences: preferencesInput,
			}: { userId?: string; preferences: any }
		) => {
			try {
				let preferences = await UserPreferences.findOne({ userId });

				if (!preferences) {
					preferences = new UserPreferences({ userId });
				}

				// Update preferences
				if (preferencesInput.sourcePriorities) {
					preferences.sourcePriorities = preferencesInput.sourcePriorities.map(
						(sp: any) => ({
							source: sp.source,
							priority: sp.priority,
							enabled: sp.enabled,
							fieldOverrides: sp.fieldOverrides
								? new Map(
										sp.fieldOverrides.map((fo: any) => [fo.field, fo.priority])
								  )
								: new Map(),
						})
					);
				}

				if (preferencesInput.conflictResolution) {
					preferences.conflictResolution = preferencesInput.conflictResolution;
				}

				if (preferencesInput.minConfidenceThreshold !== undefined) {
					preferences.minConfidenceThreshold =
						preferencesInput.minConfidenceThreshold;
				}

				if (preferencesInput.preferRecent !== undefined) {
					preferences.preferRecent = preferencesInput.preferRecent;
				}

				if (preferencesInput.fieldPreferences) {
					preferences.fieldPreferences = new Map(
						preferencesInput.fieldPreferences.map((fp: any) => [
							fp.field,
							fp.preferredSource,
						])
					);
				}

				if (preferencesInput.autoMerge) {
					preferences.autoMerge = {
						...preferences.autoMerge,
						...preferencesInput.autoMerge,
					};
				}

				await preferences.save();
				return preferences;
			} catch (error) {
				console.error("Error updating user preferences:", error);
				throw new Error("Failed to update user preferences");
			}
		},

		/**
		 * Manually set a metadata field (creates user override)
		 */
		setMetadataField: async (
			_: any,
			{ comicId, field, value }: { comicId: string; field: string; value: any }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				// Set the field with user override
				const fieldPath = `canonicalMetadata.${field}`;
				const update = {
					[fieldPath]: {
						value,
						provenance: {
							source: MetadataSource.MANUAL,
							confidence: 1.0,
							fetchedAt: new Date(),
						},
						userOverride: true,
					},
				};

				const updatedComic = await Comic.findByIdAndUpdate(
					comicId,
					{ $set: update },
					{ new: true }
				);

				return updatedComic;
			} catch (error) {
				console.error("Error setting metadata field:", error);
				throw new Error("Failed to set metadata field");
			}
		},

		/**
		 * Trigger metadata resolution for a comic
		 */
		resolveMetadata: async (_: any, { comicId }: { comicId: string }) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				// Build canonical metadata
				const canonical = buildCanonicalMetadata(
					comic.sourcedMetadata,
					convertPreferences(preferences)
				);

				// Update comic with canonical metadata
				comic.canonicalMetadata = canonical;
				await comic.save();

				return comic;
			} catch (error) {
				console.error("Error resolving metadata:", error);
				throw new Error("Failed to resolve metadata");
			}
		},

		/**
		 * Bulk resolve metadata for multiple comics
		 */
		bulkResolveMetadata: async (
			_: any,
			{ comicIds }: { comicIds: string[] }
		) => {
			try {
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				const resolvedComics = [];

				for (const comicId of comicIds) {
					const comic = await Comic.findById(comicId);
					if (comic) {
						const canonical = buildCanonicalMetadata(
							comic.sourcedMetadata,
							convertPreferences(preferences)
						);

						comic.canonicalMetadata = canonical;
						await comic.save();
						resolvedComics.push(comic);
					}
				}

				return resolvedComics;
			} catch (error) {
				console.error("Error bulk resolving metadata:", error);
				throw new Error("Failed to bulk resolve metadata");
			}
		},

		/**
		 * Remove user override for a field
		 */
		removeMetadataOverride: async (
			_: any,
			{ comicId, field }: { comicId: string; field: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				const preferences = await UserPreferences.findOne({
					userId: "default",
				});
				if (!preferences) {
					throw new Error("User preferences not found");
				}

				// Re-resolve the field without user override
				const candidates = extractCandidatesForField(
					field,
					comic.sourcedMetadata
				).filter((c) => !c.userOverride);

				const resolved = resolveMetadataField(
					field,
					candidates,
					convertPreferences(preferences)
				);

				if (resolved) {
					const fieldPath = `canonicalMetadata.${field}`;
					await Comic.findByIdAndUpdate(comicId, {
						$set: { [fieldPath]: resolved },
					});
				}

				const updatedComic = await Comic.findById(comicId);
				return updatedComic;
			} catch (error) {
				console.error("Error removing metadata override:", error);
				throw new Error("Failed to remove metadata override");
			}
		},

		/**
		 * Refresh metadata from a specific source
		 */
		refreshMetadataFromSource: async (
			_: any,
			{ comicId, source }: { comicId: string; source: MetadataSource }
		) => {
			try {
				// This would trigger a re-fetch from the external source
				// Implementation depends on your existing metadata fetching services
				throw new Error("Not implemented - requires integration with metadata services");
			} catch (error) {
				console.error("Error refreshing metadata from source:", error);
				throw new Error("Failed to refresh metadata from source");
			}
		},

		/**
		 * Import a new comic with automatic metadata resolution
		 */
		importComic: async (_: any, { input }: { input: any }) => {
			try {
				console.log("Importing comic via GraphQL:", input.filePath);

				// 1. Check if comic already exists
				const existingComic = await Comic.findOne({
					"rawFileDetails.name": input.rawFileDetails?.name,
				});

				if (existingComic) {
					return {
						success: false,
						comic: existingComic,
						message: "Comic already exists in the library",
						canonicalMetadataResolved: false,
					};
				}

				// 2. Prepare comic data
				const comicData: any = {
					importStatus: {
						isImported: true,
						tagged: false,
					},
				};

				// Add raw file details
				if (input.rawFileDetails) {
					comicData.rawFileDetails = input.rawFileDetails;
				}

				// Add inferred metadata
				if (input.inferredMetadata) {
					comicData.inferredMetadata = input.inferredMetadata;
				}

				// Add sourced metadata
				if (input.sourcedMetadata) {
					comicData.sourcedMetadata = {};
					
					if (input.sourcedMetadata.comicInfo) {
						comicData.sourcedMetadata.comicInfo = JSON.parse(
							input.sourcedMetadata.comicInfo
						);
					}
					if (input.sourcedMetadata.comicvine) {
						comicData.sourcedMetadata.comicvine = JSON.parse(
							input.sourcedMetadata.comicvine
						);
					}
					if (input.sourcedMetadata.metron) {
						comicData.sourcedMetadata.metron = JSON.parse(
							input.sourcedMetadata.metron
						);
					}
					if (input.sourcedMetadata.gcd) {
						comicData.sourcedMetadata.gcd = JSON.parse(
							input.sourcedMetadata.gcd
						);
					}
					if (input.sourcedMetadata.locg) {
						comicData.sourcedMetadata.locg = input.sourcedMetadata.locg;
					}
				}

				// Add wanted information
				if (input.wanted) {
					comicData.wanted = input.wanted;
				}

				// Add acquisition information
				if (input.acquisition) {
					comicData.acquisition = input.acquisition;
				}

				// 3. Create the comic document
				const comic = await Comic.create(comicData);
				console.log(`Comic created with ID: ${comic._id}`);

				// 4. Check if auto-resolution is enabled
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});

				let canonicalMetadataResolved = false;

				if (
					preferences?.autoMerge?.enabled &&
					preferences?.autoMerge?.onImport
				) {
					console.log("Auto-resolving canonical metadata...");

					// Build canonical metadata
					const canonical = buildCanonicalMetadata(
						comic.sourcedMetadata,
						convertPreferences(preferences)
					);

					// Update comic with canonical metadata
					comic.canonicalMetadata = canonical;
					await comic.save();

					canonicalMetadataResolved = true;
					console.log("Canonical metadata resolved successfully");
				}

				return {
					success: true,
					comic,
					message: "Comic imported successfully",
					canonicalMetadataResolved,
				};
			} catch (error) {
				console.error("Error importing comic:", error);
				throw new Error(`Failed to import comic: ${error.message}`);
			}
		},

		/**
		 * Update sourced metadata and trigger resolution
		 */
		updateSourcedMetadata: async (
			_: any,
			{
				comicId,
				source,
				metadata,
			}: { comicId: string; source: MetadataSource; metadata: string }
		) => {
			try {
				const comic = await Comic.findById(comicId);
				if (!comic) {
					throw new Error("Comic not found");
				}

				// Parse and update the sourced metadata
				const parsedMetadata = JSON.parse(metadata);
				const sourceKey = source.toLowerCase();

				if (!comic.sourcedMetadata) {
					comic.sourcedMetadata = {};
				}

				comic.sourcedMetadata[sourceKey] = parsedMetadata;
				await comic.save();

				console.log(
					`Updated ${source} metadata for comic ${comicId}`
				);

				// Check if auto-resolution is enabled
				const preferences = await UserPreferences.findOne({
					userId: "default",
				});

				if (
					preferences?.autoMerge?.enabled &&
					preferences?.autoMerge?.onMetadataUpdate
				) {
					console.log("Auto-resolving canonical metadata after update...");

					// Build canonical metadata
					const canonical = buildCanonicalMetadata(
						comic.sourcedMetadata,
						convertPreferences(preferences)
					);

					// Update comic with canonical metadata
					comic.canonicalMetadata = canonical;
					await comic.save();

					console.log("Canonical metadata resolved after update");
				}

				return comic;
			} catch (error) {
				console.error("Error updating sourced metadata:", error);
				throw new Error(`Failed to update sourced metadata: ${error.message}`);
			}
		},
	},

	// Field resolvers
	Comic: {
		id: (comic: any) => comic._id.toString(),
		sourcedMetadata: (comic: any) => ({
			comicInfo: JSON.stringify(comic.sourcedMetadata?.comicInfo || {}),
			comicvine: JSON.stringify(comic.sourcedMetadata?.comicvine || {}),
			metron: JSON.stringify(comic.sourcedMetadata?.metron || {}),
			gcd: JSON.stringify(comic.sourcedMetadata?.gcd || {}),
			locg: comic.sourcedMetadata?.locg || null,
		}),
	},

	UserPreferences: {
		id: (prefs: any) => prefs._id.toString(),
		fieldPreferences: (prefs: any) => {
			if (!prefs.fieldPreferences) return [];
			return Array.from(prefs.fieldPreferences.entries()).map(
				([field, preferredSource]) => ({
					field,
					preferredSource,
				})
			);
		},
		sourcePriorities: (prefs: any) => {
			return prefs.sourcePriorities.map((sp: any) => ({
				...sp,
				fieldOverrides: sp.fieldOverrides
					? Array.from(sp.fieldOverrides.entries()).map(([field, priority]) => ({
							field,
							priority,
					  }))
					: [],
			}));
		},
	},
};

/**
 * Helper: Extract candidates for a field from sourced metadata
 */
function extractCandidatesForField(
	field: string,
	sourcedMetadata: any
): MetadataField[] {
	const candidates: MetadataField[] = [];

	// Map field names to source paths
	const mappings: Record<string, any> = {
		title: [
			{ source: MetadataSource.COMICVINE, path: "name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Title", data: sourcedMetadata.comicInfo },
			{ source: MetadataSource.LOCG, path: "name", data: sourcedMetadata.locg },
		],
		series: [
			{ source: MetadataSource.COMICVINE, path: "volumeInformation.name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Series", data: sourcedMetadata.comicInfo },
		],
		issueNumber: [
			{ source: MetadataSource.COMICVINE, path: "issue_number", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.COMICINFO_XML, path: "Number", data: sourcedMetadata.comicInfo },
		],
		description: [
			{ source: MetadataSource.COMICVINE, path: "description", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.LOCG, path: "description", data: sourcedMetadata.locg },
			{ source: MetadataSource.COMICINFO_XML, path: "Summary", data: sourcedMetadata.comicInfo },
		],
		publisher: [
			{ source: MetadataSource.COMICVINE, path: "volumeInformation.publisher.name", data: sourcedMetadata.comicvine },
			{ source: MetadataSource.LOCG, path: "publisher", data: sourcedMetadata.locg },
			{ source: MetadataSource.COMICINFO_XML, path: "Publisher", data: sourcedMetadata.comicInfo },
		],
	};

	const fieldMappings = mappings[field] || [];

	for (const mapping of fieldMappings) {
		if (!mapping.data) continue;

		const value = getNestedValue(mapping.data, mapping.path);
		if (value !== null && value !== undefined) {
			candidates.push({
				value,
				provenance: {
					source: mapping.source,
					confidence: 0.9,
					fetchedAt: new Date(),
				},
			});
		}
	}

	return candidates;
}

/**
 * Helper: Get nested value from object
 */
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Helper: Convert UserPreferences model to ResolutionPreferences
 */
function convertPreferences(prefs: any): ResolutionPreferences {
	return {
		sourcePriorities: prefs.sourcePriorities.map((sp: any) => ({
			source: sp.source,
			priority: sp.priority,
			enabled: sp.enabled,
			fieldOverrides: sp.fieldOverrides,
		})),
		conflictResolution: prefs.conflictResolution,
		minConfidenceThreshold: prefs.minConfidenceThreshold,
		preferRecent: prefs.preferRecent,
		fieldPreferences: prefs.fieldPreferences,
	};
}

/**
 * Helper: Get resolution reason for display
 */
function getResolutionReason(
	resolved: MetadataField | null,
	candidates: MetadataField[],
	preferences: any
): string {
	if (!resolved) return "No valid candidates";

	if (resolved.userOverride) {
		return "User override";
	}

	const priority = preferences.getSourcePriority(resolved.provenance.source);
	return `Resolved using ${resolved.provenance.source} (priority: ${priority}, confidence: ${resolved.provenance.confidence})`;
}

/**
 * Helper: Apply preferences input to existing preferences
 */
function applyPreferencesInput(prefs: any, input: any): any {
	const updated = { ...prefs.toObject() };

	if (input.sourcePriorities) {
		updated.sourcePriorities = input.sourcePriorities;
	}
	if (input.conflictResolution) {
		updated.conflictResolution = input.conflictResolution;
	}
	if (input.minConfidenceThreshold !== undefined) {
		updated.minConfidenceThreshold = input.minConfidenceThreshold;
	}
	if (input.preferRecent !== undefined) {
		updated.preferRecent = input.preferRecent;
	}

	return updated;
}
