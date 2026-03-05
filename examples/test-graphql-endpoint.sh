#!/bin/bash

# Test GraphQL Endpoint Script
# This script tests the GraphQL endpoint with various queries

GRAPHQL_URL="http://localhost:3000/graphql"

echo "🧪 Testing GraphQL Endpoint: $GRAPHQL_URL"
echo "================================================"
echo ""

# Test 1: List Comics
echo "📚 Test 1: List Comics (first 5)"
echo "--------------------------------"
curl -s -X POST $GRAPHQL_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { comics(limit: 5) { comics { id rawFileDetails { name pageCount } } totalCount } }"
  }' | jq '.'
echo ""
echo ""

# Test 2: Get Single Comic (you need to replace COMIC_ID)
echo "📖 Test 2: Get Single Comic"
echo "--------------------------------"
echo "⚠️  Replace COMIC_ID with an actual comic ID from your database"
read -p "Enter Comic ID (or press Enter to skip): " COMIC_ID

if [ ! -z "$COMIC_ID" ]; then
  curl -s -X POST $GRAPHQL_URL \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"query GetComic(\$id: ID!) { comic(id: \$id) { id rawFileDetails { name filePath fileSize pageCount } sourcedMetadata { locg { name publisher rating } } } }\",
      \"variables\": { \"id\": \"$COMIC_ID\" }
    }" | jq '.'
else
  echo "Skipped"
fi
echo ""
echo ""

# Test 3: Get User Preferences
echo "⚙️  Test 3: Get User Preferences"
echo "--------------------------------"
curl -s -X POST $GRAPHQL_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { userPreferences(userId: \"default\") { id userId conflictResolution minConfidenceThreshold autoMerge { enabled onImport onMetadataUpdate } } }"
  }' | jq '.'
echo ""
echo ""

# Test 4: Search Comics
echo "🔍 Test 4: Search Comics"
echo "--------------------------------"
read -p "Enter search term (or press Enter to skip): " SEARCH_TERM

if [ ! -z "$SEARCH_TERM" ]; then
  curl -s -X POST $GRAPHQL_URL \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"query SearchComics(\$search: String) { comics(search: \$search, limit: 10) { comics { id rawFileDetails { name } } totalCount } }\",
      \"variables\": { \"search\": \"$SEARCH_TERM\" }
    }" | jq '.'
else
  echo "Skipped"
fi
echo ""
echo ""

# Test 5: GraphQL Introspection (get schema info)
echo "🔬 Test 5: Introspection - Available Queries"
echo "--------------------------------"
curl -s -X POST $GRAPHQL_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ __schema { queryType { fields { name description } } } }"
  }' | jq '.data.__schema.queryType.fields[] | {name, description}'
echo ""
echo ""

echo "✅ GraphQL endpoint tests complete!"
echo ""
echo "💡 Tips:"
echo "  - Open http://localhost:3000/graphql in your browser for GraphQL Playground"
echo "  - Use 'jq' for better JSON formatting (install with: apt-get install jq)"
echo "  - Check the docs at: docs/FRONTEND_GRAPHQL_INTEGRATION.md"
