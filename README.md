# ThreeTwo Core Service

**A comprehensive comic book library management system** built as a high-performance Moleculer microservices architecture. ThreeTwo automatically processes comic archives (CBR, CBZ, CB7), extracts metadata, generates thumbnails, and provides powerful search and real-time synchronization capabilities.

## 🎯 What This Service Does

ThreeTwo transforms chaotic comic book collections into intelligently organized, searchable digital libraries by:

- **📚 Automated Library Management** - Monitors directories and automatically imports new comics
- **🧠 Intelligent Metadata Extraction** - Parses ComicInfo.XML and enriches data from external APIs (ComicVine)
- **🔍 Advanced Search** - ElasticSearch-powered multi-field search with confidence scoring
- **📱 Real-time Updates** - Live progress tracking and notifications via Socket.IO
- **🎨 Media Processing** - Automatic thumbnail generation and image optimization

## 🏗️ Architecture

Built on **Moleculer microservices** with the following core services:

```
API Gateway (REST) ←→ GraphQL API ←→ Socket.IO Hub
                     ↓
Library Service ←→ Search Service ←→ Job Queue Service
                     ↓
MongoDB ←→ Elasticsearch ←→ Redis (Cache/Queue)
```

### **Key Features:**
- **Multi-format Support** - CBR, CBZ, CB7 archive processing
- **Confidence Tracking** - Metadata quality assessment and provenance
- **Job Queue System** - Background processing with BullMQ and Redis
- **Debounced File Watching** - Efficient file system monitoring
- **Batch Operations** - Scalable bulk import handling
- **Real-time Sync** - Live updates across all connected clients

## 🚀 API Interfaces

- **REST API** - `http://localhost:3000/api/` - Traditional HTTP endpoints
- **GraphQL API** - `http://localhost:4000/graphql` - Modern query interface  
- **Socket.IO** - Real-time events and progress tracking
- **Static Assets** - Direct access to comic covers and images

## 🛠️ Technology Stack

- **Backend**: Moleculer, Node.js, TypeScript
- **Database**: MongoDB (persistence), Elasticsearch (search), Redis (cache/queue)
- **Processing**: BullMQ (job queues), Sharp (image processing)
- **Communication**: Socket.IO (real-time), GraphQL + REST APIs

## 📋 Prerequisites

You need the following dependencies installed:

- **MongoDB** - Document database for comic metadata
- **Elasticsearch** - Full-text search and analytics
- **Redis** - Caching and job queue backend
- **System Binaries**: `unrar` and `p7zip` for archive extraction

## 🚀 Local Development

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd threetwo-core-service
   npm install
   ```

2. **Environment Setup**
   ```bash
   COMICS_DIRECTORY=<PATH_TO_COMICS_DIRECTORY> \
   USERDATA_DIRECTORY=<PATH_TO_USERDATA_DIRECTORY> \
   REDIS_URI=redis://<REDIS_HOST:REDIS_PORT> \
   ELASTICSEARCH_URI=<ELASTICSEARCH_HOST:ELASTICSEARCH_PORT> \
   MONGO_URI=mongodb://<MONGO_HOST:MONGO_PORT>/threetwo \
   UNRAR_BIN_PATH=<UNRAR_BIN_PATH> \
   SEVENZ_BINARY_PATH=<SEVENZ_BINARY_PATH> \
   npm run dev
   ```

3. **Service Access**
   - **Main API**: `http://localhost:3000/api/<serviceName>/*`
   - **GraphQL Playground**: `http://localhost:4000/graphql`
   - **Admin Interface**: `http://localhost:3000/` (Moleculer dashboard)

## 🐳 Docker Deployment

```bash
# Build the image
docker build . -t threetwo-core-service

# Run with docker-compose (recommended)
docker-compose up -d

# Or run standalone
docker run -it threetwo-core-service
```

## 📊 Performance Features

- **Smart Debouncing** - 200ms file system event debouncing prevents overload
- **Batch Processing** - Efficient handling of bulk import operations  
- **Multi-level Caching** - Memory + Redis caching for optimal performance
- **Job Queues** - Background processing prevents UI blocking
- **Connection Pooling** - Efficient database connection management

## 🔧 Core Services

