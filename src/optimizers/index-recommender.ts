/**
 * Index Recommendation Engine
 * Analyzes queries and schema to recommend optimal indexes
 */

import {
  IndexRecommendation,
  IndexType,
  ParsedQuery,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  WhereCondition,
  JoinInfo,
  ColumnRef,
  QueryTable
} from '../types';

interface ColumnUsage {
  column: string;
  table: string;
  frequency: number;
  selectivity: number;
  inWhere: boolean;
  inJoin: boolean;
  inOrderBy: boolean;
  inGroupBy: boolean;
  inSelect: boolean;
  operatorTypes: Set<string>;
}

interface CompositeIndexCandidate {
  columns: string[];
  table: string;
  score: number;
  reason: string;
  includes: string[];
}

export class IndexRecommender {
  private tableStats: Map<string, TableStatistics> = new Map();
  private columnUsages: Map<string, Map<string, ColumnUsage>> = new Map();

  /**
   * Analyze a query and recommend indexes
   */
  analyzeQuery(
    query: ParsedQuery,
    tables: TableInfo[],
    existingIndexes: IndexInfo[]
  ): IndexRecommendation[] {
    this.reset();
    const recommendations: IndexRecommendation[] = [];

    // Analyze column usage patterns
    this.analyzeColumnUsage(query);

    // Find missing single-column indexes
    const singleColumnIndexes = this.findSingleColumnIndexes(query, tables);
    recommendations.push(...singleColumnIndexes);

    // Find composite index opportunities
    const compositeIndexes = this.findCompositeIndexes(query, tables);
    recommendations.push(...compositeIndexes);

    // Find join optimization indexes
    const joinIndexes = this.findJoinIndexes(query, tables);
    recommendations.push(...joinIndexes);

    // Find covering indexes
    const coveringIndexes = this.findCoveringIndexes(query, tables, recommendations);
    recommendations.push(...coveringIndexes);

    // Filter out existing indexes
    const filteredRecommendations = this.filterExistingIndexes(recommendations, existingIndexes);

    // Sort by priority
    return this.sortByPriority(filteredRecommendations);
  }

  private reset(): void {
    this.columnUsages.clear();
  }

  private analyzeColumnUsage(query: ParsedQuery): void {
    // Analyze WHERE conditions
    for (const condition of query.whereConditions) {
      this.recordColumnUsage(
        condition.column,
        {
          inWhere: true,
          operatorType: condition.operator
        }
      );
    }

    // Analyze JOIN conditions
    for (const join of query.joinClauses) {
      for (const condition of join.condition) {
        this.recordColumnUsage(
          condition.column,
          { inJoin: true, operatorType: condition.operator }
        );
        // The value in join condition is also a column reference
        if (typeof condition.value === 'object' && 'column' in condition.value) {
          this.recordColumnUsage(
            condition.value as ColumnRef,
            { inJoin: true, operatorType: condition.operator }
          );
        }
      }
    }

    // Analyze ORDER BY
    for (const orderBy of query.orderBy) {
      this.recordColumnUsage(orderBy.column, { inOrderBy: true });
    }

    // Analyze GROUP BY
    if (query.groupBy) {
      for (const column of query.groupBy.columns) {
        this.recordColumnUsage(column, { inGroupBy: true });
      }
    }

    // Analyze SELECT expressions
    for (const expr of query.selectExpressions) {
      // Extract column references from expressions (simplified)
      if (expr.expr.includes('*')) {
        // Wildcard - can't recommend specific columns
      }
    }
  }

  private recordColumnUsage(
    columnRef: ColumnRef,
    usage: { inWhere?: boolean; inJoin?: boolean; inOrderBy?: boolean; inGroupBy?: boolean; inSelect?: boolean; operatorType?: string }
  ): void {
    const tableName = columnRef.table || 'unknown';
    
    if (!this.columnUsages.has(tableName)) {
      this.columnUsages.set(tableName, new Map());
    }

    const tableUsage = this.columnUsages.get(tableName)!;
    const key = columnRef.column;

    if (!tableUsage.has(key)) {
      tableUsage.set(key, {
        column: key,
        table: tableName,
        frequency: 0,
        selectivity: 0.5,
        inWhere: false,
        inJoin: false,
        inOrderBy: false,
        inGroupBy: false,
        inSelect: false,
        operatorTypes: new Set()
      });
    }

    const usageInfo = tableUsage.get(key)!;
    usageInfo.frequency++;
    
    if (usage.inWhere) {
      usageInfo.inWhere = true;
      usageInfo.selectivity = this.calculateSelectivity(usage.operatorType || '=');
    }
    if (usage.inJoin) usageInfo.inJoin = true;
    if (usage.inOrderBy) usageInfo.inOrderBy = true;
    if (usage.inGroupBy) usageInfo.inGroupBy = true;
    if (usage.inSelect) usageInfo.inSelect = true;
    if (usage.operatorType) usageInfo.operatorTypes.add(usage.operatorType);
  }

