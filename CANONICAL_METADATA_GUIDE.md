# Canonical Comic Metadata Model - Implementation Guide

## 🎯 Overview

The canonical metadata model provides a comprehensive system for managing comic book metadata from multiple sources with proper **provenance tracking**, **confidence scoring**, and **conflict resolution**.

## 🏗️ Architecture

### **Core Components:**

1. **📋 Type Definitions** ([`models/canonical-comic.types.ts`](models/canonical-comic.types.ts:1))
2. **🎯 GraphQL Schema** ([`models/graphql/canonical-typedef.ts`](models/graphql/canonical-typedef.ts:1))  
3. **🔧 Resolution Engine** ([`utils/metadata-resolver.utils.ts`](utils/metadata-resolver.utils.ts:1))
4. **💾 Database Model** ([`models/canonical-comic.model.ts`](models/canonical-comic.model.ts:1))
5. **⚙️ Service Layer** ([`services/canonical-metadata.service.ts`](services/canonical-metadata.service.ts:1))

---

## 📊 Metadata Sources & Ranking

### **Source Priority (Highest to Lowest):**

```typescript
enum MetadataSourceRank {
    USER_MANUAL = 1,        // User overrides - highest priority
    COMICINFO_XML = 2,      // Embedded metadata - high trust
    COMICVINE = 3,          // ComicVine API - authoritative
    METRON = 4,             // Metron API - authoritative  
    GCD = 5,                // Grand Comics Database - community
    LOCG = 6,               // League of Comic Geeks - specialized
    LOCAL_FILE = 7          // Filename inference - lowest trust
}
```

### **Confidence Scoring:**
- **User Manual**: 1.0 (100% trusted)
- **ComicInfo.XML**: 0.8-0.95 (based on completeness)
- **ComicVine**: 0.9 (highly reliable API)  
- **Metron**: 0.85 (reliable API)
- **GCD**: 0.8 (community-maintained)
- **Local File**: 0.3 (inference-based)

---

## 🔄 Usage Examples

### **1. Import ComicVine Metadata**

```typescript
// REST API
POST /api/canonicalMetadata/importComicVine/60f7b1234567890abcdef123
{
  "comicVineData": {
    "id": 142857,
    "name": "Amazing Spider-Man #1",
    "issue_number": "1",
    "cover_date": "2023-01-01",
    "volume": {
      "id": 12345,
      "name": "Amazing Spider-Man",
      "start_year": 2023,
      "publisher": { "name": "Marvel Comics" }
    },
    "person_credits": [
      { "name": "Dan Slott", "role": "writer" }
    ]
  }
}
```

```typescript
// Service usage
const result = await broker.call('canonicalMetadata.importComicVineMetadata', {
  comicId: '60f7b1234567890abcdef123',
  comicVineData: comicVineData,
  forceUpdate: false
});
```

### **2. Import ComicInfo.XML**

```typescript
POST /api/canonicalMetadata/importComicInfo/60f7b1234567890abcdef123
{
  "xmlData": {
    "Title": "Amazing Spider-Man",
    "Series": "Amazing Spider-Man", 
    "Number": "1",
    "Year": 2023,
    "Month": 1,
    "Writer": "Dan Slott",
    "Penciller": "John Romita Jr",
    "Publisher": "Marvel Comics"
  }
}
```

### **3. Set Manual Metadata (Highest Priority)**

```typescript
PUT /api/canonicalMetadata/manual/60f7b1234567890abcdef123/title
{
  "value": "The Amazing Spider-Man #1",
  "confidence": 1.0,
  "notes": "User corrected title formatting"
}
```

### **4. Resolve Metadata Conflicts**

```typescript
// Get conflicts
GET /api/canonicalMetadata/conflicts/60f7b1234567890abcdef123

// Resolve by selecting preferred source
POST /api/canonicalMetadata/resolve/60f7b1234567890abcdef123/title
{
  "selectedSource": "COMICVINE"
}
```

### **5. Query with Source Filtering**

```graphql
query {
  searchComicsByMetadata(
    title: "Spider-Man"
    sources: [COMICVINE, COMICINFO_XML]
    minConfidence: 0.8
  ) {
    resolvedMetadata {
      title
      series { name volume publisher }
      creators { name role }
    }
    canonicalMetadata {
      title {
        value
        source
        confidence
        timestamp
        sourceUrl
      }
    }
  }
}
```

---

## 🔧 Data Structure

### **Canonical Metadata Storage:**

```typescript
{
  "canonicalMetadata": {
    "title": [
      {
        "value": "Amazing Spider-Man #1",
        "source": "COMICVINE",
        "confidence": 0.9,
        "rank": 3,
        "timestamp": "2023-01-15T10:00:00Z",
        "sourceId": "142857", 
        "sourceUrl": "https://comicvine.gamespot.com/issue/4000-142857/"
      },
      {
        "value": "Amazing Spider-Man",
        "source": "COMICINFO_XML",
        "confidence": 0.8,
        "rank": 2,
        "timestamp": "2023-01-15T09:00:00Z"
      }
    ],
    "creators": [
      {
        "value": [
          { "name": "Dan Slott", "role": "Writer" },
          { "name": "John Romita Jr", "role": "Penciller" }
        ],
        "source": "COMICINFO_XML",
        "confidence": 0.85,
        "rank": 2,
        "timestamp": "2023-01-15T09:00:00Z"
      }
    ]
  }
}
```

