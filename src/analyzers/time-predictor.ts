/**
 * Execution Time Predictor
 * Predicts query execution time based on query analysis and statistics
 */

import {
  ParsedQuery,
  ExecutionTimePrediction,
  PredictionFactor,
  TableInfo,
  IndexInfo,
  QueryPlanNode,
  PlanNodeType,
  ComplexityLevel
} from '../types';

interface TableStatistics {
  rowCount: number;
  indexCount: number;
  avgRowSize: number;
  dataSizeBytes: number;
}

export class TimePredictor {
  private tableStats: Map<string, TableStatistics> = new Map();

  /**
   * Predict execution time for a query
   */
  predict(
    query: ParsedQuery,
    tables: TableInfo[],
    indexes: IndexInfo[],
    plan?: QueryPlanNode
  ): ExecutionTimePrediction {
    // Initialize table statistics
    this.initializeTableStats(tables);

    // Calculate base factors
    const factors: PredictionFactor[] = [];
    const bottlenecks: string[] = [];

    // 1. Table scan factors
    const scanFactor = this.analyzeScanFactors(query, tables, indexes);
    factors.push(scanFactor);
    if (scanFactor.impact > 30) {
      bottlenecks.push('Full table scans detected');
    }

    // 2. Join factors
    const joinFactor = this.analyzeJoinFactors(query, tables);
    factors.push(joinFactor);
    if (joinFactor.impact > 25) {
      bottlenecks.push('Complex joins may be slow');
    }

    // 3. Sort factors
    const sortFactor = this.analyzeSortFactors(query);
    factors.push(sortFactor);
    if (sortFactor.impact > 20) {
      bottlenecks.push('Sorting operation may be expensive');
    }

    // 4. Network/transfer factors
    const transferFactor = this.analyzeTransferFactors(query);
    factors.push(transferFactor);

    // 5. Index efficiency
    const indexFactor = this.analyzeIndexEfficiency(query, tables, indexes);
    factors.push(indexFactor);
    if (indexFactor.impact > 40) {
      bottlenecks.push('Missing indexes causing full scans');
    }

    // Calculate total estimated time
    const baseTime = 10; // Base 10ms
    const totalImpact = factors.reduce((sum, f) => sum + f.impact, 0);
    const estimatedTime = baseTime + (totalImpact * this.getQueryScaleFactor(query));

    // Calculate confidence based on available data
    const confidence = this.calculateConfidence(tables, indexes);

    // Determine unit
    const unit = estimatedTime < 1000 ? 'ms' : estimatedTime < 60000 ? 's' : 'min';
    const normalizedTime = unit === 'ms' ? estimatedTime : 
                          unit === 's' ? estimatedTime / 1000 : 
                          estimatedTime / 60000;

    return {
      estimatedTime: Math.round(normalizedTime * 100) / 100,
      unit,
      confidence,
      factors,
      bottlenecks
    };
  }

  private initializeTableStats(tables: TableInfo[]): void {
    for (const table of tables) {
      this.tableStats.set(table.name, {
        rowCount: table.rowCount || 10000,
        indexCount: table.columns.filter(c => c.isIndexed).length,
        avgRowSize: this.estimateRowSize(table),
        dataSizeBytes: (table.rowCount || 10000) * this.estimateRowSize(table)
      });
    }
  }

  private estimateRowSize(table: TableInfo): number {
    let size = 0;
    for (const col of table.columns) {
      size += this.getColumnSize(col.dataType);
    }
    return size;
  }

  private getColumnSize(dataType: string): number {
    switch (dataType) {
      case 'INTEGER': return 4;
      case 'BIGINT': return 8;
      case 'SMALLINT': return 2;
      case 'VARCHAR': return 50; // Assume avg
      case 'TEXT': return 100;
      case 'DATE': return 4;
      case 'TIMESTAMP': return 8;
      case 'BOOLEAN': return 1;
      case 'DECIMAL':
      case 'FLOAT':
      case 'DOUBLE': return 8;
      default: return 8;
    }
  }

