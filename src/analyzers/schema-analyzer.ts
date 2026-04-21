/**
 * Schema Analyzer
 * Analyzes database schemas for optimization opportunities
 */

import {
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyRef,
  TableRelationship,
  SchemaAnalysis,
  IndexRecommendation,
  RedundancyInfo,
  DataType,
  IndexType
} from '../types';

export class SchemaAnalyzer {
  /**
   * Perform comprehensive schema analysis
   */
  analyze(
    tables: TableInfo[],
    existingIndexes: IndexInfo[]
  ): SchemaAnalysis {
    // Detect relationships from foreign keys
    const relationships = this.detectRelationships(tables);

    // Find missing indexes
    const missingIndexes = this.findMissingIndexes(tables, relationships, existingIndexes);

    // Find redundancy
    const redundancy = this.findRedundancy(tables, existingIndexes);

    // Calculate normalization score
    const normalizationScore = this.calculateNormalizationScore(tables, relationships);

    return {
      tables,
      relationships,
      missingIndexes,
      redundancy,
      normalizationScore
    };
  }

  /**
   * Detect table relationships from foreign keys
   */
  private detectRelationships(tables: TableInfo[]): TableRelationship[] {
    const relationships: TableRelationship[] = [];
    const tableMap = new Map(tables.map(t => [t.name, t]));

    for (const table of tables) {
      for (const column of table.columns) {
        if (column.isForeignKey && column.foreignKeyRef) {
          const ref = column.foreignKeyRef;
          
          // Determine relationship type
          let type: TableRelationship['type'] = 'ONE_TO_MANY';
          
          // Check if this is a primary key reference
          const refTable = tableMap.get(ref.table);
          if (refTable) {
            const refColumn = refTable.columns.find(c => c.name === ref.column);
            if (refColumn?.isPrimaryKey) {
              // If the referencing column is also unique, it's ONE_TO_ONE
              if (column.isUnique) {
                type = 'ONE_TO_ONE';
              }
            }
          }

          relationships.push({
            fromTable: table.name,
            fromColumn: column.name,
            toTable: ref.table,
            toColumn: ref.column,
            type,
            isUsedInQuery: false // Would be updated based on query analysis
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Find missing indexes based on foreign keys and query patterns
   */
  private findMissingIndexes(
    tables: TableInfo[],
    relationships: TableRelationship[],
    existingIndexes: IndexInfo[]
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];

    // Index foreign key columns
    for (const rel of relationships) {
      const existingIndex = existingIndexes.find(i => 
        i.tableName === rel.fromTable && 
        i.columns.includes(rel.fromColumn)
      );

      if (!existingIndex) {
        recommendations.push({
          tableName: rel.fromTable,
          columns: [rel.fromColumn],
          indexType: IndexType.BTREE,
          priority: 80,
          estimatedImprovement: 40,
          estimatedSize: this.estimateIndexSize(tables, rel.fromTable, [rel.fromColumn]),
          reason: `Foreign key column ${rel.fromColumn} should be indexed for join optimization`
        });
      }
    }

    // Index columns used in parent-child relationships
    for (const table of tables) {
      const primaryKey = table.columns.find(c => c.isPrimaryKey);
      
      // Check if primary key is referenced by any foreign key
      const isReferenced = relationships.some(r => 
        r.toTable === table.name && r.toColumn === primaryKey?.name
      );

      if (isReferenced && primaryKey) {
        // Add covering index recommendation
        recommendations.push({
          tableName: table.name,
          columns: [primaryKey.name],
          indexType: IndexType.BTREE,
          priority: 90,
          estimatedImprovement: 50,
          estimatedSize: this.estimateIndexSize(tables, table.name, [primaryKey.name]),
          reason: 'Primary key frequently used in joins - ensure optimal indexing'
        });
      }
    }

    return recommendations;
  }

  /**
   * Find redundant indexes and schema issues
   */
  private findRedundancy(
    tables: TableInfo[],
    indexes: IndexInfo[]
  ): RedundancyInfo[] {
    const redundancy: RedundancyInfo[] = [];

    // Find duplicate/redundant indexes
    const indexSignatures = new Map<string, IndexInfo[]>();

    for (const index of indexes) {
      const signature = `${index.tableName}:${index.columns.join(',')}`;
      if (!indexSignatures.has(signature)) {
        indexSignatures.set(signature, []);
      }
      indexSignatures.get(signature)!.push(index);
    }

    // Check for redundant indexes
    for (const [signature, indices] of indexSignatures) {
      if (indices.length > 1) {
        redundancy.push({
          type: 'Duplicate Indexes',
          description: `Multiple indexes on same columns: ${indices.map(i => i.name).join(', ')}`,
          suggestion: `Keep only one of: ${indices[0].name}`
        });
      }
    }

    // Find covering indexes that could be consolidated
    for (const index of indexes) {
      // Check for indexes that could be covering
      if (index.type !== IndexType.COMPOSITE && index.columns.length === 1) {
        // This single-column index could potentially be combined with others
        redundancy.push({
          type: 'Potential Consolidation',
          description: `Index ${index.name} could be combined with other indexes`,
          suggestion: 'Consider creating a composite covering index'
        });
      }
    }

    // Find unused indexes (simplified check)
    for (const index of indexes) {
      if (index.usageCount === 0 && !index.isPrimary) {
        redundancy.push({
          type: 'Unused Index',
          description: `Index ${index.name} on ${index.tableName} has not been used`,
          suggestion: 'Consider dropping unused indexes to improve write performance'
        });
      }
    }

    // Check for missing NOT NULL constraints
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.isPrimaryKey && column.isNullable) {
          redundancy.push({
            type: 'Schema Issue',
            description: `Primary key ${table.name}.${column.name} should be NOT NULL`,
            suggestion: 'Add NOT NULL constraint to primary key column'
          });
        }
      }
    }

    return redundancy;
  }

  /**
   * Calculate normalization score (0-100)
   */
  private calculateNormalizationScore(
    tables: TableInfo[],
    relationships: TableRelationship[]
  ): number {
    let score = 100;

    // Check for missing foreign keys
    const tablesWithFK = new Set(
      tables.filter(t => t.columns.some(c => c.isForeignKey)).map(t => t.name)
    );
    
    if (tablesWithFK.size < tables.length * 0.5) {
      score -= 20; // Many tables without FK definitions
    }

    // Check for proper primary keys
    const tablesWithoutPK = tables.filter(t => !t.columns.some(c => c.isPrimaryKey));
    score -= tablesWithoutPK.length * 10;

    // Check for denormalized columns (text columns storing IDs)
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.dataType === 'VARCHAR' || column.dataType === 'TEXT') {
          // Check if column name suggests it should be a FK
          if (/[iI]d$/.test(column.name) && column.maxLength && column.maxLength < 50) {
            score -= 5;
          }
        }
      }
    }