### **Resolved Metadata (Best Values):**

```typescript
{
  "resolvedMetadata": {
    "title": "Amazing Spider-Man #1",           // From ComicVine (higher confidence)
    "series": {
      "name": "Amazing Spider-Man",
      "volume": 1,
      "publisher": "Marvel Comics"
    },
    "creators": [
      { "name": "Dan Slott", "role": "Writer" },
      { "name": "John Romita Jr", "role": "Penciller" }
    ],
    "lastResolved": "2023-01-15T10:30:00Z",
    "resolutionConflicts": [
      {
        "field": "title",
        "conflictingValues": [
          { "value": "Amazing Spider-Man #1", "source": "COMICVINE", "confidence": 0.9 },
          { "value": "Amazing Spider-Man", "source": "COMICINFO_XML", "confidence": 0.8 }
        ]
      }
    ]
  }
}
```

---

## ⚙️ Resolution Strategies

### **Available Strategies:**

```typescript
const strategies = {
  // Use source with highest confidence score
  highest_confidence: { strategy: 'highest_confidence' },
  
  // Use source with highest rank (USER_MANUAL > COMICINFO_XML > COMICVINE...)
  highest_rank: { strategy: 'highest_rank' },
  
  // Use most recently added metadata  
  most_recent: { strategy: 'most_recent' },
  
  // Prefer user manual entries
  user_preference: { strategy: 'user_preference' },
  
  // Attempt to find consensus among sources
  consensus: { strategy: 'consensus' }
};
```

### **Custom Strategy:**

```typescript
const customStrategy: MetadataResolutionStrategy = {
  strategy: 'highest_rank',
  minimumConfidence: 0.7,
  allowedSources: [MetadataSource.COMICVINE, MetadataSource.COMICINFO_XML],
  fieldSpecificStrategies: {
    'creators': { strategy: 'consensus' },  // Merge creators from multiple sources
    'title': { strategy: 'highest_confidence' }  // Use most confident title
  }
};
```

---

## 🚀 Integration Workflow

### **1. Local File Import Process:**

```typescript
// 1. Extract file metadata
const localMetadata = extractLocalMetadata(filePath);
comic.addMetadata('title', inferredTitle, MetadataSource.LOCAL_FILE, 0.3);

// 2. Parse ComicInfo.XML (if exists)
if (comicInfoXML) {
  await broker.call('canonicalMetadata.importComicInfoXML', {
    comicId: comic._id,
    xmlData: comicInfoXML
  });
}

// 3. Enhance with external APIs
const comicVineMatch = await searchComicVine(comic.resolvedMetadata.title);
if (comicVineMatch) {
  await broker.call('canonicalMetadata.importComicVineMetadata', {
    comicId: comic._id, 
    comicVineData: comicVineMatch
  });
}

// 4. Resolve final metadata
await broker.call('canonicalMetadata.reResolveMetadata', {
  comicId: comic._id
});
```

### **2. Conflict Resolution Workflow:**

```typescript
// 1. Detect conflicts
const conflicts = await broker.call('canonicalMetadata.getMetadataConflicts', {
  comicId: comic._id
});

// 2. Present to user for resolution
if (conflicts.length > 0) {
  // Show UI with conflicting values and sources
  const userChoice = await presentConflictResolution(conflicts);
  
  // 3. Apply user's resolution
  await broker.call('canonicalMetadata.resolveMetadataConflict', {
    comicId: comic._id,
    field: userChoice.field,
    selectedSource: userChoice.source
  });
}
```

---

## 📈 Performance Considerations

### **Database Indexes:**
- ✅ **Text search**: `resolvedMetadata.title`, `resolvedMetadata.series.name`
- ✅ **Unique identification**: `series.name` + `volume` + `issueNumber`  
- ✅ **Source filtering**: `canonicalMetadata.*.source` + `confidence`
- ✅ **Import status**: `importStatus.isImported` + `tagged`

### **Optimization Tips:**
- **Batch metadata imports** for large collections
- **Cache resolved metadata** for frequently accessed comics
- **Index on confidence scores** for quality filtering
- **Paginate conflict resolution** for large libraries

---

## 🛡️ Best Practices

### **Data Quality:**
1. **Always validate** external API responses before import
2. **Set appropriate confidence** scores based on source reliability  
3. **Preserve original data** in source-specific fields
4. **Log metadata changes** for audit trails

### **Conflict Management:**
1. **Prefer user overrides** for disputed fields
2. **Use consensus** for aggregatable fields (creators, characters)
3. **Maintain provenance** links to original sources
4. **Provide clear UI** for conflict resolution

### **Performance:**
1. **Re-resolve metadata** only when sources change
2. **Cache frequently accessed** resolved metadata
3. **Batch operations** for bulk imports
4. **Use appropriate indexes** for common queries

---

This canonical metadata model provides enterprise-grade metadata management with full provenance tracking, confidence scoring, and flexible conflict resolution for comic book collections of any size.