  private analyzeScanFactors(
    query: ParsedQuery,
    tables: TableInfo[],
    indexes: IndexInfo[]
  ): PredictionFactor {
    let impact = 0;
    let description = '';

    // Check for WHERE conditions that might cause full scans
    const hasWhere = query.whereConditions.length > 0;
    const hasJoins = query.joinClauses.length > 0;
    const hasSelectStar = query.selectExpressions.some(e => e.expr === '*');

    if (!hasWhere && !hasJoins) {
      // Full table scan likely
      const totalRows = tables.reduce((sum, t) => sum + (t.rowCount || 10000), 0);
      impact = Math.min(100, totalRows / 1000);
      description = `Full scan of ~${totalRows.toLocaleString()} rows`;
    } else if (hasWhere) {
      // Check if WHERE uses indexed columns
      const usingIndexes = query.whereConditions.every(c => {
        const table = c.column.table || tables[0]?.name;
        if (!table) return false;
        const tableIndexes = indexes.filter(i => i.tableName === table);
        return tableIndexes.some(i => i.columns.includes(c.column.column));
      });

      if (!usingIndexes) {
        impact = 40;
        description = 'WHERE clause may cause full table scan';
      } else {
        impact = 10;
        description = 'WHERE clause likely uses indexes';
      }
    }

    if (hasSelectStar) {
      impact += 15;
      description += ' (SELECT * adds overhead)';
    }

    return {
      name: 'Table Scan',
      impact,
      description: description || 'Minimal scan overhead'
    };
  }

  private analyzeJoinFactors(
    query: ParsedQuery,
    tables: TableInfo[]
  ): PredictionFactor {
    let impact = 0;
    let description = '';

    const joinCount = query.joinClauses.length;

    if (joinCount === 0) {
      return { name: 'Join Operations', impact: 0, description: 'No joins' };
    }

    // Each join adds complexity
    impact = joinCount * 15;

    // Check join types
    const hasOuterJoin = query.joinClauses.some(j => 
      j.type === 'LEFT' || j.type === 'RIGHT' || j.type === 'FULL'
    );
    if (hasOuterJoin) {
      impact += 10;
    }

    // Check for large table joins
    for (const join of query.joinClauses) {
      const leftSize = this.tableStats.get(join.leftTable.name)?.rowCount || 10000;
      const rightSize = this.tableStats.get(join.rightTable.name)?.rowCount || 10000;
      
      if (leftSize * rightSize > 100000000) {
        impact += 20;
      }
    }

    description = `${joinCount} join(s) detected`;

    return {
      name: 'Join Operations',
      impact,
      description
    };
  }

  private analyzeSortFactors(query: ParsedQuery): PredictionFactor {
    let impact = 0;
    let description = '';

    // ORDER BY adds sorting cost
    if (query.orderBy.length > 0) {
      impact = query.orderBy.length * 8;

      // Check if ORDER BY matches an index
      // (simplified - would need actual index info)
      const hasGroupBy = query.groupBy !== undefined;
      
      if (hasGroupBy) {
        impact += 10;
        description = 'GROUP BY + ORDER BY may require two sorts';
      } else {
        description = 'ORDER BY requires sorting';
      }
    }

    // DISTINCT also requires sorting/unique
    if (query.distinct) {
      impact += 12;
      description += ' + DISTINCT';
    }

    return {
      name: 'Sorting Operations',
      impact,
      description: description || 'No sorting required'
    };
  }

  private analyzeTransferFactors(query: ParsedQuery): PredictionFactor {
    let impact = 0;
    let description = '';

    // Estimate result set size
    const selectCount = query.selectExpressions.length;
    
    if (selectCount > 10) {
      impact = 15;
      description = 'Many columns in SELECT';
    } else if (selectCount > 5) {
      impact = 8;
      description = 'Moderate number of columns';
    } else {
      impact = 2;
      description = 'Minimal data transfer';
    }

    // LIMIT affects transfer
    if (query.limit) {
      const limitRatio = query.limit / 1000;
      impact = Math.max(0, impact - limitRatio * 5);
      description += ` (LIMIT ${query.limit})`;
    }

    return {
      name: 'Data Transfer',
      impact,
      description
    };
  }

