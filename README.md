# InsightDB - Advanced Database Query Optimizer

[![CI](https://github.com/moggan1337/InsightDB/actions/workflows/ci.yml/badge.svg)](https://github.com/moggan1337/InsightDB/actions/workflows/ci.yml)

<div align="center">

![InsightDB](https://img.shields.io/badge/InsightDB-Query%20Optimizer-blue)
[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

> **Understand your queries. Optimize your performance.** InsightDB analyzes, visualizes, and optimizes your database queries with AI-powered insights.

## 🎬 Demo

![InsightDB Demo](demo.gif)

*AI-powered query optimization in action*

## ✨ Features

- **Query Plan Analysis** - Visualize and understand execution plans
- **Index Recommendations** - AI-generated index suggestions
- **Performance Profiling** - Find slow queries instantly
- **Query Rewriting** - Auto-optimize SQL statements
- **Multi-Database Support** - PostgreSQL, MySQL, SQLite, and more

## 🚀 Quick Start

```bash
pip install insightdb
insightdb analyze --query "SELECT * FROM orders WHERE status = 'pending'"
```

## 🔍 Query Analysis Demo

### Query Plan Visualization

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              QUERY PLAN ANALYSIS                                │
│                         Query ID: q-7x4k-a1b2c3                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

  QUERY:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as revenue         │
  │  FROM users u                                                               │
  │  LEFT JOIN orders o ON u.id = o.user_id                                     │
  │  WHERE u.created_at > '2024-01-01'                                          │
  │  GROUP BY u.id, u.name                                                      │
  │  ORDER BY revenue DESC                                                      │
  │  LIMIT 100;                                                                 │
  └─────────────────────────────────────────────────────────────────────────────┘

  EXECUTION PLAN:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                                                                              │
  │  Limit  (cost=1847.32..1849.32 rows=100 width=48)                          │
  │    -> Sort  (cost=1847.32..1897.32 rows=20000 width=48)                    │
  │          Sort Key: (sum(o.total)) DESC                                      │
  │          ->  HashAggregate  (cost=1427.00..1627.00 rows=20000 width=48)     │
  │                Group Key: u.id                                              │
  │                ->  Hash Left Join  (cost=25.00..1017.00 rows=82000 width=40)│
  │                      Hash Cond: (u.id = o.user_id)                         │
  │                      ->  Seq Scan on users u  (cost=0.00..800.00 rows=20000│
  │                            Filter: (created_at > '2024-01-01'))             │
  │                      ->  Hash  (cost=500.00..500.00 rows=41000 width=24)    │
  │                            ->  Seq Scan on orders o  (cost=0.00..500.00   │
  │                                  rows=41000 width=24)                       │
  │                                                                              │
  └─────────────────────────────────────────────────────────────────────────────┘
```

### Plan Tree Visualization

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION PLAN TREE                                     │
│                         (Visual representation)                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   LIMIT     │
                              │  (100 rows) │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │    SORT     │
                              │  revenue↓   │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────────────┐
                              │  HASH AGGREGATE     │
                              │  Groups: user_id    │
                              └──────┬──────────────┘
                                     │
                         ┌───────────▼───────────┐
                         │    HASH LEFT JOIN      │
                         │   users ← orders      │
                         │   Join: user_id = id   │
                         └───────┬───────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
     ┌────────▼────────┐              ┌─────────────▼──────────┐
     │  SEQ SCAN       │              │      HASH BUILD       │
     │  users          │              │      (orders)         │
     │  Filter: date   │              └─────────────┬──────────┘
     │  Rows: 20,000   │                            │
     └─────────────────┘              ┌─────────────▼──────────┐
                                     │      SEQ SCAN          │
                                     │      orders            │
                                     │      Rows: 41,000      │
                                     └────────────────────────┘

  ⚠️ BOTTLENECK DETECTED: Sequential scan on large tables!
```

### Performance Analysis Report

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PERFORMANCE ANALYSIS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  METRICS                                    CURRENT         RECOMMENDED          │
│  ───────                                    ───────         ────────────         │
│                                                                                  │
│  Estimated Cost                    ████████████████████░░░  1,847 → 245          │
│  Rows Scanned                      ████████████████████████  123,000 → 500        │
│  Execution Time (estimated)        ██████████████████████░  450ms → 12ms        │
│  Memory Usage                      ████████████████████░░░  256MB → 32MB         │
│                                                                                  │
│  ═══════════════════════════════════════════════════════════════════════════    │
│                                                                                  │
│  🔴 ISSUES FOUND: 3                                                            │
│                                                                                  │
│  1. Sequential scan on 'orders' table                                         │
│     └─ 41,000 rows scanned unnecessarily                                        │
│     └─ Recommendation: Create index on user_id column                          │
│                                                                                  │
│  2. Sequential scan on 'users' table                                           │
│     └─ Full table scan for date filter                                         │
│     └─ Recommendation: Create index on created_at column                        │
│                                                                                  │
│  3. No index for ORDER BY on aggregate column                                  │
│     └─ Sort operation on 20,000 rows                                           │
│     └─ Recommendation: Consider materialized view for this query              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Index Recommendations

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AI-POWERED INDEX RECOMMENDATIONS                        │
│                         Generated by InsightDB ML Models                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  RECOMMENDATION #1: Create Composite Index                                      │
│  ════════════════════════════════════════                                        │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  CREATE INDEX idx_orders_user_status                                    │    │
│  │  ON orders (user_id, status)                                            │    │
│  │  WHERE status IN ('pending', 'processing', 'shipped');                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Expected Impact: ████████████████████░░░░░░░░░░░░░  73% faster                 │
│  Frequency: This pattern used 47 times/day in production                       │
│  Overhead: +2.1MB storage, <1% write performance impact                        │
│                                                                                  │
│  ──────────────────────────────────────────────────────────────────────────     │
│                                                                                  │
│  RECOMMENDATION #2: Create Partial Index                                        │
│  ════════════════════════════════════════                                        │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  CREATE INDEX idx_users_created_recent                                   │    │
│  │  ON users (created_at)                                                   │    │
│  │  WHERE created_at > '2024-01-01';                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Expected Impact: ██████████████████████░░░░░░░░░░░░  89% faster                 │
│  Frequency: This pattern used 156 times/day in production                      │
│  Overhead: +1.2MB storage, minimal write impact                                │
│                                                                                  │
│  ──────────────────────────────────────────────────────────────────────────     │
│                                                                                  │
│  RECOMMENDATION #3: Covering Index                                              │
│  ════════════════════════════════════════                                        │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  CREATE INDEX idx_users_name ON users (id) INCLUDE (name);              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Expected Impact: ████████████░░░░░░░░░░░░░░░░░░░░  34% faster                 │
│  Frequency: Used in JOIN clause - high impact                                 │
│  Overhead: +0.8MB storage, no additional overhead                              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Query Rewrite Suggestions

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         QUERY OPTIMIZATION SUGGESTIONS                           │
│                         ═══════════════════════════════                          │
└─────────────────────────────────────────────────────────────────────────────────┘

  ORIGINAL QUERY:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  SELECT * FROM orders WHERE customer_id IN (                              │
  │    SELECT id FROM customers WHERE region = 'EU'                             │
  │  ) AND status = 'shipped' ORDER BY shipped_at DESC;                        │
  └─────────────────────────────────────────────────────────────────────────────┘

  ⚡ INSIGHTDB OPTIMIZATIONS:

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  OPTIMIZED QUERY (Rewrite):                                                │
  │                                                                             │
  │  SELECT o.* FROM orders o                                                  │
  │  INNER JOIN customers c ON o.customer_id = c.id                            │
  │  WHERE c.region = 'EU' AND o.status = 'shipped'                            │
  │  ORDER BY o.shipped_at DESC;                                               │
  │                                                                             │
  │  Improvement: ████████████████░░░░░░░░░░░░░░  ~40% faster                   │
  │  Reason: JOIN often faster than IN subquery in PostgreSQL                   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  FURTHER OPTIMIZATION (With CTE):                                          │
  │                                                                             │
  │  WITH eu_customers AS (                                                    │
  │    SELECT id FROM customers WHERE region = 'EU'                            │
  │  )                                                                          │
  │  SELECT o.* FROM orders o                                                  │
  │  JOIN eu_customers ec ON o.customer_id = ec.id                             │
  │  WHERE o.status = 'shipped'                                                │
  │  ORDER BY o.shipped_at DESC;                                               │
  │                                                                             │
  │  Improvement: ████████████████████░░░░░░░░░░░░  ~55% faster                │
  │  Reason: CTE materialization + cleaner query plan                          │
  └─────────────────────────────────────────────────────────────────────────────┘
```

### Real-Time Monitoring

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LIVE QUERY MONITOR                                      │
│                         Database: production_main                               │
│                         Uptime: 47 days 12:34:56                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  LIVE QUERIES (Last 60 seconds)                                                │
│  ──────────────────────────────────                                             │
│                                                                                  │
│  🟢 q-001  00:00.234  SELECT sessions WHERE token = ?           [COMPLETED]    │
│  🟢 q-002  00:00.156  UPDATE users SET last_login = ?           [COMPLETED]    │
│  🟡 q-003  00:02.847  SELECT orders JOIN items WHERE ...        [COMPLETED]    │
│  🔴 q-004  00:15.623  SELECT * FROM logs WHERE date > ?  🔥 SLOW!             │
│  🟢 q-005  00:00.089  INSERT INTO events VALUES (...)        [COMPLETED]       │
│  🟢 q-006  00:00.045  SELECT count(*) FROM users               [COMPLETED]     │
│  ⏳ q-007  00:01.234  SELECT * FROM big_table WHERE ...         [RUNNING]       │
│                                                                                  │
│  ──────────────────────────────────────────────────────────────────────────     │
│                                                                                  │
│  STATISTICS (Last 24h)                                                         │
│  ────────────────────                                                           │
│                                                                                  │
│  Total Queries:        ████████████████████████████░░░░  1,247,832            │
│  Slow Queries (>1s):   ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░    3,847 (0.3%)       │
│  Failed Queries:       █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       12 (0.001%)     │
│  Avg Response Time:    12ms                                                      │
│  P95 Response Time:    89ms                                                     │
│  P99 Response Time:   234ms                                                     │
│                                                                                  │
│  🔥 TOP SLOW QUERIES (Needs optimization!)                                     │
│  ───────────────────────────────────────────                                     │
│  1. SELECT * FROM logs WHERE date > ?     →  15.6s avg (2,341 calls/day)       │
│  2. SELECT * FROM orders WHERE ...        →   4.2s avg (847 calls/day)         │
│  3. SELECT u.*, COUNT(o.id) FROM ...      →   2.8s avg (123 calls/day)          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🛠️ Installation

```bash
pip install insightdb
```

## 📖 Usage

```bash
# Analyze a single query
insightdb analyze --query "SELECT * FROM users"

# Analyze from file
insightdb analyze --file ./queries/report.sql

# Live monitoring mode
insightdb monitor --connection postgresql://...

# Generate index recommendations
insightdb recommend --database production

# Export analysis report
insightdb report --format html --output ./reports/
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT © 2024 moggan1337