  private calculateSelectivity(operator: string): number {
    // Lower selectivity = more selective = better index candidate
    switch (operator) {
      case '=':
        return 0.1; // High selectivity
      case 'BETWEEN':
        return 0.3; // Medium selectivity
      case 'LIKE':
        return 0.4; // Depends on pattern
      case '>':
      case '<':
      case '>=':
      case '<=':
        return 0.3; // Medium selectivity
      case 'IN':
        return 0.2; // High selectivity
      default:
        return 0.5;
    }
  }

  private findSingleColumnIndexes(
    query: ParsedQuery,
    tables: TableInfo[]
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];
    const tableMap = new Map(tables.map(t => [t.name, t]));

    for (const [tableName, columns] of this.columnUsages) {
      const tableInfo = tableMap.get(tableName);
      if (!tableInfo) continue;

      for (const [columnName, usage] of columns) {
        // Skip if column is primary key (already has index)
        const columnInfo = tableInfo.columns.find(c => c.name === columnName);
        if (columnInfo?.isPrimaryKey) continue;

        // Calculate score based on usage patterns
        let score = 0;
        let reasons: string[] = [];

        if (usage.inWhere) {
          score += 30;
          reasons.push('used in WHERE clause');
        }
        if (usage.inJoin) {
          score += 25;
          reasons.push('used in JOIN condition');
        }
        if (usage.inOrderBy) {
          score += 20;
          reasons.push('used in ORDER BY');
        }
        if (usage.inGroupBy) {
          score += 20;
          reasons.push('used in GROUP BY');
        }

        // Bonus for equality conditions
        if (usage.operatorTypes.has('=')) {
          score += 15;
        }

        // Penalty for low selectivity
        if (usage.selectivity > 0.8) {
          score -= 20;
          reasons.push('(low selectivity may limit effectiveness)');
        }

        if (score >= 40) {
          recommendations.push({
            tableName,
            columns: [columnName],
            indexType: this.recommendIndexType(usage, columnInfo),
            priority: this.calculatePriority(score),
            estimatedImprovement: this.estimateImprovement(score),
            estimatedSize: this.estimateIndexSize(tableInfo, [columnName]),
            reason: reasons.join(', ')
          });
        }
      }
    }

