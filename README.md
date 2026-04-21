# InsightDB - Advanced Database Query Optimizer

<p align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-MySQL-SQLite-blue" alt="Supported Databases">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-ES2020-orange" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
</p>

InsightDB is a comprehensive database query optimizer that analyzes SQL queries, suggests indexes, rewrites queries for better performance, predicts execution times, and visualizes execution plans. It supports PostgreSQL, MySQL, and SQLite databases.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [API Usage](#api-usage)
- [Query Optimization Guide](#query-optimization-guide)
- [Indexing Strategies](#indexing-strategies)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 🔍 Query Analysis
- **SQL Parser**: Parses and analyzes SELECT, INSERT, UPDATE, DELETE statements
- **Complexity Scoring**: Evaluates query complexity on a 0-100 scale
- **Issue Detection**: Identifies common performance problems and anti-patterns

### 📊 Index Recommendations
- **Single Column Indexes**: Recommends optimal single-column indexes
- **Composite Indexes**: Suggests multi-column indexes for complex queries
- **Covering Indexes**: Recommends indexes that include all needed columns
- **Join Optimization Indexes**: Identifies indexes to speed up JOIN operations

### ✏️ Query Rewriting
- **Subquery Elimination**: Converts IN subqueries to JOINs or EXISTS
- **Predicate Pushdown**: Moves filters closer to data sources
- **Join Reduction**: Identifies unnecessary joins
- **Constant Folding**: Removes redundant conditions

### ⏱️ Execution Time Prediction
- **Factor Analysis**: Breaks down query cost into contributing factors
- **Bottleneck Identification**: Highlights performance bottlenecks
- **Confidence Scoring**: Provides confidence levels for predictions

### 🔗 Join Optimization
- **Join Order Optimization**: Finds optimal table join order using dynamic programming
- **Join Strategy Selection**: Recommends NESTED LOOP, HASH JOIN, or MERGE JOIN strategies
- **Alternative Plans**: Shows alternative join orders with cost estimates

### 📈 Schema Analysis
- **Relationship Detection**: Identifies foreign key relationships
- **Normalization Scoring**: Evaluates schema normalization (0-100)
- **Redundancy Detection**: Finds duplicate and unused indexes
- **Partition Recommendations**: Suggests partitioning for large tables

### 🎨 Execution Plan Visualization
- **ASCII Tree**: Renders plans as text trees
- **JSON Output**: Machine-readable format
- **Mermaid Diagrams**: Generate flowchart visualizations
- **HTML Reports**: Interactive web-based plan viewer

---

## Installation

### Prerequisites

- Node.js 18.0 or higher
- npm or yarn
- Database connection (optional, for live analysis)

### Install via npm

```bash
npm install insightdb
```

### Install from source

```bash
git clone https://github.com/moggan1337/InsightDB.git
cd InsightDB
npm install
npm run build
```

### Install database drivers (optional)

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite
npm install better-sqlite3
```

---

## Quick Start

### CLI Quick Start

```bash
# Analyze a query
npx insightdb analyze "SELECT * FROM users WHERE email = 'test@example.com'"

# With database connection
npx insightdb analyze "SELECT * FROM orders WHERE status = 'pending'" \
  --connect postgresql://user:pass@localhost:5432/mydb

# Get execution plan
npx insightdb explain "SELECT * FROM products WHERE category_id = 1" --analyze

# Analyze schema
npx insightdb schema --connect postgresql://user:pass@localhost:5432/mydb
```

### API Quick Start

```typescript
import { InsightDB, DatabaseEngine } from 'insightdb';

// Create instance
const insightdb = new InsightDB();

// Analyze a query (offline)
const analysis = await insightdb.analyze(`
  SELECT u.name, COUNT(o.id) as order_count
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  WHERE u.created_at > '2024-01-01'
  GROUP BY u.id
  ORDER BY order_count DESC
  LIMIT 100
`);

console.log(`Score: ${analysis.score}/100`);
console.log(`Complexity: ${analysis.complexity}`);
console.log(`Recommendations: ${analysis.suggestions.join(', ')}`);

// Connect to database for live analysis
await insightdb.connect('postgresql://user:pass@localhost:5432/mydb');
const liveAnalysis = await insightdb.analyze('SELECT * FROM large_table');
await insightdb.disconnect();
```

---

## CLI Usage

### analyze

Analyze a SQL query for optimization opportunities.

```bash
insightdb analyze <query> [options]

Options:
  -f, --format <format>   Output format (text, json, html) [default: text]
  --no-index              Skip index recommendations
  --no-rewrite            Skip query rewrite suggestions
  --no-predict            Skip time prediction

Examples:
  insightdb analyze "SELECT * FROM users WHERE email = 'test'"
  insightdb analyze "SELECT * FROM orders" --format json
```

### explain

Get and display query execution plan.

```bash
insightdb explain <query> [options]

Options:
  -f, --format <format>   Output format (text, json, mermaid, html) [default: text]
  --analyze              Run EXPLAIN ANALYZE to get actual times

Examples:
  insightdb explain "SELECT * FROM products"
  insightdb explain "SELECT * FROM orders WHERE status = 'pending'" --analyze
  insightdb explain "SELECT * FROM sales" --format mermaid
```

### schema

Analyze database schema.

```bash
insightdb schema [options]

Options:
  -t, --table <name>      Analyze specific table

Examples:
  insightdb schema
  insightdb schema --table users
```

### gen-index

Generate CREATE INDEX statements.

```bash
insightdb gen-index [options]

Options:
  -t, --table <name>      Table name (required)
  -c, --columns <cols>    Column names, comma-separated (required)
  -e, --engine <type>     Database engine (postgresql, mysql, sqlite)

Examples:
  insightdb gen-index -t users -c "email,created_at"
  insightdb gen-index -t orders -c "user_id,status" -e mysql
```

### shell

Start interactive query analysis shell.

```bash
insightdb shell [options]

Examples:
  insightdb shell
  insightdb shell --connect postgresql://user:pass@localhost:5432/mydb
```

### batch

Analyze multiple queries from a file.

```bash
insightdb batch <file> [options]

Options:
  -o, --output <file>    Output file for results

Examples:
  insightdb batch queries.sql
  insightdb batch queries.sql -o results.json
```

---

## API Usage

### Basic Analysis

```typescript
import { InsightDB } from 'insightdb';

const insightdb = new InsightDB();

const analysis = await insightdb.analyze(`
  SELECT u.name, o.total
  FROM users u
  INNER JOIN orders o ON u.id = o.user_id
  WHERE u.status = 'active'
`);

// Access results
console.log(analysis.score);           // 0-100
console.log(analysis.complexity);       // ComplexityLevel enum
console.log(analysis.issues);            // QueryIssue[]
console.log(analysis.suggestions);      // string[]
```

### Index Recommendations

```typescript
const analysis = await insightdb.analyze(query);

// Iterate over recommendations
for (const rec of analysis.indexRecommendations) {
  console.log(`Table: ${rec.tableName}`);
  console.log(`Columns: ${rec.columns.join(', ')}`);
  console.log(`Priority: ${rec.priority}`);
  console.log(`Est. Improvement: ${rec.estimatedImprovement}%`);
  
  // Generate SQL
  const sql = insightdb.generateIndexSQL(rec);
  console.log(`SQL: ${sql}`);
}
```

### Query Rewriting

```typescript
const analysis = await insightdb.analyze(query);

// Apply all rewrites
const optimized = insightdb.applyRewrites(query, analysis.rewriteSuggestions);

// Or access individual suggestions
for (const suggestion of analysis.rewriteSuggestions) {
  if (suggestion.impact === 'HIGH') {
    console.log(`Rewrite: ${suggestion.type}`);
    console.log(`Original: ${suggestion.original}`);
    console.log(`Rewritten: ${suggestion.rewritten}`);
  }
}
```

### Execution Plans

```typescript
// Connect to database
await insightdb.connect('postgresql://user:pass@localhost:5432/mydb');

// Get plan
const plan = await insightdb.explain('SELECT * FROM users WHERE id = 1', true);

// Visualize in different formats
console.log(insightdb.visualize(plan, 'ascii'));
console.log(insightdb.visualize(plan, 'mermaid'));
console.log(insightdb.visualize(plan, 'html'));

// Access plan details
console.log(`Total Cost: ${plan.totalCost}`);
console.log(`Execution Time: ${plan.executionTime}ms`);
console.log(`Estimated Rows: ${plan.estimatedRows}`);
```

### Time Prediction

```typescript
const analysis = await insightdb.analyze(query);

if (analysis.timePrediction) {
  console.log(`Estimated: ${analysis.timePrediction.estimatedTime} ${analysis.timePrediction.unit}`);
  console.log(`Confidence: ${analysis.timePrediction.confidence}%`);
  
  console.log('Factors:');
  for (const factor of analysis.timePrediction.factors) {
    console.log(`  ${factor.name}: ${factor.impact}%`);
    console.log(`    ${factor.description}`);
  }
  
  console.log('Bottlenecks:');
  for (const bottleneck of analysis.timePrediction.bottlenecks) {
    console.log(`  ⚠️  ${bottleneck}`);
  }
}
```

### Join Optimization

```typescript
const analysis = await insightdb.analyze(`
  SELECT *
  FROM a
  JOIN b ON a.id = b.a_id
  JOIN c ON b.id = c.b_id
  JOIN d ON c.id = d.c_id
`);

if (analysis.joinOrder) {
  console.log(`Optimal Order: ${analysis.joinOrder.optimalOrder.map(t => t.name).join(' → ')}`);
  console.log(`Cost: ${analysis.joinOrder.estimatedCost}`);
  
  console.log('Strategies:');
  for (const strategy of analysis.joinOrder.joinStrategies) {
    console.log(`  ${strategy.strategy}: ${strategy.tables.map(t => t.name).join(', ')}`);
  }
  
  console.log('Alternatives:');
  for (const alt of analysis.joinOrder.alternatives) {
    console.log(`  ${alt.order.map(t => t.name).join(' → ')}`);
    console.log(`    Cost: ${alt.estimatedCost}, Savings: ${alt.savingsPercent.toFixed(1)}%`);
  }
}
```

### Schema Analysis

```typescript
// Set schema (or load from database)
insightdb.setSchema(tables, indexes);

// Analyze schema
const schemaAnalysis = insightdb.analyzeSchema();

console.log(`Normalization Score: ${schemaAnalysis.normalizationScore}/100`);

console.log('Relationships:');
for (const rel of schemaAnalysis.relationships) {
  console.log(`  ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}`);
}

console.log('Missing Indexes:');
for (const idx of schemaAnalysis.missingIndexes) {
  console.log(`  ${idx.tableName}.${idx.columns.join(', ')}`);
}

console.log('Redundancy Issues:');
for (const red of schemaAnalysis.redundancy) {
  console.log(`  ${red.type}: ${red.description}`);
}
```

---

## Query Optimization Guide

### Understanding Query Complexity

InsightDB classifies queries into five complexity levels:

| Level | Score Range | Characteristics |
|-------|-------------|-----------------|
| TRIVIAL | 0-19 | Simple single-table queries |
| SIMPLE | 20-39 | Basic WHERE clauses |
| MODERATE | 40-59 | JOINs, GROUP BY |
| COMPLEX | 60-79 | Multiple JOINs, subqueries |
| VERY_COMPLEX | 80-100 | Complex subqueries, CTEs |

### Common Performance Issues

#### 1. SELECT * (Projection Issues)

```sql
-- ❌ Slow: Fetches all columns
SELECT * FROM users WHERE id = 1

-- ✅ Fast: Selects only needed columns
SELECT id, email, name FROM users WHERE id = 1
```

InsightDB warns when `SELECT *` is used, as it:
- Transfers unnecessary data over the network
- Prevents index-only scans
- May cause table/column renames to break queries

#### 2. Missing WHERE Clauses

```sql
-- ❌ Slow on large tables
SELECT * FROM events

-- ✅ Fast: Filter early
SELECT * FROM events WHERE created_at > '2024-01-01'
```

Filtering early reduces the working set and enables better index usage.

#### 3. OR Conditions

```sql
-- ❌ Slow: May not use indexes efficiently
SELECT * FROM users WHERE status = 'active' OR role = 'admin'

-- ✅ Fast: UNION or IN clause
SELECT * FROM users WHERE status = 'active'
UNION ALL
SELECT * FROM users WHERE role = 'admin'
```

OR conditions can prevent index usage. UNION or IN may be faster.

#### 4. Implicit Type Conversion

```sql
-- ❌ Slow: Implicit cast on column
SELECT * FROM users WHERE id = '123'

-- ✅ Fast: Matching types
SELECT * FROM users WHERE id = 123
```

Implicit casts prevent index usage because the database must evaluate the cast for every row.

#### 5. Functions on Indexed Columns

```sql
-- ❌ Slow: Function prevents index usage
SELECT * FROM users WHERE LOWER(email) = 'test@example.com'

-- ✅ Fast: Index-friendly
SELECT * FROM users WHERE email = 'test@example.com'
```

Functions on columns prevent B-tree index usage. Use expression indexes or rewrite.

#### 6. LIKE with Leading Wildcard

```sql
-- ❌ Slow: Leading wildcard
SELECT * FROM products WHERE name LIKE '%phone%'

-- ✅ Fast: Use full-text search or reverse pattern
-- Or use trigram index (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON products USING GIN (name gin_trgm_ops);
```

Leading wildcards cannot use B-tree indexes. Use full-text search or trigram indexes.

#### 7. Excessive JOINs

```sql
-- ❌ Complex: Too many JOINs
SELECT *
FROM a
JOIN b ON ...
JOIN c ON ...
JOIN d ON ...
JOIN e ON ...
JOIN f ON ...

-- ✅ Better: Consider denormalization or materialized views
```

Each JOIN adds complexity and potential for poor optimization. Consider denormalization.

### Reading EXPLAIN Output

#### PostgreSQL Plan Nodes

| Node | Meaning |
|------|---------|
| Seq Scan | Full table scan |
| Index Scan | Index lookup + table access |
| Index Only Scan | Index lookup only (no table) |
| Bitmap Heap Scan | Bitmap index + heap fetch |
| Nested Loop | Row-by-row join |
| Hash Join | Hash-based join |
| Merge Join | Sort-merge join |
| Sort | In-memory or external sort |
| HashAggregate | Hash-based aggregation |
| GroupAggregate | Group-based aggregation |

#### Cost Interpretation

- **startup_cost**: Cost before first row can be returned
- **total_cost**: Total cost of plan
- **rows**: Estimated rows returned
- **actual_time**: Actual execution time (ms)

### Optimization Process

1. **Run EXPLAIN ANALYZE**
   ```bash
   insightdb explain "SELECT ..." --analyze
   ```

2. **Look for warning signs**
   - Sequential scans on large tables
   - High actual vs estimated row counts
   - Nested loops with high loop counts
   - High-cost sort operations

3. **Apply recommendations**
   - Add missing indexes
   - Rewrite queries
   - Adjust join order

4. **Re-analyze**
   - Compare before/after scores
   - Verify execution time improvements

---

## Indexing Strategies

### Index Types

#### B-Tree Indexes (Default)

Best for:
- Equality comparisons (`=`)
- Range queries (`<`, `>`, `BETWEEN`)
- Sorted output (`ORDER BY`)
- Prefix matching (`LIKE 'abc%'`)

```sql
-- PostgreSQL
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_orders_date ON orders (order_date);
CREATE INDEX idx_products_category ON products (category_id);

-- MySQL
ALTER TABLE users ADD INDEX idx_email (email);

-- SQLite
CREATE INDEX idx_users_email ON users(email);
```

#### Hash Indexes

Best for:
- Equality-only lookups
- PostgreSQL: `=`, `IN`
- MySQL MEMORY/HNENGINE

```sql
-- PostgreSQL
CREATE INDEX idx_sessions_token ON sessions USING HASH (token);
```

#### GiST Indexes (Generalized Search Tree)

Best for:
- Geometric data types
- Full-text search
- Range types
- IP addresses

```sql
-- PostgreSQL - Full text search
CREATE INDEX idx_articles_content ON articles USING GIST (to_tsvector('english', content));

-- Range queries
CREATE INDEX idx_reservations_period ON reservations USING GIST (period);
```

#### GIN Indexes (Generalized Inverted Index)

Best for:
- JSON/JSONB data
- Arrays
- Full-text search
- HStore

```sql
-- PostgreSQL - JSONB
CREATE INDEX idx_products_attrs ON products USING GIN (attributes);

-- Arrays
CREATE INDEX idx_tags_post ON posts USING GIN (tags);
```

#### BRIN Indexes (Block Range Index)

Best for:
- Naturally ordered data (dates, sequences)
- Very large tables
- Append-only tables

```sql
-- PostgreSQL - Log-style data
CREATE INDEX idx_events_created ON events USING BRIN (created_at);
```

#### Full-Text Indexes

```sql
-- PostgreSQL
CREATE INDEX idx_articles_search ON articles USING GIN (to_tsvector('english', title || ' ' || body));

-- MySQL
ALTER TABLE articles ADD FULLTEXT INDEX idx_search (title, body);
```

### Composite Indexes

#### Column Order Matters

A composite index `(a, b, c)` supports:
- Queries on `a`
- Queries on `a, b`
- Queries on `a, b, c`

It does NOT support:
- Queries on `b` alone
- Queries on `c` alone
- Queries on `b, c`

```sql
-- ❌ Index only used for status
CREATE INDEX idx_orders_status_date ON orders (status, created_at);

-- ✅ Correct order: equality first, then range
CREATE INDEX idx_orders_status_date ON orders (created_at, status);
```

#### Leading Column Principle

Put the most selective column first, UNLESS:
- The query uses a range on that column
- The query only filters on the later columns

```sql
-- Most queries filter by status, then date
-- ❌ Wrong: status is selective but uses range
CREATE INDEX idx ON orders (status, created_at);

-- ✅ Right: date is used for range, status is selective
CREATE INDEX idx ON orders (status, created_at);
-- Actually depends on your queries!

-- If most queries filter by status, then date
-- ✅ Right order
CREATE INDEX idx ON orders (status, created_at);

-- If most queries filter by date range
-- ✅ Right order
CREATE INDEX idx ON orders (created_at, status);
```

### Covering Indexes

Include all columns needed by the query in the index to enable index-only scans.

```sql
-- Common query pattern
SELECT id, email, name FROM users WHERE email = ?;

-- ❌ Basic index: requires table access
CREATE INDEX idx_users_email ON users (email);

-- ✅ Covering index: index-only scan
CREATE INDEX idx_users_email_covering ON users (email) INCLUDE (id, name);

-- PostgreSQL (10+)
CREATE INDEX idx_users_email ON users (email) INCLUDE (id, name);

-- MySQL
CREATE INDEX idx_users_email ON users (email, id, name);
```

### Partial Indexes

Index only rows that are frequently queried.

```sql
-- PostgreSQL
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
CREATE INDEX idx_users_active ON users (last_login) WHERE active = true;

-- SQLite
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
```

### Expression Indexes

Index the result of a function or expression.

```sql
-- PostgreSQL - Case-insensitive search
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- All databases - Date extraction
CREATE INDEX idx_events_month ON events (DATE_TRUNC('month', created_at));
```

### Index Maintenance

#### Monitor Index Usage

```sql
-- PostgreSQL
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- MySQL
SHOW INDEX FROM orders;
```

#### Find Unused Indexes

```sql
-- PostgreSQL
SELECT
  schemaname || '.' || relname AS table,
  indexrelname AS index,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  idx_scan
FROM pg_stat_user_indexes ui
JOIN pg_index i ON ui.indexrelid = i.indexrelid
WHERE idx_scan = 0
  AND NOT indisunique
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

#### Find Duplicate Indexes

```sql
-- PostgreSQL
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    SELECT tablename
    FROM pg_indexes
    GROUP BY tablename, indexdef
    HAVING COUNT(*) > 1
  )
ORDER BY tablename, indexname;
```

### Index Selection Algorithm

InsightDB recommends indexes based on:

1. **Column Usage Frequency**
   - Columns in WHERE clauses
   - Columns in JOIN conditions
   - Columns in ORDER BY
   - Columns in GROUP BY

2. **Selectivity**
   - High selectivity (few duplicates) = better for indexing
   - Low selectivity (many duplicates) = may not benefit

3. **Query Patterns**
   - Equality conditions → B-tree
   - Range conditions → B-tree
   - Text search → Full-text or trigram
   - JSON/Array → GIN
   - Geometric data → GiST

4. **Maintenance Cost**
   - Indexes slow down writes
   - Large indexes use disk space
   - Too many indexes hurt performance

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         InsightDB                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   CLI/Shell  │  │   REST API   │  │   Library (Node.js)   │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Analysis Engine                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │  Query Parser  │  │  Plan Analyzer │  │ Schema Analyzer│     │
│  │                │  │                │  │                │     │
│  │  - Tokenizer   │  │  - EXPLAIN     │  │ - Relationships│     │
│  │  - Parser     │  │    Parser      │  │ - Normalization│     │
│  │  - Analyzer   │  │  - Node Type   │  │ - Redundancy   │     │
│  │               │  │    Mapping     │  │                │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
├─────────────────────────────────────────────────────────────────┤
│                     Optimizers                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │Index Recommender│  │ Query Rewriter │  │ Join Optimizer │     │
│  │                │  │                │  │                │     │
│  │ - Single Col   │  │ - Subquery     │  │ - Join Order   │     │
│  │ - Composite    │  │   Elimination  │  │   DP Algorithm │     │
│  │ - Covering     │  │ - Predicate    │  │ - Strategy     │     │
│  │ - Partial      │  │   Pushdown     │  │   Selection    │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
├─────────────────────────────────────────────────────────────────┤
│                     Visualization                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │  ASCII Tree    │  │   Mermaid     │  │      HTML      │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
├─────────────────────────────────────────────────────────────────┤
│                   Database Connectors                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PostgreSQL  │  │    MySQL     │  │    SQLite    │         │
│  │              │  │              │  │              │         │
│  │  - EXPLAIN   │  │  - EXPLAIN   │  │  - EXPLAIN   │         │
│  │    JSON      │  │    ANALYZE   │  │    QUERY     │         │
│  │  - Stats     │  │  - SHOW      │  │    PLAN      │         │
│  │              │  │    INDEXES   │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Source Structure

```
src/
├── index.ts              # Main entry point
├── types.ts              # TypeScript interfaces
├── cli.ts                # Command-line interface
│
├── parsers/
│   └── sql-parser.ts     # SQL tokenizer and parser
│
├── analyzers/
│   ├── explain-analyzer.ts   # EXPLAIN output parser
│   ├── time-predictor.ts     # Execution time prediction
│   └── schema-analyzer.ts    # Schema analysis
│
├── optimizers/
│   ├── index-recommender.ts  # Index recommendation engine
│   ├── query-rewriter.ts     # Query rewrite engine
│   └── join-optimizer.ts    # Join order optimization
│
├── connectors/
│   └── db-connector.ts      # Database connection managers
│
└── visualization/
    └── plan-visualizer.ts   # Plan visualization
```

---

## Configuration

### Optimizer Configuration

```typescript
const insightdb = new InsightDB({
  config: {
    enableIndexRecommendations: true,  // Enable index analysis
    enableQueryRewrite: true,           // Enable query rewriting
    enableTimePrediction: true,        // Enable time prediction
    enableJoinOptimization: true,      // Enable join optimization
    enablePartitionAnalysis: true,     // Enable partitioning analysis
    maxRecommendations: 10,            // Max recommendations to return
    confidenceThreshold: 0.5          // Minimum confidence for predictions
  }
});
```

### Database Connection String Formats

```typescript
// PostgreSQL
postgresql://user:password@host:5432/database

// MySQL
mysql://user:password@host:3306/database

// SQLite (file path)
sqlite:///path/to/database.db

// SQLite (absolute path)
sqlite:////absolute/path/to/database.db
```

### Environment Variables

```bash
# Database connection
INSIGHTDB_CONNECTION=postgresql://user:pass@localhost:5432/db

# Log level
INSIGHTDB_LOG_LEVEL=info

# Disable telemetry
INSIGHTDB_TELEMETRY=false
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

### Development Setup

```bash
# Clone repository
git clone https://github.com/moggan1337/InsightDB.git
cd InsightDB

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Code Style

We use ESLint and Prettier for code formatting:

```bash
npm run lint
npm run lint:fix
```

### Testing

```typescript
// Write tests in tests/
describe('Query Parser', () => {
  it('should parse simple SELECT', () => {
    const result = SqlParserFacade.parse('SELECT * FROM users');
    expect(result.type).toBe(SqlStatementType.SELECT);
  });
});
```

---

## Roadmap

- [ ] Support for more databases (Oracle, SQL Server, MongoDB)
- [ ] Machine learning-based query optimization
- [ ] Auto-deployment of recommended indexes
- [ ] Query performance monitoring dashboard
- [ ] Integration with ORM query builders
- [ ] Query workload analysis
- [ ] Automatic materialized view recommendations

---

## Resources

### Documentation
- [PostgreSQL Performance Tips](https://www.postgresql.org/docs/current/performance-tips.html)
- [MySQL Optimization Guide](https://dev.mysql.com/doc/refman/8.0/en/optimization.html)
- [SQLite Query Planning](https://www.sqlite.org/queryplanner.html)

### Tools
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) - PostgreSQL query statistics
- [EXPLAIN Analyzer](https://explain.depesz.com/) - PostgreSQL plan visualization
- [MySQL Workbench](https://www.mysql.com/products/workbench/) - Visual EXPLAIN

### Books
- "SQL Performance Explained" by Markus Winand
- "The Art of SQL" by Stéphane Faroult
- "Database Internals" by Alex Petrov

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/moggan1337">moggan1337</a>
</p>
