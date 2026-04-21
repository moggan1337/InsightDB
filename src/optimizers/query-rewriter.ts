/**
 * Query Rewrite Engine
 * Suggests and applies query transformations for better performance
 */

import {
  ParsedQuery,
  RewriteSuggestion,
  RewriteType,
  WhereCondition,
  QueryIssue,
  ComplexityLevel,
  SqlStatementType
} from '../types';

export class QueryRewriter {
  /**
   * Analyze a query and suggest rewrites
   */
  analyze(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];
    const issues: QueryIssue[] = [];

    // Check for subquery elimination opportunities
    suggestions.push(...this.checkSubqueryElimination(query));

    // Check for predicate pushdown
    suggestions.push(...this.checkPredicatePushdown(query));

    // Check for join reduction
    suggestions.push(...this.checkJoinReduction(query));

    // Check for distinct elimination
    suggestions.push(...this.checkDistinctElimination(query));

    // Check for group by optimization
    suggestions.push(...this.checkGroupByOptimization(query));

    // Check for constant folding
    suggestions.push(...this.checkConstantFolding(query));

    // Check for projection pruning
    suggestions.push(...this.checkProjectionPruning(query));

    // Check for index hints
    suggestions.push(...this.checkIndexHints(query));

    // Check for limit optimization
    suggestions.push(...this.checkLimitOptimization(query));

