/**
 * Tests for EXPLAIN Analyzer
 */

import { ExplainAnalyzer } from '../src/analyzers/explain-analyzer';
import { DatabaseEngine, PlanNodeType } from '../src/types';

describe('ExplainAnalyzer', () => {
  describe('PostgreSQL JSON parsing', () => {
    it('should parse PostgreSQL JSON EXPLAIN output', () => {
      const jsonOutput = JSON.stringify([{
        "Plan": {
          "Node_Type": "Seq Scan",
          "Relation_Name": "users",
          "Total_Cost": 10.5,
          "Plan_Rows": 100
        }
      }]);

      const result = ExplainAnalyzer.parse(jsonOutput, DatabaseEngine.POSTGRESQL);
      
      expect(result).toBeDefined();
      expect(result!.plan.nodeType).toBe(PlanNodeType.SEQ_SCAN);
      expect(result!.plan.relationName).toBe('users');
    });

    it('should parse nested plan nodes', () => {
      const jsonOutput = JSON.stringify([{
        "Plan": {
          "Node_Type": "Hash Join",
          "Total_Cost": 100.0,
          "Plans": [{
            "Node_Type": "Seq Scan",
            "Relation_Name": "users",
            "Total_Cost": 10.0
          }, {
            "Node_Type": "Seq Scan",
            "Relation_Name": "orders",
            "Total_Cost": 10.0
          }]
        }
      }]);

      const result = ExplainAnalyzer.parse(jsonOutput, DatabaseEngine.POSTGRESQL);
      
      expect(result!.plan.nodeType).toBe(PlanNodeType.HASH_JOIN);
      expect(result!.plan.childPlans).toBeDefined();
      expect(result!.plan.childPlans!.length).toBe(2);
    });
  });

  describe('PostgreSQL text parsing', () => {
    it('should parse simple text plan', () => {
      const textOutput = `
Seq Scan on users  (cost=0.00..10.50 rows=100 width=50)
  Filter: ((id)::integer = 1)
Planning Time: 0.123 ms
Execution Time: 0.456 ms
      `.trim();

      const result = ExplainAnalyzer.parse(textOutput, DatabaseEngine.POSTGRESQL);
      
      expect(result).toBeDefined();
      expect(result!.plan.nodeType).toBe(PlanNodeType.SEQ_SCAN);
    });

    it('should parse plan with index scan', () => {
      const textOutput = `
Index Scan using idx_users_email on users  (cost=0.42..8.44 rows=1 width=50)
  Index Cond: ((email)::text = 'test@example.com'::text)
      `.trim();

      const result = ExplainAnalyzer.parse(textOutput, DatabaseEngine.POSTGRESQL);
      
      expect(result!.plan.nodeType).toBe(PlanNodeType.INDEX_SCAN);
      expect(result!.plan.indexName).toBe('idx_users_email');
    });
  });

  describe('MySQL EXPLAIN parsing', () => {
    it('should parse MySQL EXPLAIN output', () => {
      const mysqlOutput = `
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+-------+
| id | select_type | table | type       | key  | key_len       | ref  | rows    | Extra |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+-------+
|  1 | SIMPLE      | users | ALL        | NULL | NULL          | NULL | 1000000 | NULL  |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+-------+
      `.trim();

      const result = ExplainAnalyzer.parse(mysqlOutput, DatabaseEngine.MYSQL);
      
      expect(result).toBeDefined();
      expect(result!.plan.nodeType).toBe(PlanNodeType.SEQ_SCAN);
    });

    it('should parse MySQL EXPLAIN with index', () => {
      const mysqlOutput = `
+----+-------------+-------+------------+-------+---------------+---------+---------+------+------+-------+
| id | select_type | table | type       | key   | key_len       | ref     | rows    | Extra |
+----+-------------+-------+------------+-------+---------------+---------+---------+------+------+-------+
|  1 | SIMPLE      | users | ref        | email | 767           | const   | 1       | NULL  |
+----+-------------+-------+------------+-------+---------------+---------+---------+------+------+-------+
      `.trim();

      const result = ExplainAnalyzer.parse(mysqlOutput, DatabaseEngine.MYSQL);
      
      expect(result!.plan.nodeType).toBe(PlanNodeType.INDEX_SCAN);
    });
  });

  describe('SQLite EXPLAIN parsing', () => {
    it('should parse SQLite EXPLAIN QUERY PLAN', () => {
      const sqliteOutput = `
QUERY PLAN
`--SCAN TABLE users
      `.trim();

      const result = ExplainAnalyzer.parse(sqliteOutput, DatabaseEngine.SQLITE);
      
      expect(result).toBeDefined();
      expect(result!.plan.nodeType).toBe(PlanNodeType.SEQ_SCAN);
    });

    it('should parse SQLite with index', () => {
      const sqliteOutput = `
QUERY PLAN
`--SEARCH TABLE users USING INDEX idx_email (email=?)
      `.trim();

      const result = ExplainAnalyzer.parse(sqliteOutput, DatabaseEngine.SQLITE);
      
      expect(result!.plan.nodeType).toBe(PlanNodeType.INDEX_SCAN);
    });
  });

  describe('Plan analysis', () => {
    it('should detect sequential scan issues', () => {
      const jsonOutput = JSON.stringify([{
        "Plan": {
          "Node_Type": "Seq Scan",
          "Relation_Name": "orders",
          "Total_Cost": 10000.0,
          "Plan_Rows": 1000000
        }
      }]);

      const result = ExplainAnalyzer.parse(jsonOutput, DatabaseEngine.POSTGRESQL);
      const analysis = ExplainAnalyzer.analyzePlan(result!);
      
      expect(analysis.issues.length).toBeGreaterThan(0);
      expect(analysis.issues[0]).toContain('Sequential scan');
    });

    it('should give good score for indexed queries', () => {
      const jsonOutput = JSON.stringify([{
        "Plan": {
          "Node_Type": "Index Scan",
          "Relation_Name": "users",
          "Total_Cost": 8.44,
          "Plan_Rows": 1
        }
      }]);

      const result = ExplainAnalyzer.parse(jsonOutput, DatabaseEngine.POSTGRESQL);
      const analysis = ExplainAnalyzer.analyzePlan(result!);
      
      expect(analysis.score).toBeGreaterThan(80);
    });
  });
});
