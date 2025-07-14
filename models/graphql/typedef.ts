import { gql } from "graphql-tag";

export const typeDefs = gql`
  type Query {
    comic(id: ID!): Comic
    comics(limit: Int = 10): [Comic]
  }

  type Comic {
    id: ID!
    title: String
    volume: Int
    issueNumber: String
    publicationDate: String
    coverUrl: String
    creators: [Creator]
    source: String
  }

  type Creator {
    name: String
    role: String
  }
`;