    return suggestions;
  }

  private checkSubqueryElimination(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];
    const rawSql = query.rawSql;

    // Check for correlated subqueries in WHERE IN
    const inSubqueryPattern = /WHERE\s+\w+\.\w+\s+IN\s*\(\s*SELECT/i;
    if (inSubqueryPattern.test(rawSql)) {
      suggestions.push({
        id: 'rewrite-001',
        type: RewriteType.ELIMINATE_SUBQUERY,
        original: rawSql.match(/WHERE\s+\S+\s+IN\s*\([^)]+\)/i)?.[0] || '',
        rewritten: rawSql.replace(
          /WHERE\s+\S+\.\S+\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+\S+/i,
          'JOIN $&'
        ).replace('IN (SELECT', 'EXISTS (SELECT'),
        impact: 'HIGH',
        reason: 'IN subquery can be converted to JOIN or EXISTS for better performance',
        estimatedImprovement: 30
      });
    }

    // Check for scalar subqueries that could be cached
    const scalarSubqueryPattern = /\(\s*SELECT\s+.+\s+FROM.+\)\s*(?:AS\s+)?\w+/i;
    if (scalarSubqueryPattern.test(rawSql)) {
      suggestions.push({
        id: 'rewrite-002',
        type: RewriteType.ELIMINATE_SUBQUERY,
        original: 'Scalar subquery',
        rewritten: 'Consider using JOIN or window function',
        impact: 'MEDIUM',
        reason: 'Scalar subqueries are executed for each row; consider flattening',
        estimatedImprovement: 20
      });
    }

    return suggestions;
  }

  private checkPredicatePushdown(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    // Check if WHERE conditions are complex and could be pushed down
    const hasComplexWhere = query.whereConditions.length > 3;
    const hasJoins = query.joinClauses.length > 0;
    const hasSubqueries = query.rawSql.includes('SELECT') && query.rawSql.includes('(');

    if (hasComplexWhere && hasJoins && !hasSubqueries) {
      suggestions.push({
        id: 'rewrite-003',
        type: RewriteType.PUSH_DOWN_PREDICATES,
        original: 'Complex WHERE clause',
        rewritten: 'Break down WHERE conditions and push to individual JOINs',
        impact: 'MEDIUM',
        reason: 'Pushing predicates closer to source tables can reduce intermediate result sets',
        estimatedImprovement: 25
      });
    }

    // Check for functions in WHERE that prevent index usage
    const functionInWherePattern = /WHERE\s+\w+\s*\([^)]+\)\s*[<>=]/i;
    if (functionInWherePattern.test(query.rawSql)) {
      suggestions.push({
        id: 'rewrite-004',
        type: RewriteType.PUSH_DOWN_PREDICATES,
        original: 'Function in WHERE clause',
        rewritten: 'Create functional index or rewrite to avoid function call',
        impact: 'MEDIUM',
        reason: 'Functions on columns prevent index usage; consider rewriting',
        estimatedImprovement: 40
      });
    }

    return suggestions;
  }

  private checkJoinReduction(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    // Check for unnecessary joins
    if (query.joinClauses.length > 3) {
      suggestions.push({
        id: 'rewrite-005',
        type: RewriteType.REDUCE_JOINS,
        original: `Query with ${query.joinClauses.length} joins`,
        rewritten: 'Review each join for necessity; consider denormalization or materialized views',
        impact: 'HIGH',
        reason: 'Excessive joins increase query complexity and execution time',
        estimatedImprovement: 35
      });
    }

    // Check for self-joins that could be replaced
    const selfJoinPattern = /FROM\s+(\w+)\s+\w+.*JOIN\s+\1\s+\w+/i;
    if (selfJoinPattern.test(query.rawSql)) {
      suggestions.push({
        id: 'rewrite-006',
        type: RewriteType.REDUCE_JOINS,
        original: 'Self-join detected',
        rewritten: 'Consider using window functions instead of self-join',
        impact: 'MEDIUM',
        reason: 'Self-joins can often be replaced with window functions',
        estimatedImprovement: 40
      });
    }

    // Check for CROSS JOIN that could be INNER JOIN
    const crossJoinPattern = /,\s*\w+\s+WHERE/i;
    if (crossJoinPattern.test(query.rawSql)) {
      suggestions.push({
        id: 'rewrite-007',
        type: RewriteType.REDUCE_JOINS,
        original: 'Implicit CROSS JOIN (comma-separated tables)',
        rewritten: 'Use explicit INNER JOIN with appropriate conditions',
        impact: 'HIGH',
        reason: 'Implicit cross joins can produce enormous result sets and are often unintentional',
        estimatedImprovement: 50
      });
    }

    return suggestions;
  }

  private checkDistinctElimination(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    if (!query.distinct) return suggestions;

    // Check if DISTINCT could be replaced with GROUP BY
    if (query.selectExpressions.length > 0) {
      suggestions.push({
        id: 'rewrite-008',
        type: RewriteType.ELIMINATE_DISTINCT,
        original: 'DISTINCT',
        rewritten: 'Use GROUP BY with all selected columns instead',
        impact: 'LOW',
        reason: 'GROUP BY can sometimes be more efficient and allows aggregations',
        estimatedImprovement: 5
      });
    }

    // Check if DISTINCT is on a primary key (unnecessary)
    const distinctOnPrimaryPattern = /SELECT\s+DISTINCT\s+\w+\.\w+\s+FROM\s+\w+\s+WHERE\s+\w+\.\w+\s*=/i;
    if (distinctOnPrimaryPattern.test(query.rawSql)) {
      suggestions.push({
        id: 'rewrite-009',
        type: RewriteType.ELIMINATE_DISTINCT,
        original: 'DISTINCT on primary key column',
        rewritten: 'Remove DISTINCT - primary key values are always unique',
        impact: 'HIGH',
        reason: 'DISTINCT on a primary key column is redundant',
        estimatedImprovement: 20
      });
    }

    return suggestions;
  }

  private checkGroupByOptimization(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    if (!query.groupBy) return suggestions;

    // Check if GROUP BY columns are in SELECT
    const groupByColumns = query.groupBy.columns.map(c => c.column);
    const selectColumns = query.selectExpressions.map(e => {
      // Extract column name from expression
      const match = e.expr.match(/(\w+)$/);
      return match ? match[1] : e.expr;
    });

    const nonAggregatedInSelect = selectColumns.filter(col => 
      !groupByColumns.includes(col) && 
      !query.selectExpressions.some(e => e.aggregation)
    );

    if (nonAggregatedInSelect.length === 0 && query.selectExpressions.some(e => e.aggregation)) {
      suggestions.push({
        id: 'rewrite-010',
        type: RewriteType.ELIMINATE_GROUP_BY,
        original: `GROUP BY ${groupByColumns.join(', ')}`,
        rewritten: 'Consider if GROUP BY can be removed or simplified',
        impact: 'LOW',
        reason: 'All SELECT columns are aggregated; GROUP BY may be unnecessary',
        estimatedImprovement: 10
      });
    }

    // Check for GROUP BY on many columns
    if (groupByColumns.length > 4) {
      suggestions.push({
        id: 'rewrite-011',
        type: RewriteType.ELIMINATE_GROUP_BY,
        original: `GROUP BY with ${groupByColumns.length} columns`,
        rewritten: 'Consider pre-aggregation or dimensional modeling',
        impact: 'MEDIUM',
        reason: 'Large GROUP BY can be slow; consider materialized views',
        estimatedImprovement: 30
      });
    }

    return suggestions;
  }

  private checkConstantFolding(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];
    const rawSql = query.rawSql;

    // Check for redundant comparisons
    if (/\bAND\b.*\bOR\b/.test(rawSql) || /\bOR\b.*\bAND\b/.test(rawSql)) {
      suggestions.push({
        id: 'rewrite-012',
        type: RewriteType.SIMPLIFY_EXPRESSIONS,
        original: 'Mixed AND/OR conditions',
        rewritten: 'Use parentheses to clarify precedence and enable optimization',
        impact: 'LOW',
        reason: 'Ambiguous boolean logic can prevent optimizations',
        estimatedImprovement: 5
      });
    }

    // Check for tautologies (always true conditions)
    const tautologyPatterns = [
      /WHERE\s+1\s*=\s*1/i,
      /WHERE\s+true/i,
      /WHERE\s+\w+\s*=\s*\w+\s+AND\s+\w+\s*=\s*\1/i
    ];

    for (const pattern of tautologyPatterns) {
      if (pattern.test(rawSql)) {
        suggestions.push({
          id: 'rewrite-013',
          type: RewriteType.CONSTANT_FOLDING,
          original: 'Tautological condition detected',
          rewritten: 'Remove always-true conditions',
          impact: 'MEDIUM',
          reason: 'Tautologies add unnecessary evaluation overhead',
          estimatedImprovement: 10
        });
        break;
      }
    }

    // Check for contradictions
    const contradictionPatterns = [
      /WHERE\s+\w+\s*=\s*\w+\s+AND\s+\w+\s*!=\s*\1/i,
      /WHERE\s+\w+\s*>\s*\d+\s+AND\s+\w+\s*<\s*\d+/i
    ];

    for (const pattern of contradictionPatterns) {
      if (pattern.test(rawSql)) {
        suggestions.push({
          id: 'rewrite-014',
          type: RewriteType.CONSTANT_FOLDING,
          original: 'Contradictory condition detected',
          rewritten: 'Return empty result set instead of running query',
          impact: 'HIGH',
          reason: 'Query will always return empty - can short-circuit entire execution',
          estimatedImprovement: 100
        });
        break;
      }
    }

    return suggestions;
  }

  private checkProjectionPruning(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    // Check for SELECT *
    const hasSelectAll = query.selectExpressions.some(e => e.expr === '*');
    
    if (hasSelectAll) {
      suggestions.push({
        id: 'rewrite-015',
        type: RewriteType.PROJECTION_PRUNING,
        original: 'SELECT *',
        rewritten: 'Specify only needed columns explicitly',
        impact: 'MEDIUM',
        reason: 'SELECT * retrieves unnecessary data and prevents index-only scans',
        estimatedImprovement: 20
      });
    }

    // Check for unused columns in SELECT
    if (query.selectExpressions.length > 10) {
      suggestions.push({
        id: 'rewrite-016',
        type: RewriteType.PROJECTION_PRUNING,
        original: `SELECT with ${query.selectExpressions.length} expressions`,
        rewritten: 'Consider reducing selected columns or using a view/materialized view',
        impact: 'LOW',
        reason: 'Many SELECT expressions may indicate over-fetching',
        estimatedImprovement: 10
      });
    }

    return suggestions;
  }

  private checkIndexHints(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];
    const rawSql = query.rawSql;

    // Check if query might benefit from index hint
    const hasSequentialScan = rawSql.toUpperCase().includes('COUNT(*)') ||
                              rawSql.toUpperCase().includes('SUM(*)');
    
    if (hasSequentialScan && !rawSql.toUpperCase().includes('INDEX')) {
      suggestions.push({
        id: 'rewrite-017',
        type: RewriteType.USE_INDEX,
        original: 'Aggregate query without index hint',
        rewritten: 'Consider STRAIGHT_JOIN (MySQL) or explicit index hints',
        impact: 'LOW',
        reason: 'Database may not choose optimal join order without hints',
        estimatedImprovement: 15
      });
    }

    return suggestions;
  }

  private checkLimitOptimization(query: ParsedQuery): RewriteSuggestion[] {
    const suggestions: RewriteSuggestion[] = [];

    if (!query.limit) return suggestions;

    // Check for OFFSET with large values
    if (query.offset && query.offset > 1000) {
      suggestions.push({
        id: 'rewrite-018',
        type: RewriteType.SIMPLIFY_EXPRESSIONS,
        original: `OFFSET ${query.offset}`,
        rewritten: 'Use keyset pagination (seek method) instead of OFFSET',
        impact: 'HIGH',
        reason: 'Large OFFSETs require scanning and discarding many rows',
        estimatedImprovement: 80
      });
    }

    // Check for ORDER BY without index
    if (query.orderBy.length > 0 && query.limit) {
      suggestions.push({
        id: 'rewrite-019',
        type: RewriteType.SIMPLIFY_EXPRESSIONS,
        original: 'ORDER BY with LIMIT',
        rewritten: 'Create index matching ORDER BY columns',
        impact: 'MEDIUM',
        reason: 'Index on ORDER BY columns can eliminate sort operation',
        estimatedImprovement: 40
      });
    }

    return suggestions;
  }

  /**
   * Apply a rewrite suggestion to generate optimized SQL
   */
  applyRewrite(query: string, suggestion: RewriteSuggestion): string {
    let result = query;

    switch (suggestion.type) {
      case RewriteType.ELIMINATE_SUBQUERY:
        result = this.applySubqueryElimination(query, suggestion);
        break;
      case RewriteType.ELIMINATE_DISTINCT:
        result = query.replace(/\bDISTINCT\b/gi, '');
        break;
      case RewriteType.PUSH_DOWN_PREDICATES:
        result = suggestion.rewritten;
        break;
      case RewriteType.PROJECTION_PRUNING:
        result = suggestion.rewritten;
        break;
      default:
        result = suggestion.rewritten;
    }

    return result.trim();
  }

  private applySubqueryElimination(query: string, suggestion: RewriteSuggestion): string {
    // Simple replacement for IN to EXISTS
    return query.replace(
      /WHERE\s+(\w+\.\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)/gi,
      'WHERE EXISTS (SELECT 1 FROM $3 WHERE $3.$2 = $1'
    );
  }

  /**
   * Generate optimized version of the query with all safe rewrites applied
   */
  generateOptimizedQuery(
    query: string,
    suggestions: RewriteSuggestion[]
  ): string {
    let optimized = query;

    // Apply high-impact rewrites first
    const sortedSuggestions = [...suggestions].sort((a, b) => {
      const impactOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });

    for (const suggestion of sortedSuggestions) {
      if (suggestion.impact === 'HIGH') {
        optimized = this.applyRewrite(optimized, suggestion);
      }
    }

    return optimized;
  }
}

export default QueryRewriter;