  private analyzeIndexEfficiency(
    query: ParsedQuery,
    tables: TableInfo[],
    indexes: IndexInfo[]
  ): PredictionFactor {
    let impact = 0;
    let description = '';

    // Check index coverage
    for (const table of tables) {
      const tableIndexes = indexes.filter(i => i.tableName === table.name);
      
      if (tableIndexes.length === 0) {
        const rowCount = table.rowCount || 10000;
        if (rowCount > 1000) {
          impact += 30;
          description += `No indexes on ${table.name} `;
        }
      }
    }

    // Check for index-only scan opportunities
    const hasSelectStar = query.selectExpressions.some(e => e.expr === '*');
    if (hasSelectStar) {
      impact += 10;
      description += '(SELECT * prevents index-only scans)';
    }

    return {
      name: 'Index Efficiency',
      impact,
      description: description || 'Good index coverage'
    };
  }

  private getQueryScaleFactor(query: ParsedQuery): number {
    let factor = 1;

    // Complexity multipliers
    if (query.joinClauses.length > 3) factor *= 2;
    if (query.groupBy) factor *= 1.5;
    if (query.distinct) factor *= 1.3;
    if (query.orderBy.length > 0) factor *= 1.2;
    if (query.whereConditions.length > 5) factor *= 1.5;

    return factor;
  }

  private calculateConfidence(tables: TableInfo[], indexes: IndexInfo[]): number {
    let confidence = 50; // Base confidence

    // More stats = higher confidence
    if (tables.every(t => t.rowCount !== undefined)) {
      confidence += 20;
    }

    if (tables.every(t => t.lastAnalyzed !== undefined)) {
      confidence += 10;
    }

    // Index coverage
    const indexedTables = new Set(indexes.map(i => i.tableName));
    if (indexedTables.size === tables.length) {
      confidence += 15;
    }

    return Math.min(95, confidence);
  }

  /**
   * Refine prediction with actual execution plan
   */
  refineWithPlan(
    prediction: ExecutionTimePrediction,
    plan: QueryPlanNode
  ): ExecutionTimePrediction {
    // Adjust based on actual plan node types
    let adjustment = 0;

    const analyzePlanNode = (node: QueryPlanNode): void => {
      switch (node.nodeType) {
        case PlanNodeType.SEQ_SCAN:
          adjustment += 20;
          break;
        case PlanNodeType.NESTED_LOOP:
          adjustment += (node.actualLoops || 1) * 2;
          break;
        case PlanNodeType.SORT:
          adjustment += 15;
          break;
        case PlanNodeType.HASH_JOIN:
          adjustment += 10;
          break;
        case PlanNodeType.INDEX_SCAN:
          adjustment -= 20;
          break;
      }

      if (node.childPlans) {
        node.childPlans.forEach(analyzePlanNode);
      }
    };

    analyzePlanNode(plan);

    prediction.estimatedTime = Math.max(1, prediction.estimatedTime + adjustment / 10);
    prediction.confidence = Math.min(95, prediction.confidence + 15);

    return prediction;
  }

  /**
   * Generate improvement suggestions based on prediction
   */
  generateSuggestions(prediction: ExecutionTimePrediction): string[] {
    const suggestions: string[] = [];

    if (prediction.bottlenecks.includes('Full table scans detected')) {
      suggestions.push('Add indexes on columns used in WHERE clauses');
    }

    if (prediction.bottlenecks.includes('Complex joins may be slow')) {
      suggestions.push('Consider denormalization or materialized views for frequent joins');
    }

    if (prediction.bottlenecks.includes('Sorting operation may be expensive')) {
      suggestions.push('Create indexes matching the ORDER BY columns');
    }

    if (prediction.bottlenecks.includes('Missing indexes causing full scans')) {
      suggestions.push('Review index recommendations and add missing indexes');
    }

    const highImpactFactors = prediction.factors.filter(f => f.impact > 30);
    for (const factor of highImpactFactors) {
      suggestions.push(`Optimize ${factor.name.toLowerCase()}: ${factor.description}`);
    }

    return [...new Set(suggestions)];
  }
}

export default TimePredictor;
