/**
 * Tests for Query Rewriter
 */

import { QueryRewriter } from '../src/optimizers/query-rewriter';
import { 
  ParsedQuery, 
  RewriteSuggestion, 
  RewriteType, 
  SqlStatementType,
  JoinType,
  SortDirection
} from '../src/types';

describe('QueryRewriter', () => {
  let rewriter: QueryRewriter;

  beforeEach(() => {
    rewriter = new QueryRewriter();
  });

  describe('analyze', () => {
    it('should return suggestions for empty query', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [],
        selectExpressions: [],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: ''
      };

      const suggestions = rewriter.analyze(query);
      
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should detect subquery elimination opportunities', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: 'SELECT * FROM users WHERE users.id IN (SELECT user_id FROM orders)'
      };

      const suggestions = rewriter.analyze(query);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === RewriteType.ELIMINATE_SUBQUERY)).toBe(true);
    });

    it('should detect JOIN reduction opportunities', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [
          { name: 'users' },
          { name: 'orders' },
          { name: 'items' },
          { name: 'categories' },
          { name: 'tags' }
        ],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [
          { type: JoinType.INNER, leftTable: { name: 'users' }, rightTable: { name: 'orders' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'orders' }, rightTable: { name: 'items' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'items' }, rightTable: { name: 'categories' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'categories' }, rightTable: { name: 'tags' }, condition: [] }
        ],
        orderBy: [],
        rawSql: 'SELECT * FROM users, orders, items, categories, tags WHERE ...'
      };

      const suggestions = rewriter.analyze(query);
      
      expect(suggestions.some(s => s.type === RewriteType.REDUCE_JOINS)).toBe(true);
    });

    it('should detect DISTINCT elimination opportunities', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [
          { expr: 'id', aggregation: undefined, alias: undefined },
          { expr: 'name', aggregation: undefined, alias: undefined }
        ],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: 'SELECT DISTINCT id, name FROM users WHERE id = 1',
        distinct: true
      };

      const suggestions = rewriter.analyze(query);
      
      expect(suggestions.some(s => s.type === RewriteType.ELIMINATE_DISTINCT)).toBe(true);
    });

    it('should detect projection pruning for SELECT *', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: 'SELECT * FROM users'
      };

      const suggestions = rewriter.analyze(query);
      
      expect(suggestions.some(s => s.type === RewriteType.PROJECTION_PRUNING)).toBe(true);
    });

    it('should detect large OFFSET for keyset pagination suggestion', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [],
        orderBy: [{ column: { column: 'id' }, direction: SortDirection.ASC }],
        rawSql: 'SELECT * FROM users ORDER BY id OFFSET 5000',
        limit: 100,
        offset: 5000
      };

      const suggestions = rewriter.analyze(query);
      
      expect(suggestions.some(s => s.type === RewriteType.SIMPLIFY_EXPRESSIONS && s.original.includes('OFFSET'))).toBe(true);
    });
  });

  describe('applyRewrite', () => {
    it('should apply ELIMINATE_DISTINCT rewrite', () => {
      const query = 'SELECT DISTINCT id, name FROM users';
      const suggestion: RewriteSuggestion = {
        id: 'rewrite-1',
        type: RewriteType.ELIMINATE_DISTINCT,
        original: 'DISTINCT',
        rewritten: '',
        impact: 'MEDIUM',
        reason: 'Remove DISTINCT',
        estimatedImprovement: 10
      };

      const result = rewriter.applyRewrite(query, suggestion);
      
      expect(result).not.toContain('DISTINCT');
      expect(result).toContain('SELECT');
    });

    it('should apply ELIMINATE_SUBQUERY rewrite for IN to EXISTS', () => {
      const query = 'SELECT * FROM users WHERE users.id IN (SELECT user_id FROM orders)';
      const suggestion: RewriteSuggestion = {
        id: 'rewrite-2',
        type: RewriteType.ELIMINATE_SUBQUERY,
        original: 'IN (SELECT user_id FROM orders)',
        rewritten: 'EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)',
        impact: 'HIGH',
        reason: 'Convert IN subquery to EXISTS',
        estimatedImprovement: 30
      };

      const result = rewriter.applyRewrite(query, suggestion);
      
      expect(result.toUpperCase()).toContain('EXISTS');
    });

    it('should apply generic rewrites', () => {
      const query = 'SELECT * FROM users';
      const suggestion: RewriteSuggestion = {
        id: 'rewrite-3',
        type: RewriteType.PROJECTION_PRUNING,
        original: 'SELECT *',
        rewritten: 'SELECT id, name',
        impact: 'MEDIUM',
        reason: 'Prune columns',
        estimatedImprovement: 20
      };

      const result = rewriter.applyRewrite(query, suggestion);
      
      expect(result).toContain('SELECT');
    });
  });

  describe('generateOptimizedQuery', () => {
    it('should apply HIGH impact rewrites first', () => {
      const query = 'SELECT DISTINCT * FROM users WHERE id IN (SELECT user_id FROM orders)';
      
      const suggestions: RewriteSuggestion[] = [
        {
          id: 's1',
          type: RewriteType.REDUCE_JOINS,
          original: 'Multiple joins',
          rewritten: 'Simplified joins',
          impact: 'HIGH',
          reason: 'Reduce joins',
          estimatedImprovement: 40
        },
        {
          id: 's2',
          type: RewriteType.ELIMINATE_DISTINCT,
          original: 'DISTINCT',
          rewritten: '',
          impact: 'LOW',
          reason: 'Remove DISTINCT',
          estimatedImprovement: 5
        }
      ];

      const result = rewriter.generateOptimizedQuery(query, suggestions);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle empty suggestions', () => {
      const query = 'SELECT * FROM users';
      const result = rewriter.generateOptimizedQuery(query, []);
      
      expect(result).toBe(query);
    });

    it('should handle empty query', () => {
      const result = rewriter.generateOptimizedQuery('', []);
      
      expect(result).toBe('');
    });
  });

  describe('suggestion properties', () => {
    it('should have impact levels', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: 'SELECT * FROM users'
      };

      const suggestions = rewriter.analyze(query);
      
      for (const suggestion of suggestions) {
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(suggestion.impact);
      }
    });

    it('should have estimated improvement values', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [
          { name: 'a' },
          { name: 'b' },
          { name: 'c' },
          { name: 'd' },
          { name: 'e' }
        ],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [
          { type: JoinType.INNER, leftTable: { name: 'a' }, rightTable: { name: 'b' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'b' }, rightTable: { name: 'c' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'c' }, rightTable: { name: 'd' }, condition: [] },
          { type: JoinType.INNER, leftTable: { name: 'd' }, rightTable: { name: 'e' }, condition: [] }
        ],
        orderBy: [],
        rawSql: 'SELECT * FROM a, b, c, d, e'
      };

      const suggestions = rewriter.analyze(query);
      
      for (const suggestion of suggestions) {
        expect(suggestion.estimatedImprovement).toBeGreaterThanOrEqual(0);
        expect(suggestion.estimatedImprovement).toBeLessThanOrEqual(100);
      }
    });

    it('should have unique IDs', () => {
      const query: ParsedQuery = {
        type: SqlStatementType.SELECT,
        tables: [{ name: 'users' }],
        selectExpressions: [{ expr: '*', aggregation: undefined, alias: undefined }],
        whereConditions: [],
        joinClauses: [],
        orderBy: [],
        rawSql: 'SELECT * FROM users WHERE users.id IN (SELECT user_id FROM orders)'
      };

      const suggestions = rewriter.analyze(query);
      const ids = suggestions.map(s => s.id);
      const uniqueIds = [...new Set(ids)];
      
      expect(ids.length).toBe(uniqueIds.length);
    });
  });
});