    return recommendations;
  }

  private findCompositeIndexes(
    query: ParsedQuery,
    tables: TableInfo[]
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];
    const candidates: CompositeIndexCandidate[] = [];

    // Find columns frequently used together
    for (const [tableName, columns] of this.columnUsages) {
      if (columns.size < 2) continue;

      // Look for composite candidates based on:
      // 1. Columns in same WHERE condition
      // 2. Columns in ORDER BY with GROUP BY
      // 3. Columns in composite equality conditions

      const columnArray = Array.from(columns.values());
      
      // Check if all columns are used in WHERE or JOIN
      const whereJoinColumns = columnArray.filter(c => c.inWhere || c.inJoin);
      if (whereJoinColumns.length >= 2) {
        // Check if they're equality conditions
        const equalityColumns = whereJoinColumns.filter(c => c.operatorTypes.has('='));
        if (equalityColumns.length >= 2) {
          candidates.push({
            columns: equalityColumns.map(c => c.column),
            table: tableName,
            score: equalityColumns.reduce((sum, c) => sum + c.frequency * 10, 0),
            reason: 'Equality conditions on multiple columns',
            includes: []
          });
        }
      }

      // Check for ORDER BY + WHERE combination
      const orderByColumns = columnArray.filter(c => c.inOrderBy);
      const whereColumns = columnArray.filter(c => c.inWhere);
      if (orderByColumns.length > 0 && whereColumns.length > 0) {
        const commonColumns = orderByColumns.filter(c => c.inWhere);
        const distinctColumns = [...new Set([...commonColumns, ...whereColumns])];
        
        if (distinctColumns.length >= 2) {
          candidates.push({
            columns: distinctColumns.map(c => c.column),
            table: tableName,
            score: orderByColumns.reduce((sum, c) => sum + c.frequency * 15, 0),
            reason: 'Columns used in WHERE and ORDER BY',
            includes: orderByColumns.filter(c => !c.inWhere).map(c => c.column)
          });
        }
      }
    }

    // Convert candidates to recommendations
    for (const candidate of candidates) {
      recommendations.push({
        tableName: candidate.table,
        columns: candidate.columns,
        indexType: IndexType.COMPOSITE,
        priority: this.calculatePriority(candidate.score),
        estimatedImprovement: this.estimateImprovement(candidate.score),
        estimatedSize: this.estimateIndexSize(
          tables.find(t => t.name === candidate.table)!,
          candidate.columns
        ),
        includeColumns: candidate.includes.length > 0 ? candidate.includes : undefined,
        reason: candidate.reason
      });
    }

    return recommendations;
  }

  private findJoinIndexes(
    query: ParsedQuery,
    tables: TableInfo[]
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];

    for (const join of query.joinClauses) {
      for (const condition of join.condition) {
        // Both sides of a join should be indexed
        const leftTable = join.leftTable.name;
        const rightTable = join.rightTable.name;

        recommendations.push({
          tableName: leftTable,
          columns: [condition.column.column],
          indexType: IndexType.BTREE,
          priority: 85,
          estimatedImprovement: 30,
          estimatedSize: this.estimateIndexSize(
            tables.find(t => t.name === leftTable)!,
            [condition.column.column]
          ),
          reason: `Optimize ${join.type} join on column ${condition.column.column}`
        });

        if (typeof condition.value === 'object' && 'column' in condition.value) {
          recommendations.push({
            tableName: rightTable,
            columns: [(condition.value as ColumnRef).column],
            indexType: IndexType.BTREE,
            priority: 85,
            estimatedImprovement: 30,
            estimatedSize: this.estimateIndexSize(
              tables.find(t => t.name === rightTable)!,
              [(condition.value as ColumnRef).column]
            ),
            reason: `Optimize ${join.type} join on column ${(condition.value as ColumnRef).column}`
          });
        }
      }
    }

    return recommendations;
  }

  private findCoveringIndexes(
    query: ParsedQuery,
    tables: TableInfo[],
    existingRecommendations: IndexRecommendation[]
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];

    // For each table in the query
    for (const table of query.tables) {
      const tableInfo = tables.find(t => t.name === table.name || t.name.includes(table.name));
      if (!tableInfo) continue;

      // Find columns needed from SELECT
      const neededColumns = this.getColumnsNeededForSelect(query, table.name);
      
      // If there's already a recommended index, check if it can be extended to covering
      const existingRec = existingRecommendations.find(r => r.tableName === table.name);
      
      if (existingRec && neededColumns.length > 0) {
        const additionalColumns = neededColumns.filter(c => !existingRec.columns.includes(c));
        
        if (additionalColumns.length > 0 && additionalColumns.length <= 3) {
          recommendations.push({
            tableName: table.name,
            columns: [...existingRec.columns, ...additionalColumns],
            indexType: IndexType.COMPOSITE,
            priority: existingRec.priority + 5,
            estimatedImprovement: existingRec.estimatedImprovement * 1.2,
            estimatedSize: this.estimateIndexSize(tableInfo, [...existingRec.columns, ...additionalColumns]),
            includeColumns: additionalColumns,
            reason: 'Covering index - eliminates table lookup'
          });
        }
      }
    }

    return recommendations;
  }

  private getColumnsNeededForSelect(query: ParsedQuery, tableName: string): string[] {
    const columns: string[] = [];

    for (const expr of query.selectExpressions) {
      // Simple extraction - would need more sophisticated parsing in production
      if (expr.expr.includes(tableName) || expr.expr === '*') {
        // For SELECT *, we'd need schema info to know which columns
      } else {
        // Extract column names from expression
        const matches = expr.expr.match(/(\w+)\.(\w+)/g);
        if (matches) {
          for (const match of matches) {
            const [, tbl, col] = match.split('.');
            if (tbl === tableName || tableName.includes(tbl)) {
              columns.push(col);
            }
          }
        }
      }
    }

    return [...new Set(columns)];
  }

  private recommendIndexType(usage: ColumnUsage, columnInfo?: ColumnInfo): IndexType {
    // Check if column contains text that might benefit from full-text search
    if (columnInfo) {
      if (columnInfo.dataType === 'TEXT' || columnInfo.dataType === 'VARCHAR') {
        if (usage.operatorTypes.has('LIKE') && !usage.operatorTypes.has('=')) {
          return IndexType.FULLTEXT;
        }
      }

      if (usage.operatorTypes.has('=') && !usage.operatorTypes.has('BETWEEN') && !usage.operatorTypes.has('LIKE')) {
        return IndexType.HASH;
      }
    }

    return IndexType.BTREE;
  }

  private filterExistingIndexes(
    recommendations: IndexRecommendation[],
    existingIndexes: IndexInfo[]
  ): IndexRecommendation[] {
    const existingMap = new Map<string, Set<string>>();

    // Build map of existing indexes by table
    for (const idx of existingIndexes) {
      const key = idx.tableName;
      if (!existingMap.has(key)) {
        existingMap.set(key, new Set());
      }
      existingMap.get(key)!.add(idx.columns.sort().join(','));
    }

    return recommendations.filter(rec => {
      const existing = existingMap.get(rec.tableName);
      if (!existing) return true;

      const recKey = rec.columns.sort().join(',');
      return !existing.has(recKey);
    });
  }

  private sortByPriority(recommendations: IndexRecommendation[]): IndexRecommendation[] {
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  private calculatePriority(score: number): number {
    if (score >= 80) return 95;
    if (score >= 60) return 80;
    if (score >= 40) return 60;
    if (score >= 20) return 40;
    return 20;
  }

  private estimateImprovement(score: number): number {
    // Estimate percentage improvement
    return Math.min(90, Math.round(score * 0.8));
  }

  private estimateIndexSize(tableInfo: TableInfo | undefined, columns: string[]): number {
    if (!tableInfo) return 1000000; // 1MB default

    const rowCount = tableInfo.rowCount || 10000;
    let avgColumnSize = 8; // Default 8 bytes (typical for integers/dates)

    for (const colName of columns) {
      const col = tableInfo.columns.find(c => c.name === colName);
      if (col) {
        avgColumnSize += this.getColumnSize(col);
      }
    }

    // Index overhead (BTREE typically 1.2-1.5x data size)
    return Math.round(rowCount * avgColumnSize * 1.3);
  }

  private getColumnSize(column: ColumnInfo): number {
    switch (column.dataType) {
      case 'INTEGER':
        return 4;
      case 'BIGINT':
        return 8;
      case 'SMALLINT':
        return 2;
      case 'VARCHAR':
        return column.maxLength || 50;
      case 'TEXT':
        return 100; // Assume average
      case 'DATE':
        return 4;
      case 'TIMESTAMP':
        return 8;
      case 'BOOLEAN':
        return 1;
      case 'DECIMAL':
      case 'FLOAT':
      case 'DOUBLE':
        return 8;
      case 'UUID':
        return 16;
      default:
        return 8;
    }
  }

  /**
   * Generate SQL for recommended indexes
   */
  generateCreateIndexSQL(recommendation: IndexRecommendation, engine: string = 'postgresql'): string {
    const indexType = recommendation.indexType;
    const tableName = recommendation.tableName;
    const columns = recommendation.columns;
    
    const indexName = this.generateIndexName(tableName, columns);
    
    let sql = 'CREATE';
    
    if (recommendation.indexType === IndexType.UNIQUE) {
      sql += ' UNIQUE';
    }
    
    sql += ` INDEX ${indexName} ON ${tableName}`;
    
    if (engine === 'postgresql') {
      if (indexType === IndexType.GIN || indexType === IndexType.GIST) {
        sql += ` USING ${indexType.toLowerCase()}`;
      }
    }
    
    sql += ` (${columns.join(', ')})`;
    
    if (recommendation.includeColumns && recommendation.includeColumns.length > 0) {
      sql += ` INCLUDE (${recommendation.includeColumns.join(', ')})`;
    }
    
    if (recommendation.whereClause) {
      sql += ` WHERE ${recommendation.whereClause}`;
    }
    
    return sql;
  }

  private generateIndexName(tableName: string, columns: string[]): string {
    const cleanTable = tableName.replace(/\./g, '_').replace(/"/g, '');
    const cleanColumns = columns.map(c => c.replace(/"/g, '')).join('_');
    return `idx_${cleanTable}_${cleanColumns}`.substring(0, 63);
  }
}

interface TableStatistics {
  rowCount: number;
  avgRowSize: number;
  dataSize: number;
}

export default IndexRecommender;
