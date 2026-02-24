/**
 * GraphQL Import Utilities
 * Helper functions for importing comics using GraphQL mutations
 */

import { ServiceBroker } from "moleculer";

/**
 * Import a comic using GraphQL mutation
 */
export async function importComicViaGraphQL(
	broker: ServiceBroker,
	importData: {
		filePath: string;
		fileSize?: number;
		sourcedMetadata?: {
			comicInfo?: any;
			comicvine?: any;
			metron?: any;
			gcd?: any;
			locg?: any;
		};
		inferredMetadata?: {
			issue: {
				name?: string;
				number?: number;
				year?: string;
				subtitle?: string;
			};
		};
		rawFileDetails: {
			name: string;
			filePath: string;
			fileSize?: number;
			extension?: string;
			mimeType?: string;
			containedIn?: string;
			pageCount?: number;
		};
		wanted?: {
			source?: string;
			markEntireVolumeWanted?: boolean;
			issues?: any[];
			volume?: any;
		};
		acquisition?: {
			source?: {
				wanted?: boolean;
				name?: string;
			};
			directconnect?: {
				downloads?: any[];
			};
		};
	}
): Promise<{
	success: boolean;
	comic: any;
	message: string;
	canonicalMetadataResolved: boolean;
}> {
	const mutation = `
		mutation ImportComic($input: ImportComicInput!) {
			importComic(input: $input) {
				success
				message
				canonicalMetadataResolved
				comic {
					id
					canonicalMetadata {
						title { value, provenance { source, confidence } }
						series { value, provenance { source } }
						issueNumber { value, provenance { source } }
						publisher { value, provenance { source } }
						description { value, provenance { source } }
					}
					rawFileDetails {
						name
						filePath
						fileSize
					}
				}
			}
		}
	`;

	// Prepare input
	const input: any = {
		filePath: importData.filePath,
		rawFileDetails: importData.rawFileDetails,
	};

	if (importData.fileSize) {
		input.fileSize = importData.fileSize;
	}

	if (importData.inferredMetadata) {
		input.inferredMetadata = importData.inferredMetadata;
	}

	if (importData.sourcedMetadata) {
		input.sourcedMetadata = {};

		if (importData.sourcedMetadata.comicInfo) {
			input.sourcedMetadata.comicInfo = JSON.stringify(
				importData.sourcedMetadata.comicInfo
			);
		}
		if (importData.sourcedMetadata.comicvine) {
			input.sourcedMetadata.comicvine = JSON.stringify(
				importData.sourcedMetadata.comicvine
			);
		}
		if (importData.sourcedMetadata.metron) {
			input.sourcedMetadata.metron = JSON.stringify(
				importData.sourcedMetadata.metron
			);
		}
		if (importData.sourcedMetadata.gcd) {
			input.sourcedMetadata.gcd = JSON.stringify(
				importData.sourcedMetadata.gcd
			);
		}
		if (importData.sourcedMetadata.locg) {
			input.sourcedMetadata.locg = importData.sourcedMetadata.locg;
		}
	}

	if (importData.wanted) {
		input.wanted = importData.wanted;
	}

	if (importData.acquisition) {
		input.acquisition = importData.acquisition;
	}

	try {
		const result: any = await broker.call("graphql.query", {
			query: mutation,
			variables: { input },
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.importComic;
	} catch (error) {
		console.error("Error importing comic via GraphQL:", error);
		throw error;
	}
}

/**
 * Update sourced metadata for a comic using GraphQL
 */
export async function updateSourcedMetadataViaGraphQL(
	broker: ServiceBroker,
	comicId: string,
	source: string,
	metadata: any
): Promise<any> {
	const mutation = `
		mutation UpdateSourcedMetadata(
			$comicId: ID!
			$source: MetadataSource!
			$metadata: String!
		) {
			updateSourcedMetadata(
				comicId: $comicId
				source: $source
				metadata: $metadata
			) {
				id
				canonicalMetadata {
					title { value, provenance { source } }
					series { value, provenance { source } }
					publisher { value, provenance { source } }
				}
			}
		}
	`;

	try {
		const result: any = await broker.call("graphql.query", {
			query: mutation,
			variables: {
				comicId,
				source: source.toUpperCase(),
				metadata: JSON.stringify(metadata),
			},
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.updateSourcedMetadata;
	} catch (error) {
		console.error("Error updating sourced metadata via GraphQL:", error);
		throw error;
	}
}

/**
 * Resolve canonical metadata for a comic using GraphQL
 */
export async function resolveMetadataViaGraphQL(
	broker: ServiceBroker,
	comicId: string
): Promise<any> {
	const mutation = `
		mutation ResolveMetadata($comicId: ID!) {
			resolveMetadata(comicId: $comicId) {
				id
				canonicalMetadata {
					title { value, provenance { source, confidence } }
					series { value, provenance { source, confidence } }
					issueNumber { value, provenance { source } }
					publisher { value, provenance { source } }
					description { value, provenance { source } }
					coverDate { value, provenance { source } }
					pageCount { value, provenance { source } }
				}
			}
		}
	`;

	try {
		const result: any = await broker.call("graphql.query", {
			query: mutation,
			variables: { comicId },
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.resolveMetadata;
	} catch (error) {
		console.error("Error resolving metadata via GraphQL:", error);
		throw error;
	}
}

/**
 * Get comic with canonical metadata using GraphQL
 */
export async function getComicViaGraphQL(
	broker: ServiceBroker,
	comicId: string
): Promise<any> {
	const query = `
		query GetComic($id: ID!) {
			comic(id: $id) {
				id
				canonicalMetadata {
					title { value, provenance { source, confidence, fetchedAt } }
					series { value, provenance { source, confidence } }
					issueNumber { value, provenance { source } }
					publisher { value, provenance { source } }
					description { value, provenance { source } }
					coverDate { value, provenance { source } }
					pageCount { value, provenance { source } }
					creators {
						name
						role
						provenance { source, confidence }
					}
				}
				rawFileDetails {
					name
					filePath
					fileSize
					extension
					pageCount
				}
				importStatus {
					isImported
					tagged
				}
			}
		}
	`;

	try {
		const result: any = await broker.call("graphql.query", {
			query,
			variables: { id: comicId },
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.comic;
	} catch (error) {
		console.error("Error getting comic via GraphQL:", error);
		throw error;
	}
}

/**
 * Analyze metadata conflicts for a comic
 */
export async function analyzeMetadataConflictsViaGraphQL(
	broker: ServiceBroker,
	comicId: string
): Promise<any[]> {
	const query = `
		query AnalyzeConflicts($comicId: ID!) {
			analyzeMetadataConflicts(comicId: $comicId) {
				field
				candidates {
					value
					provenance {
						source
						confidence
						fetchedAt
					}
				}
				resolved {
					value
					provenance {
						source
						confidence
					}
				}
				resolutionReason
			}
		}
	`;

	try {
		const result: any = await broker.call("graphql.query", {
			query,
			variables: { comicId },
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.analyzeMetadataConflicts;
	} catch (error) {
		console.error("Error analyzing conflicts via GraphQL:", error);
		throw error;
	}
}

/**
 * Bulk resolve metadata for multiple comics
 */
export async function bulkResolveMetadataViaGraphQL(
	broker: ServiceBroker,
	comicIds: string[]
): Promise<any[]> {
	const mutation = `
		mutation BulkResolve($comicIds: [ID!]!) {
			bulkResolveMetadata(comicIds: $comicIds) {
				id
				canonicalMetadata {
					title { value }
					series { value }
				}
			}
		}
	`;

	try {
		const result: any = await broker.call("graphql.query", {
			query: mutation,
			variables: { comicIds },
		});

		if (result.errors) {
			console.error("GraphQL errors:", result.errors);
			throw new Error(result.errors[0].message);
		}

		return result.data.bulkResolveMetadata;
	} catch (error) {
		console.error("Error bulk resolving metadata via GraphQL:", error);
		throw error;
	}
}