| Service | Purpose | Key Features |
|---------|---------|--------------|
| **API Gateway** | REST endpoints + file watching | CORS, rate limiting, static serving |
| **GraphQL** | Modern query interface | Flexible queries, pagination |
| **Library** | Core CRUD operations | Comic management, metadata handling |
| **Search** | ElasticSearch integration | Multi-field search, aggregations |
| **Job Queue** | Background processing | Import jobs, progress tracking |
| **Socket** | Real-time communication | Live updates, session management |

## 📈 Use Cases

- **Personal Collections** - Organize digital comic libraries (hundreds to thousands)
- **Digital Libraries** - Professional-grade comic archive management
- **Developer Integration** - API access for custom comic applications
- **Bulk Processing** - Large-scale comic digitization projects

## 🛡️ Security & Reliability

- **Input Validation** - Comprehensive parameter validation
- **File Type Verification** - Magic number verification for security
- **Error Handling** - Graceful degradation and recovery
- **Health Monitoring** - Service health checks and diagnostics

## 🧩 Recent Enhancements

### Canonical Metadata System
A comprehensive **canonical metadata model** with full provenance tracking has been implemented to unify metadata from multiple sources:

- **Multi-Source Integration**: ComicVine, Metron, GCD, ComicInfo.XML, local files, and user manual entries
- **Source Ranking System**: Prioritized confidence scoring with USER_MANUAL (1) → COMICINFO_XML (2) → COMICVINE (3) → METRON (4) → GCD (5) → LOCG (6) → LOCAL_FILE (7)
- **Conflict Resolution**: Automatic metadata merging with confidence scoring and source attribution
- **Performance Optimized**: Proper indexing, batch processing, and caching strategies

### Complete Service Architecture Analysis
Comprehensive analysis of all **12 Moleculer services** with detailed endpoint documentation:

| Service | Endpoints | Primary Function |
|---------|-----------|------------------|
| [`api`](services/api.service.ts:1) | Gateway | REST API + file watching with 200ms debouncing |
| [`library`](services/library.service.ts:1) | 21 endpoints | Core CRUD operations and metadata management |
| [`search`](services/search.service.ts:1) | 8 endpoints | Elasticsearch integration and multi-search |
| [`jobqueue`](services/jobqueue.service.ts:1) | Queue mgmt | BullMQ job processing with Redis backend |
| [`graphql`](services/graphql.service.ts:1) | GraphQL API | Modern query interface with resolvers |
| [`socket`](services/socket.service.ts:1) | Real-time | Socket.IO communication with session management |
| [`canonicalMetadata`](services/canonical-metadata.service.ts:1) | 6 endpoints | **NEW**: Metadata provenance and conflict resolution |
| `airdcpp` | Integration | AirDC++ connectivity for P2P operations |
| `imagetransformation` | Processing | Image optimization and thumbnail generation |
| `opds` | Protocol | Open Publication Distribution System support |
| `settings` | Configuration | System-wide configuration management |
| `torrentjobs` | Downloads | Torrent-based comic acquisition |

### Performance Optimizations Identified
- **Debouncing**: 200ms file system event debouncing prevents overload
- **Job Queues**: Background processing with BullMQ prevents UI blocking
- **Caching Strategy**: Multi-level caching (Memory + Redis) for optimal performance
- **Batch Operations**: Efficient bulk import handling with pagination
- **Index Optimization**: MongoDB compound indexes for metadata queries

### Files Created
- [`models/canonical-comic.types.ts`](models/canonical-comic.types.ts:1) - TypeScript definitions for canonical metadata
- [`utils/metadata-resolver.utils.ts`](utils/metadata-resolver.utils.ts:1) - Conflict resolution and confidence scoring
- [`models/canonical-comic.model.ts`](models/canonical-comic.model.ts:1) - Mongoose schema with performance indexes
- [`services/canonical-metadata.service.ts`](services/canonical-metadata.service.ts:1) - REST endpoints for metadata import
- [`models/graphql/canonical-typedef.ts`](models/graphql/canonical-typedef.ts:1) - GraphQL schema with backward compatibility
- [`CANONICAL_METADATA_GUIDE.md`](CANONICAL_METADATA_GUIDE.md:1) - Complete implementation guide

---

**ThreeTwo Core Service** provides enterprise-grade comic book library management with modern microservices architecture, real-time capabilities, and intelligent automation.
