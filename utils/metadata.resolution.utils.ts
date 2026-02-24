import { MetadataSource } from "../models/comic.model";
import { ConflictResolutionStrategy } from "../models/userpreferences.model";

/**
 * Metadata field with provenance information
 */
export interface MetadataField {
	value: any;
	provenance: {
		source: MetadataSource;
		sourceId?: string;
		confidence: number;
		fetchedAt: Date;
		url?: string;
	};
	userOverride?: boolean;
}

/**
 * User preferences for metadata resolution
 */
export interface ResolutionPreferences {
	sourcePriorities: Array<{
		source: MetadataSource;
		priority: number;
		enabled: boolean;
		fieldOverrides?: Map<string, number>;
	}>;
	conflictResolution: ConflictResolutionStrategy;
	minConfidenceThreshold: number;
	preferRecent: boolean;
	fieldPreferences?: Map<string, MetadataSource>;
}

/**
 * Resolve a single metadata field from multiple sources
 */
export function resolveMetadataField(
	fieldName: string,
	candidates: MetadataField[],
	preferences: ResolutionPreferences
): MetadataField | null {
	// Filter out invalid candidates
	const validCandidates = candidates.filter(
		(c) =>
			c &&
			c.value !== null &&
			c.value !== undefined &&
			c.provenance &&
			c.provenance.confidence >= preferences.minConfidenceThreshold
	);

	if (validCandidates.length === 0) {
		return null;
	}

	// Always prefer user overrides
	const userOverride = validCandidates.find((c) => c.userOverride);
	if (userOverride) {
		return userOverride;
	}

	// Check for field-specific preference
	if (preferences.fieldPreferences?.has(fieldName)) {
		const preferredSource = preferences.fieldPreferences.get(fieldName);
		const preferred = validCandidates.find(
			(c) => c.provenance.source === preferredSource
		);
		if (preferred) {
			return preferred;
		}
	}

	// Apply resolution strategy
	switch (preferences.conflictResolution) {
		case ConflictResolutionStrategy.PRIORITY:
			return resolveByPriority(fieldName, validCandidates, preferences);

		case ConflictResolutionStrategy.CONFIDENCE:
			return resolveByConfidence(validCandidates, preferences);

		case ConflictResolutionStrategy.RECENCY:
			return resolveByRecency(validCandidates);

		case ConflictResolutionStrategy.MANUAL:
			// Already handled user overrides above
			return resolveByPriority(fieldName, validCandidates, preferences);

		case ConflictResolutionStrategy.HYBRID:
		default:
			return resolveHybrid(fieldName, validCandidates, preferences);
	}
}

/**
 * Resolve by source priority
 */
function resolveByPriority(
	fieldName: string,
	candidates: MetadataField[],
	preferences: ResolutionPreferences
): MetadataField {
	const sorted = [...candidates].sort((a, b) => {
		const priorityA = getSourcePriority(
			a.provenance.source,
			fieldName,
			preferences
		);
		const priorityB = getSourcePriority(
			b.provenance.source,
			fieldName,
			preferences
		);
		return priorityA - priorityB;
	});

	return sorted[0];
}

/**
 * Resolve by confidence score
 */
function resolveByConfidence(
	candidates: MetadataField[],
	preferences: ResolutionPreferences
): MetadataField {
	const sorted = [...candidates].sort((a, b) => {
		const diff = b.provenance.confidence - a.provenance.confidence;
		// If confidence is equal and preferRecent is true, use recency
		if (diff === 0 && preferences.preferRecent) {
			return (
				b.provenance.fetchedAt.getTime() - a.provenance.fetchedAt.getTime()
			);
		}
		return diff;
	});

	return sorted[0];
}

/**
 * Resolve by recency (most recently fetched)
 */
function resolveByRecency(candidates: MetadataField[]): MetadataField {
	const sorted = [...candidates].sort(
		(a, b) =>
			b.provenance.fetchedAt.getTime() - a.provenance.fetchedAt.getTime()
	);

	return sorted[0];
}

/**
 * Hybrid resolution: combines priority and confidence
 */
function resolveHybrid(
	fieldName: string,
	candidates: MetadataField[],
	preferences: ResolutionPreferences
): MetadataField {
	// Calculate a weighted score for each candidate
	const scored = candidates.map((candidate) => {
		const priority = getSourcePriority(
			candidate.provenance.source,
			fieldName,
			preferences
		);
		const confidence = candidate.provenance.confidence;

		// Normalize priority (lower is better, so invert)
		const maxPriority = Math.max(
			...preferences.sourcePriorities.map((sp) => sp.priority)
		);
		const normalizedPriority = 1 - (priority - 1) / maxPriority;

		// Weighted score: 60% priority, 40% confidence
		const score = normalizedPriority * 0.6 + confidence * 0.4;

		// Add recency bonus if enabled
		let recencyBonus = 0;
		if (preferences.preferRecent) {
			const now = Date.now();
			const age = now - candidate.provenance.fetchedAt.getTime();
			const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
			recencyBonus = Math.max(0, 1 - age / maxAge) * 0.1; // Up to 10% bonus
		}

		return {
			candidate,
			score: score + recencyBonus,
		};
	});

	// Sort by score (highest first)
	scored.sort((a, b) => b.score - a.score);

	return scored[0].candidate;
}

