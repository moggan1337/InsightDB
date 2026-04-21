/**
 * Tests for SQL Parser
 */

import { SqlParserFacade } from '../src/parsers/sql-parser';
import { SqlStatementType, ComplexityLevel } from '../src/types';

describe('SqlParser', () => {
  describe('SELECT parsing', () => {
    it('should parse simple SELECT', () => {
      const result = SqlParserFacade.parse('SELECT * FROM users');
      expect(result.type).toBe(SqlStatementType.SELECT);
      expect(result.tables.length).toBe(1);
      expect(result.tables[0].name).toBe('users');
    });

    it('should parse SELECT with WHERE clause', () => {
      const result = SqlParserFacade.parse(
        'SELECT id, name FROM users WHERE id = 1'
      );
      expect(result.type).toBe(SqlStatementType.SELECT);
      expect(result.whereConditions.length).toBe(1);
      expect(result.selectExpressions.length).toBe(2);
    });

    it('should parse SELECT with JOIN', () => {
      const result = SqlParserFacade.parse(
        'SELECT * FROM users u JOIN orders o ON u.id = o.user_id'
      );
      expect(result.type).toBe(SqlStatementType.SELECT);
      expect(result.tables.length).toBe(2);
      expect(result.joinClauses.length).toBe(1);
    });

    it('should parse SELECT with LEFT JOIN', () => {
      const result = SqlParserFacade.parse(
        'SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id'
      );
      expect(result.joinClauses[0].type).toBe('LEFT');
    });

    it('should parse SELECT with GROUP BY', () => {
      const result = SqlParserFacade.parse(
        'SELECT status, COUNT(*) FROM orders GROUP BY status'
      );
      expect(result.groupBy).toBeDefined();
      expect(result.groupBy!.columns.length).toBe(1);
    });

    it('should parse SELECT with ORDER BY', () => {
      const result = SqlParserFacade.parse(
        'SELECT * FROM users ORDER BY created_at DESC'
      );
      expect(result.orderBy.length).toBe(1);
      expect(result.orderBy[0].direction).toBe('DESC');
    });

    it('should parse SELECT with LIMIT', () => {
      const result = SqlParserFacade.parse(
        'SELECT * FROM users LIMIT 10 OFFSET 5'
      );
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('should parse SELECT DISTINCT', () => {
      const result = SqlParserFacade.parse('SELECT DISTINCT status FROM orders');
      expect(result.distinct).toBe(true);
    });
  });

  describe('Complex query parsing', () => {
    it('should parse complex query with multiple JOINs', () => {
      const result = SqlParserFacade.parse(`
        SELECT u.name, o.total, p.name as product_name
        FROM users u
        JOIN orders o ON u.id = o.user_id
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE u.status = 'active'
          AND o.created_at > '2024-01-01'
        GROUP BY u.name, p.name
        HAVING COUNT(*) > 5
        ORDER BY o.total DESC
        LIMIT 100
      `);
      
      expect(result.tables.length).toBe(4);
      expect(result.joinClauses.length).toBe(3);
      expect(result.whereConditions.length).toBe(2);
      expect(result.groupBy).toBeDefined();
      expect(result.orderBy.length).toBe(1);
      expect(result.limit).toBe(100);
    });
  });

  describe('Other statement types', () => {
    it('should detect INSERT statement', () => {
      const result = SqlParserFacade.detectType('INSERT INTO users VALUES (1, "test")');
      expect(result).toBe(SqlStatementType.INSERT);
    });

    it('should detect UPDATE statement', () => {
      const result = SqlParserFacade.detectType('UPDATE users SET name = "test"');
      expect(result).toBe(SqlStatementType.UPDATE);
    });

    it('should detect DELETE statement', () => {
      const result = SqlParserFacade.detectType('DELETE FROM users WHERE id = 1');
      expect(result).toBe(SqlStatementType.DELETE);
    });
  });

  describe('Complexity scoring', () => {
    it('should score simple query as TRIVIAL', () => {
      const score = SqlParserFacade.getComplexityScore('SELECT * FROM users');
      expect(score).toBeLessThan(20);
    });

    it('should score query with JOIN as SIMPLE', () => {
      const score = SqlParserFacade.getComplexityScore(
        'SELECT * FROM users u JOIN orders o ON u.id = o.user_id'
      );
      expect(score).toBeGreaterThanOrEqual(20);
    });

    it('should score complex query as MODERATE or higher', () => {
      const score = SqlParserFacade.getComplexityScore(`
        SELECT u.name, COUNT(o.id) as order_count
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        WHERE u.status = 'active'
        GROUP BY u.id
        HAVING COUNT(*) > 5
        ORDER BY order_count DESC
        LIMIT 100
      `);
      expect(score).toBeGreaterThanOrEqual(40);
    });
  });
});