    // Check relationship coverage
    if (relationships.length === 0 && tables.length > 1) {
      score -= 30; // No relationships defined between tables
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyze table for partitioning opportunities
   */
  analyzePartitioning(table: TableInfo): {
    recommendation: string;
    partitionColumn?: string;
    partitionType?: string;
  } | null {
    // Recommend partitioning for large tables
    if ((table.rowCount || 0) > 10000000) {
      // Check for date/timestamp columns
      const dateColumn = table.columns.find(c => 
        c.dataType === 'DATE' || c.dataType === 'TIMESTAMP'
      );

      if (dateColumn) {
        return {
          recommendation: `Table ${table.name} would benefit from range partitioning on ${dateColumn.name}`,
          partitionColumn: dateColumn.name,
          partitionType: 'RANGE'
        };
      }

      // Check for status/enum columns for list partitioning
      const statusColumn = table.columns.find(c => 
        /status|type|category|state/i.test(c.name)
      );

      if (statusColumn) {
        return {
          recommendation: `Table ${table.name} could use list partitioning on ${statusColumn.name}`,
          partitionColumn: statusColumn.name,
          partitionType: 'LIST'
        };
      }

      return {
        recommendation: `Table ${table.name} is large and should be considered for partitioning`
      };
    }

    return null;
  }

  /**
   * Generate ALTER TABLE statements for recommended schema changes
   */
  generateAlterStatements(recommendations: RedundancyInfo[]): string[] {
    const statements: string[] = [];

    for (const rec of recommendations) {
      if (rec.type === 'Schema Issue' && rec.description.includes('NOT NULL')) {
        // Extract table and column from description
        const match = rec.description.match(/(\w+)\.(\w+)/);
        if (match) {
          statements.push(
            `ALTER TABLE ${match[1]} ALTER COLUMN ${match[2]} SET NOT NULL;`
          );
        }
      }
    }

    return statements;
  }

  private estimateIndexSize(
    tables: TableInfo[],
    tableName: string,
    columns: string[]
  ): number {
    const table = tables.find(t => t.name === tableName);
    if (!table) return 1000000;

    const rowCount = table.rowCount || 10000;
    let avgColumnSize = 8;

    for (const colName of columns) {
      const col = table.columns.find(c => c.name === colName);
      if (col) {
        switch (col.dataType) {
          case 'INTEGER': avgColumnSize += 4; break;
          case 'BIGINT': avgColumnSize += 8; break;
          case 'SMALLINT': avgColumnSize += 2; break;
          case 'VARCHAR': avgColumnSize += col.maxLength || 50; break;
          case 'TEXT': avgColumnSize += 100; break;
          case 'DATE': avgColumnSize += 4; break;
          case 'TIMESTAMP': avgColumnSize += 8; break;
          default: avgColumnSize += 8;
        }
      }
    }

    return Math.round(rowCount * avgColumnSize * 1.3);
  }

  /**
   * Compare two schemas and report differences
   */
  compareSchemas(before: TableInfo[], after: TableInfo[]): {
    added: string[];
    removed: string[];
    modified: { table: string; changes: string[] }[];
  } {
    const beforeMap = new Map(before.map(t => [t.name, t]));
    const afterMap = new Map(after.map(t => [t.name, t]));

    const added = after
      .filter(t => !beforeMap.has(t.name))
      .map(t => t.name);

    const removed = before
      .filter(t => !afterMap.has(t.name))
      .map(t => t.name);

    const modified: { table: string; changes: string[] }[] = [];

    for (const [name, afterTable] of afterMap) {
      const beforeTable = beforeMap.get(name);
      if (beforeTable) {
        const changes = this.findTableChanges(beforeTable, afterTable);
        if (changes.length > 0) {
          modified.push({ table: name, changes });
        }
      }
    }

    return { added, removed, modified };
  }

  private findTableChanges(before: TableInfo, after: TableInfo): string[] {
    const changes: string[] = [];

    // Check column changes
    const beforeColumns = new Map(before.columns.map(c => [c.name, c]));
    const afterColumns = new Map(after.columns.map(c => [c.name, c]));

    // Added columns
    for (const [name] of afterColumns) {
      if (!beforeColumns.has(name)) {
        changes.push(`Added column: ${name}`);
      }
    }

    // Removed columns
    for (const [name] of beforeColumns) {
      if (!afterColumns.has(name)) {
        changes.push(`Removed column: ${name}`);
      }
    }

    // Modified columns
    for (const [name, afterCol] of afterColumns) {
      const beforeCol = beforeColumns.get(name);
      if (beforeCol) {
        if (beforeCol.dataType !== afterCol.dataType) {
          changes.push(`Changed ${name} type: ${beforeCol.dataType} -> ${afterCol.dataType}`);
        }
        if (beforeCol.isNullable !== afterCol.isNullable) {
          changes.push(`Changed ${name} nullable: ${beforeCol.isNullable} -> ${afterCol.isNullable}`);
        }
      }
    }

    return changes;
  }
}

export default SchemaAnalyzer;