/**
 * Get priority for a source, considering field-specific overrides
 */
function getSourcePriority(
	source: MetadataSource,
	fieldName: string,
	preferences: ResolutionPreferences
): number {
	const sourcePriority = preferences.sourcePriorities.find(
		(sp) => sp.source === source && sp.enabled
	);

	if (!sourcePriority) {
		return Infinity; // Disabled or not configured
	}

	// Check for field-specific override
	if (sourcePriority.fieldOverrides?.has(fieldName)) {
		return sourcePriority.fieldOverrides.get(fieldName)!;
	}

	return sourcePriority.priority;
}

/**
 * Merge array fields (e.g., creators, tags) from multiple sources
 */
export function mergeArrayField(
	fieldName: string,
	sources: Array<{ source: MetadataSource; values: any[]; confidence: number }>,
	preferences: ResolutionPreferences
): any[] {
	const allValues: any[] = [];
	const seen = new Set<string>();

	// Sort sources by priority
	const sortedSources = [...sources].sort((a, b) => {
		const priorityA = getSourcePriority(a.source, fieldName, preferences);
		const priorityB = getSourcePriority(b.source, fieldName, preferences);
		return priorityA - priorityB;
	});

	// Merge values, avoiding duplicates
	for (const source of sortedSources) {
		for (const value of source.values) {
			const key =
				typeof value === "string"
					? value.toLowerCase()
					: JSON.stringify(value);

			if (!seen.has(key)) {
				seen.add(key);
				allValues.push(value);
			}
		}
	}

	return allValues;
}

/**
 * Build canonical metadata from multiple sources
 */
export function buildCanonicalMetadata(
	sourcedMetadata: {
		comicInfo?: any;
		comicvine?: any;
		metron?: any;
		gcd?: any;
		locg?: any;
	},
	preferences: ResolutionPreferences
): any {
	const canonical: any = {};

	// Define field mappings from each source
	const fieldMappings = {
		title: [
			{
				source: MetadataSource.COMICVINE,
				path: "name",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.METRON,
				path: "name",
				data: sourcedMetadata.metron,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "Title",
				data: sourcedMetadata.comicInfo,
			},
			{
				source: MetadataSource.LOCG,
				path: "name",
				data: sourcedMetadata.locg,
			},
		],
		series: [
			{
				source: MetadataSource.COMICVINE,
				path: "volumeInformation.name",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "Series",
				data: sourcedMetadata.comicInfo,
			},
		],
		issueNumber: [
			{
				source: MetadataSource.COMICVINE,
				path: "issue_number",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "Number",
				data: sourcedMetadata.comicInfo,
			},
		],
		description: [
			{
				source: MetadataSource.COMICVINE,
				path: "description",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.LOCG,
				path: "description",
				data: sourcedMetadata.locg,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "Summary",
				data: sourcedMetadata.comicInfo,
			},
		],
		publisher: [
			{
				source: MetadataSource.COMICVINE,
				path: "volumeInformation.publisher.name",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.LOCG,
				path: "publisher",
				data: sourcedMetadata.locg,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "Publisher",
				data: sourcedMetadata.comicInfo,
			},
		],
		coverDate: [
			{
				source: MetadataSource.COMICVINE,
				path: "cover_date",
				data: sourcedMetadata.comicvine,
			},
			{
				source: MetadataSource.COMICINFO_XML,
				path: "CoverDate",
				data: sourcedMetadata.comicInfo,
			},
		],
		pageCount: [
			{
				source: MetadataSource.COMICINFO_XML,
				path: "PageCount",
				data: sourcedMetadata.comicInfo,
			},
		],
	};

	// Resolve each field
	for (const [fieldName, mappings] of Object.entries(fieldMappings)) {
		const candidates: MetadataField[] = [];

		for (const mapping of mappings) {
			if (!mapping.data) continue;

			const value = getNestedValue(mapping.data, mapping.path);
			if (value !== null && value !== undefined) {
				candidates.push({
					value,
					provenance: {
						source: mapping.source,
						confidence: 0.9, // Default confidence
						fetchedAt: new Date(),
					},
				});
			}
		}

		if (candidates.length > 0) {
			const resolved = resolveMetadataField(fieldName, candidates, preferences);
			if (resolved) {
				canonical[fieldName] = resolved;
			}
		}
	}

	return canonical;
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Compare two metadata values for equality
 */
export function metadataValuesEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((val, idx) => metadataValuesEqual(val, b[idx]));
	}

	if (typeof a === "object" && a !== null && b !== null) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;
		return keysA.every((key) => metadataValuesEqual(a[key], b[key]));
	}

	return false;
}
