/**
 * Tests for Index Recommender
 */

import { IndexRecommender } from '../src/optimizers/index-recommender';
import { SqlParserFacade } from '../src/parsers/sql-parser';
import { IndexType, TableInfo, IndexInfo, DataType } from '../src/types';

describe('IndexRecommender', () => {
  const mockTables: TableInfo[] = [
    {
      name: 'users',
      columns: [
        { name: 'id', dataType: DataType.INTEGER, isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true },
        { name: 'email', dataType: DataType.VARCHAR, isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true, isIndexed: false, maxLength: 255 },
        { name: 'status', dataType: DataType.VARCHAR, isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false, isIndexed: false, maxLength: 20 },
        { name: 'created_at', dataType: DataType.TIMESTAMP, isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false, isIndexed: false }
      ],
      rowCount: 100000
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', dataType: DataType.INTEGER, isNullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true, isIndexed: true },
        { name: 'user_id', dataType: DataType.INTEGER, isNullable: false, isPrimaryKey: false, isForeignKey: true, isUnique: false, isIndexed: false, foreignKeyRef: { table: 'users', column: 'id' } },
        { name: 'status', dataType: DataType.VARCHAR, isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false, isIndexed: false, maxLength: 20 },
        { name: 'total', dataType: DataType.DECIMAL, isNullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false, isIndexed: false, precision: 10, scale: 2 }
      ],
      rowCount: 500000
    }
  ];

  const existingIndexes: IndexInfo[] = [
    { name: 'idx_users_id', tableName: 'users', columns: ['id'], type: IndexType.PRIMARY, isUnique: true, isPrimary: true, isPartial: false, usageCount: 0 }
  ];

  describe('Single column recommendations', () => {
    it('should recommend index for WHERE clause column', () => {
      const query = SqlParserFacade.parse(
        'SELECT * FROM users WHERE email = $1'
      );

      const recommender = new IndexRecommender();
      const recommendations = recommender.analyzeQuery(query, mockTables, existingIndexes);

      expect(recommendations.length).toBeGreaterThan(0);
      
      const emailIndex = recommendations.find(r => 
        r.tableName === 'users' && r.columns.includes('email')
      );
      expect(emailIndex).toBeDefined();
    });

    it('should not recommend index for primary key', () => {
      const query = SqlParserFacade.parse(
        'SELECT * FROM users WHERE id = $1'
      );

      const recommender = new IndexRecommender();
      const recommendations = recommender.analyzeQuery(query, mockTables, existingIndexes);

      const pkIndex = recommendations.find(r => 
        r.tableName === 'users' && r.columns.includes('id')
      );
      expect(pkIndex).toBeUndefined();
    });
  });

  describe('Foreign key recommendations', () => {
    it('should recommend index for foreign key column', () => {
      const query = SqlParserFacade.parse(
        'SELECT * FROM orders WHERE user_id = $1'
      );

      const recommender = new IndexRecommender();
      const recommendations = recommender.analyzeQuery(query, mockTables, existingIndexes);

      const fkIndex = recommendations.find(r => 
        r.tableName === 'orders' && r.columns.includes('user_id')
      );
      expect(fkIndex).toBeDefined();
      expect(fkIndex!.priority).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Composite index recommendations', () => {
    it('should recommend composite index for multiple equality conditions', () => {
      const query = SqlParserFacade.parse(
        'SELECT * FROM orders WHERE user_id = $1 AND status = $2'
      );

      const recommender = new IndexRecommender();
      const recommendations = recommender.analyzeQuery(query, mockTables, existingIndexes);

      const compositeIndex = recommendations.find(r => 
        r.columns.length > 1 && r.tableName === 'orders'
      );
      expect(compositeIndex).toBeDefined();
    });
  });

  describe('Join optimization', () => {
    it('should recommend indexes for JOIN columns', () => {
      const query = SqlParserFacade.parse(
        'SELECT * FROM users u JOIN orders o ON u.id = o.user_id'
      );

      const recommender = new IndexRecommender();
      const recommendations = recommender.analyzeQuery(query, mockTables, existingIndexes);

      const joinIndexes = recommendations.filter(r => 
        r.columns.some(c => ['id', 'user_id'].includes(c))
      );
      expect(joinIndexes.length).toBeGreaterThan(0);
    });
  });

  describe('Index generation', () => {
    it('should generate valid CREATE INDEX SQL for PostgreSQL', () => {
      const recommender = new IndexRecommender();
      const sql = recommender.generateCreateIndexSQL({
        tableName: 'users',
        columns: ['email'],
        indexType: IndexType.BTREE,
        priority: 90,
        estimatedImprovement: 50,
        estimatedSize: 1000000,
        reason: 'Frequently queried column'
      }, 'postgresql');

      expect(sql).toContain('CREATE INDEX');
      expect(sql).toContain('users');
      expect(sql).toContain('email');
      expect(sql).toContain('idx_users_email');
    });

    it('should generate unique index SQL', () => {
      const recommender = new IndexRecommender();
      const sql = recommender.generateCreateIndexSQL({
        tableName: 'users',
        columns: ['email'],
        indexType: IndexType.UNIQUE,
        priority: 90,
        estimatedImprovement: 50,
        estimatedSize: 1000000,
        reason: 'Unique constraint'
      }, 'postgresql');

      expect(sql).toContain('UNIQUE');
    });
  });
});
