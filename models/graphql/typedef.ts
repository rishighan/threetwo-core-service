import { gql } from "graphql-tag";

export const typeDefs = gql`
	type Query {
		comic(id: ID!): Comic
		comics(limit: Int = 10): [Comic]
		wantedComics(limit: Int = 25, offset: Int = 0): ComicPage!
	}

	type Comic {
		id: ID!
		title: String!
		volume: Int
		issueNumber: String!
		publicationDate: String
		variant: String
		format: String
		creators: [Creator!]!
		arcs: [String!]
		coverUrl: String
		filePath: String
		pageCount: Int
		tags: [String!]
		source: String

		confidence: ConfidenceMap
		provenance: ProvenanceMap
	}

	type Creator {
		name: String!
		role: String!
	}

	type ConfidenceMap {
		title: Float
		volume: Float
		issueNumber: Float
		publicationDate: Float
		creators: Float
		variant: Float
		format: Float
	}

	type ProvenanceMap {
		title: String
		volume: String
		issueNumber: String
		publicationDate: String
		creators: String
		variant: String
		format: String
	}

	type ComicPage {
		total: Int!
		results: [Comic!]!
	}
`;
