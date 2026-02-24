const mongoose = require("mongoose");
import { MetadataSource } from "./comic.model";

// Source priority configuration
const SourcePrioritySchema = new mongoose.Schema(
	{
		_id: false,
		source: {
			type: String,
			enum: Object.values(MetadataSource),
			required: true,
		},
		priority: {
			type: Number,
			required: true,
			min: 1,
		}, // Lower number = higher priority (1 is highest)
		enabled: {
			type: Boolean,
			default: true,
		},
		// Field-specific overrides
		fieldOverrides: {
			type: Map,
			of: Number, // field name -> priority for that specific field
			default: new Map(),
		},
	},
	{ _id: false }
);

// Conflict resolution strategy
export enum ConflictResolutionStrategy {
	PRIORITY = "priority", // Use source priority
	CONFIDENCE = "confidence", // Use confidence score
	RECENCY = "recency", // Use most recently fetched
	MANUAL = "manual", // Always prefer manual entries
	HYBRID = "hybrid", // Combine priority and confidence
}

// User preferences for metadata resolution
const UserPreferencesSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			unique: true,
			default: "default",
		}, // Support for multi-user in future
		
		// Source priority configuration
		sourcePriorities: {
			type: [SourcePrioritySchema],
			default: [
				{
					source: MetadataSource.MANUAL,
					priority: 1,
					enabled: true,
				},
				{
					source: MetadataSource.COMICVINE,
					priority: 2,
					enabled: true,
				},
				{
					source: MetadataSource.METRON,
					priority: 3,
					enabled: true,
				},
				{
					source: MetadataSource.GRAND_COMICS_DATABASE,
					priority: 4,
					enabled: true,
				},
				{
					source: MetadataSource.LOCG,
					priority: 5,
					enabled: true,
				},
				{
					source: MetadataSource.COMICINFO_XML,
					priority: 6,
					enabled: true,
				},
			],
		},
		
		// Global conflict resolution strategy
		conflictResolution: {
			type: String,
			enum: Object.values(ConflictResolutionStrategy),
			default: ConflictResolutionStrategy.HYBRID,
		},
		
		// Minimum confidence threshold (0-1)
		minConfidenceThreshold: {
			type: Number,
			min: 0,
			max: 1,
			default: 0.5,
		},
		
		// Prefer newer data when confidence/priority are equal
		preferRecent: {
			type: Boolean,
			default: true,
		},
		
		// Field-specific preferences
		fieldPreferences: {
			// Always prefer certain sources for specific fields
			// e.g., { "description": "comicvine", "coverImage": "locg" }
			type: Map,
			of: String,
			default: new Map(),
		},
		
		// Auto-merge settings
		autoMerge: {
			enabled: { type: Boolean, default: true },
			onImport: { type: Boolean, default: true },
			onMetadataUpdate: { type: Boolean, default: true },
		},
	},
	{ timestamps: true }
);

// Helper method to get priority for a source
UserPreferencesSchema.methods.getSourcePriority = function (
	source: MetadataSource,
	field?: string
): number {
	const sourcePriority = this.sourcePriorities.find(
		(sp: any) => sp.source === source && sp.enabled
	);
	
	if (!sourcePriority) {
		return Infinity; // Disabled or not configured
	}
	
	// Check for field-specific override
	if (field && sourcePriority.fieldOverrides.has(field)) {
		return sourcePriority.fieldOverrides.get(field);
	}
	
	return sourcePriority.priority;
};

// Helper method to check if source is enabled
UserPreferencesSchema.methods.isSourceEnabled = function (
	source: MetadataSource
): boolean {
	const sourcePriority = this.sourcePriorities.find(
		(sp: any) => sp.source === source
	);
	return sourcePriority ? sourcePriority.enabled : false;
};

const UserPreferences = mongoose.model(
	"UserPreferences",
	UserPreferencesSchema
);

export default UserPreferences;
