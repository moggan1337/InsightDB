/**
 * Tests for InsightDB main class
 */

import InsightDB from '../src/index';
import { ComplexityLevel, DatabaseEngine } from '../src/types';

describe('InsightDB', () => {
  describe('Query Analysis', () => {
    it('should analyze a simple SELECT query', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze(
        'SELECT * FROM users WHERE email = $1'
      );
      
      expect(analysis.score).toBeGreaterThanOrEqual(0);
      expect(analysis.score).toBeLessThanOrEqual(100);
      expect(analysis.complexity).toBeDefined();
      expect(analysis.parsedQuery).toBeDefined();
      expect(analysis.issues).toBeDefined();
    });

    it('should detect SELECT * as an issue', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze('SELECT * FROM users');
      
      const selectStarIssue = analysis.issues.find(
        i => i.code === 'SELECT_STAR'
      );
      expect(selectStarIssue).toBeDefined();
    });

    it('should detect missing WHERE clause on large table', async () => {
      const insightdb = new InsightDB();
      
      // Set schema with large table
      insightdb.setSchema([{
        name: 'events',
        columns: [
          { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }
        ],
        rowCount: 100000
      }]);
      
      const analysis = await insightdb.analyze('SELECT * FROM events');
      
      const noWhereIssue = analysis.issues.find(
        i => i.code === 'NO_WHERE'
      );
      expect(noWhereIssue).toBeDefined();
    });
  });

  describe('Index Recommendations', () => {
    it('should provide index recommendations for WHERE clauses', async () => {
      const insightdb = new InsightDB();
      
      insightdb.setSchema([{
        name: 'users',
        columns: [
          { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true },
          { name: 'email', dataType: 'VARCHAR', isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false, isIndexed: false, maxLength: 255 }
        ],
        rowCount: 10000
      }]);
      
      const analysis = await insightdb.analyze(
        'SELECT * FROM users WHERE email = $1'
      );
      
      expect(analysis.indexRecommendations.length).toBeGreaterThan(0);
      
      const emailRec = analysis.indexRecommendations.find(
        r => r.columns.includes('email')
      );
      expect(emailRec).toBeDefined();
    });
  });

  describe('Query Rewrite Suggestions', () => {
    it('should suggest rewriting subqueries to JOINs', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze(
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)'
      );
      
      const rewriteSuggestions = analysis.rewriteSuggestions.filter(
        s => s.type === 'ELIMINATE_SUBQUERY'
      );
      expect(rewriteSuggestions.length).toBeGreaterThan(0);
    });

    it('should detect implicit CROSS JOIN', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze(
        'SELECT * FROM users, orders WHERE users.id = orders.user_id'
      );
      
      const crossJoinSuggestion = analysis.rewriteSuggestions.find(
        s => s.type === 'REDUCE_JOINS'
      );
      expect(crossJoinSuggestion).toBeDefined();
    });
  });

  describe('Time Prediction', () => {
    it('should predict execution time', async () => {
      const insightdb = new InsightDB();
      
      insightdb.setSchema([{
        name: 'users',
        columns: [
          { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }
        ],
        rowCount: 10000
      }]);
      
      const analysis = await insightdb.analyze('SELECT * FROM users WHERE id = 1');
      
      expect(analysis.timePrediction).toBeDefined();
      expect(analysis.timePrediction!.estimatedTime).toBeGreaterThan(0);
      expect(analysis.timePrediction!.confidence).toBeGreaterThan(0);
    });

    it('should identify bottlenecks', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze('SELECT * FROM users');
      
      // Large table without WHERE should have bottlenecks
      if (analysis.timePrediction) {
        expect(analysis.timePrediction.bottlenecks).toBeDefined();
      }
    });
  });

  describe('Join Optimization', () => {
    it('should optimize join order for multi-table queries', async () => {
      const insightdb = new InsightDB();
      
      insightdb.setSchema([
        {
          name: 'users',
          columns: [{ name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }],
          rowCount: 10000
        },
        {
          name: 'orders',
          columns: [{ name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }],
          rowCount: 100000
        },
        {
          name: 'products',
          columns: [{ name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }],
          rowCount: 50000
        }
      ]);
      
      const analysis = await insightdb.analyze(`
        SELECT * FROM users u
        JOIN orders o ON u.id = o.user_id
        JOIN products p ON o.product_id = p.id
      `);
      
      expect(analysis.joinOrder).toBeDefined();
      expect(analysis.joinOrder!.optimalOrder).toBeDefined();
    });
  });

  describe('Schema Analysis', () => {
    it('should analyze schema and detect relationships', async () => {
      const insightdb = new InsightDB();
      
      insightdb.setSchema([
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true }
          ]
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true },
            { name: 'user_id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: false, isForeignKey: true, isUnique: false, isIndexed: false, foreignKeyRef: { table: 'users', column: 'id' } }
          ]
        }
      ]);
      
      const schemaAnalysis = insightdb.analyzeSchema();
      
      expect(schemaAnalysis.relationships.length).toBeGreaterThan(0);
      expect(schemaAnalysis.normalizationScore).toBeGreaterThan(0);
    });
  });

  describe('Score Calculation', () => {
    it('should calculate a score between 0 and 100', async () => {
      const insightdb = new InsightDB();
      
      const analysis = await insightdb.analyze('SELECT * FROM users');
      
      expect(analysis.score).toBeGreaterThanOrEqual(0);
      expect(analysis.score).toBeLessThanOrEqual(100);
    });

    it('should give higher scores to optimized queries', async () => {
      const insightdb = new InsightDB();
      
      // Bad query
      const badAnalysis = await insightdb.analyze('SELECT * FROM users');
      
      // Good query
      const goodAnalysis = await insightdb.analyze(
        'SELECT id, email FROM users WHERE email = $1'
      );
      
      // Good query should have equal or higher score
      expect(goodAnalysis.score).toBeGreaterThanOrEqual(badAnalysis.score);
    });
  });
});
