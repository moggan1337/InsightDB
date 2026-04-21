/**
 * EXPLAIN ANALYZE Parser
 * Parses and analyzes execution plans from PostgreSQL, MySQL, and SQLite
 */

import {
  QueryPlanNode,
  PlanNodeType,
  CostEstimate,
  ActualTime,
  ExplainAnalyzeResult,
  DatabaseEngine
} from '../types';

interface ParsedPlanLine {
  indent: number;
  nodeType: string;
  attributes: Map<string, string>;
}

export class ExplainAnalyzer {
  /**
   * Parse EXPLAIN output from any supported database
   */
  static parse(explainOutput: string, database: DatabaseEngine): ExplainAnalyzeResult | null {
    switch (database) {
      case DatabaseEngine.POSTGRESQL:
        return this.parsePostgreSQL(explainOutput);
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        return this.parseMySQL(explainOutput);
      case DatabaseEngine.SQLITE:
        return this.parseSQLite(explainOutput);
      default:
        return this.parsePostgreSQL(explainOutput);
    }
  }

  /**
   * Parse PostgreSQL EXPLAIN ANALYZE output (JSON format preferred)
   */
  static parsePostgreSQL(jsonOutput: string): ExplainAnalyzeResult | null {
    try {
      // Try JSON format first
      if (jsonOutput.trim().startsWith('[') || jsonOutput.trim().startsWith('{')) {
        const data = JSON.parse(jsonOutput);
        const plan = Array.isArray(data) ? data[0] : data;
        return this.parsePostgresJson(plan);
      }
      
      // Fall back to text format
      return this.parsePostgresText(jsonOutput);
    } catch (e) {
      // Try text format if JSON fails
      return this.parsePostgresText(jsonOutput);
    }
  }

  private static parsePostgresJson(plan: any): ExplainAnalyzeResult {
    const queryPlan = this.convertPostgresNode(plan);
    
    return {
      plan: queryPlan,
      planningTime: plan.Planning_Time || 0,
      executionTime: plan.Execution_Time || 0,
      totalCost: plan.Plan?.Total_Cost || 0,
      estimatedRows: plan.Plan?.Plan_Rows || 0,
      actualRows: plan.Plan?.Actual_Rows || 0,
      wallTime: plan.Execution_Time
    };
  }

  private static convertPostgresNode(node: any): QueryPlanNode {
    const planNode: QueryPlanNode = {
      nodeType: this.mapPostgresNodeType(node.Node_Type || node.Operation),
      outputColumns: [],
      costEstimate: {
        startupCost: parseFloat(node.Startup_Cost || node['Startup cost'] || '0'),
        totalCost: parseFloat(node.Total_Cost || node['Total Cost'] || '0')
      }
    };

    if (node.Relation_Name) {
      planNode.relationName = node.Relation_Name;
    }

    if (node.Alias) {
      planNode.alias = node.Alias;
    }

    if (node.Actual_Startup_Time !== undefined) {
      planNode.actualTime = {
        firstRow: parseFloat(node.Actual_Startup_Time),
        allRows: parseFloat(node.Actual_Total_Time)
      };
    }

    if (node.Actual_Rows !== undefined) {
      planNode.actualRows = parseInt(node.Actual_Rows, 10);
    }

    if (node.Actual_Loops !== undefined) {
      planNode.actualLoops = parseInt(node.Actual_Loops, 10);
    }

    if (node.Index_Name) {
      planNode.indexName = node.Index_Name;
    }

    if (node.Hash_Condition) {
      planNode.hashCondition = node.Hash_Condition;
    }

    if (node.Merge_Condition) {
      planNode.mergeCondition = node.Merge_Condition;
    }

    if (node.Plans) {
      planNode.childPlans = node.Plans.map((child: any) => this.convertPostgresNode(child));
    }

    if (node.Filter) {
      planNode.filter = node.Filter;
    }

    if (node.Index_Cond) {
      planNode.indexCond = node.Index_Cond;
    }

    return planNode;
  }

  private static parsePostgresText(text: string): ExplainAnalyzeResult {
    const lines = text.split('\n');
    const rootNode = this.parsePostgresTextLines(lines);
    
    return {
      plan: rootNode,
      planningTime: 0,
      executionTime: this.extractExecutionTime(text),
      totalCost: rootNode.costEstimate.totalCost,
      estimatedRows: this.extractEstimatedRows(text),
      actualRows: this.extractActualRows(text)
    };
  }

  private static parsePostgresTextLines(lines: string[]): QueryPlanNode {
    let root: QueryPlanNode | null = null;
    let currentNode: QueryPlanNode | null = null;
    const stack: QueryPlanNode[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      const content = line.trim();

      // Skip headers
      if (content.startsWith('Planning Time:') || content.startsWith('Execution Time:')) {
        continue;
      }

      const attributes = this.parseLineAttributes(content);
      const nodeType = this.extractNodeType(content);

      const node: QueryPlanNode = {
        nodeType: this.mapPostgresNodeType(nodeType),
        outputColumns: [],
        costEstimate: {
          startupCost: parseFloat(attributes.get('startup') || attributes.get('cost') || '0'),
          totalCost: parseFloat(attributes.get('cost') || '0')
        }
      };

      if (attributes.has('rows')) {
        node.actualRows = parseInt(attributes.get('rows')!, 10);
      }

      if (attributes.has('loops')) {
        node.actualLoops = parseInt(attributes.get('loops')!, 10);
      }

      if (attributes.has('actual')) {
        const actualParts = attributes.get('actual')!.match(/([\d.]+)/g);
        if (actualParts && actualParts.length >= 2) {
          node.actualTime = {
            firstRow: parseFloat(actualParts[0]),
            allRows: parseFloat(actualParts[1])
          };
        }
      }

      // Extract relation name
      const relMatch = content.match(/(?:on|of)\s+(\w+(?:\.\w+)?)/i);
      if (relMatch) {
        node.relationName = relMatch[1];
      }

      // Extract index name
      const indexMatch = content.match(/using\s+(\w+)/i);
      if (indexMatch) {
        node.indexName = indexMatch[1];
      }

      // Build tree structure
      while (stack.length > indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        root = node;
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.childPlans) {
          parent.childPlans = [];
        }
        parent.childPlans.push(node);
      }

      stack.push(node);
      currentNode = node;
    }

    return root || this.createEmptyPlan();
  }

  private static parseLineAttributes(content: string): Map<string, string> {
    const attrs = new Map<string, string>();
    
    // Extract cost
    const costMatch = content.match(/cost=([\d.]+)(?:\.\.([\d.]+))?/i);
    if (costMatch) {
      attrs.set('startup', costMatch[1]);
      attrs.set('cost', costMatch[2] || costMatch[1]);
    }

    // Extract actual time
    const actualMatch = content.match(/actual=([\d.]+)(?:\.\.([\d.]+))?/i);
    if (actualMatch) {
      attrs.set('actual', `${actualMatch[1]}..${actualMatch[2] || actualMatch[1]}`);
    }

    // Extract rows
    const rowsMatch = content.match(/rows=(\d+)/i);
    if (rowsMatch) {
      attrs.set('rows', rowsMatch[1]);
    }

    // Extract loops
    const loopsMatch = content.match(/loops=(\d+)/i);
    if (loopsMatch) {
      attrs.set('loops', loopsMatch[1]);
    }

    return attrs;
  }

  private static extractNodeType(content: string): string {
    const match = content.match(/^->\s*(\w+(?:\s+\w+)?)/);
    if (match) {
      return match[1];
    }
    
    // For root level
    const rootMatch = content.match(/^(\w+(?:\s+\w+)?)\s*(?:\(|:)/);
    if (rootMatch) {
      return rootMatch[1];
    }

    return content.split(/\s/)[0];
  }

  private static mapPostgresNodeType(nodeType: string): PlanNodeType {
    const upperType = nodeType.toUpperCase().replace(/\s+/g, '_');
    
    const typeMap: Record<string, PlanNodeType> = {
      'SEQ_SCAN': PlanNodeType.SEQ_SCAN,
      'INDEX_SCAN': PlanNodeType.INDEX_SCAN,
      'INDEX_ONLY_SCAN': PlanNodeType.INDEX_ONLY_SCAN,
      'BITMAP_HEAP_SCAN': PlanNodeType.BITMAP_HEAP_SCAN,
      'BITMAP_INDEX_SCAN': PlanNodeType.BITMAP_INDEX_SCAN,
      'NESTED_LOOP': PlanNodeType.NESTED_LOOP,
      'HASH': PlanNodeType.HASH_JOIN,
      'HASHJOIN': PlanNodeType.HASH_JOIN,
      'MERGE_JOIN': PlanNodeType.MERGE_JOIN,
      'MERGEJOIN': PlanNodeType.MERGE_JOIN,
      'MATERIALIZE': PlanNodeType.MATERIALIZE,
      'SORT': PlanNodeType.SORT,
      'LIMIT': PlanNodeType.LIMIT,
      'AGGREGATE': PlanNodeType.AGGREGATE,
      'HASHAGGREGATE': PlanNodeType.HASH_AGGREGATE,
      'GROUP_AGGREGATE': PlanNodeType.GROUP_AGGREGATE,
      'RESULT': PlanNodeType.RESULT,
      'VALUES_SCAN': PlanNodeType.VALUES_SCAN,
      'CTE_SCAN': PlanNodeType.CTE_SCAN,
      'WORK_TABLE_SCAN': PlanNodeType.WORK_TABLE_SCAN,
      'FUNCTION_SCAN': PlanNodeType.FUNCTION_SCAN,
      'TABLE_FUNCTION_SCAN': PlanNodeType.TABLE_FUNCTION_SCAN,
      'SUBQUERY_SCAN': PlanNodeType.SUBQUERY_SCAN,
      'SETOP': PlanNodeType.SETOP,
      'UNIQUE': PlanNodeType.UNIQUE,
      'GATHER': PlanNodeType.GATHER,
      'GATHER_MERGE': PlanNodeType.GATHER_MERGE,
      'PARALLEL_SEQ_SCAN': PlanNodeType.PARALLEL_SEQ_SCAN,
      'PARALLEL_INDEX_SCAN': PlanNodeType.PARALLEL_INDEX_SCAN,
      'INSERT': PlanNodeType.INSERT,
      'UPDATE': PlanNodeType.UPDATE,
      'DELETE': PlanNodeType.DELETE
    };

    return typeMap[upperType] || PlanNodeType.RESULT;
  }

  private static extractExecutionTime(text: string): number {
    const match = text.match(/Execution Time:\s*([\d.]+)\s*ms/i);
    return match ? parseFloat(match[1]) : 0;
  }

  private static extractEstimatedRows(text: string): number {
    const match = text.match(/rows=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private static extractActualRows(text: string): number {
    const match = text.match(/rows=(\d+).*actual/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Parse MySQL EXPLAIN output
   */
  static parseMySQL(text: string): ExplainAnalyzeResult {
    const lines = text.split('\n').filter(l => l.trim());
    const nodes: QueryPlanNode[] = [];

    // MySQL EXPLAIN format: id | select_type | table | type | possible_keys | key | key_len | ref | rows | Extra
    const headers = ['id', 'select_type', 'table', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'Extra'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('+') || line.startsWith('|') || !line.includes('|')) continue;

      const columns = line.split('|').map(c => c.trim()).filter(c => c);
      if (columns.length < 3) continue;

      const node: QueryPlanNode = {
        nodeType: this.mapMySQLNodeType(columns[3] || ''), // type column
        outputColumns: [],
        costEstimate: {
          startupCost: 0,
          totalCost: parseInt(columns[8] || '0', 10) // rows column
        },
        actualRows: parseInt(columns[8] || '0', 10)
      };

      if (columns[2]) {
        node.relationName = columns[2];
      }

      if (columns[5]) {
        node.indexName = columns[5];
      }

      if (columns[9]) {
        node.filter = columns[9];
      }

      nodes.push(node);
    }

    return {
      plan: this.buildTreeFromNodes(nodes),
      planningTime: 0,
      executionTime: 0,
      totalCost: nodes.reduce((sum, n) => sum + n.costEstimate.totalCost, 0),
      estimatedRows: nodes.reduce((sum, n) => sum + (n.actualRows || 0), 0),
      actualRows: 0
    };
  }

  private static mapMySQLNodeType(type: string): PlanNodeType {
    const typeMap: Record<string, PlanNodeType> = {
      'ALL': PlanNodeType.SEQ_SCAN,
      'index': PlanNodeType.INDEX_SCAN,
      'range': PlanNodeType.INDEX_SCAN,
      'ref': PlanNodeType.INDEX_SCAN,
      'eq_ref': PlanNodeType.INDEX_SCAN,
      'const': PlanNodeType.INDEX_SCAN,
      'system': PlanNodeType.RESULT,
      'unique_subquery': PlanNodeType.SUBQUERY_SCAN,
      'index_subquery': PlanNodeType.SUBQUERY_SCAN
    };

    return typeMap[type.toLowerCase()] || PlanNodeType.RESULT;
  }

  private static buildTreeFromNodes(nodes: QueryPlanNode[]): QueryPlanNode {
    if (nodes.length === 0) {
      return this.createEmptyPlan();
    }

    // Simplified tree building - MySQL doesn't have hierarchical plans
    let root = nodes[0];
    for (let i = 1; i < nodes.length; i++) {
      const current = nodes[i];
      let lastNode = root;
      while (lastNode.childPlans && lastNode.childPlans.length > 0) {
        lastNode = lastNode.childPlans[lastNode.childPlans.length - 1];
      }
      if (!lastNode.childPlans) {
        lastNode.childPlans = [];
      }
      lastNode.childPlans.push(current);
    }

    return root;
  }

  /**
   * Parse SQLite EXPLAIN QUERY PLAN output
   */
  static parseSQLite(text: string): ExplainAnalyzeResult {
    const lines = text.split('\n').filter(l => l.trim());
    const nodes: QueryPlanNode[] = [];

    // SQLite format: SEARCH|SCAN TABLE USING INDEX|COMPOUND QUERY etc.
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('QUERY')) continue;

      const node: QueryPlanNode = {
        nodeType: this.mapSQLiteNodeType(trimmed),
        outputColumns: [],
        costEstimate: {
          startupCost: 0,
          totalCost: 10 // SQLite doesn't provide costs
        }
      };

      // Extract table name
      const tableMatch = trimmed.match(/(?:OF|FROM)\s+([`"]?[\w]+[`"]?)/i);
      if (tableMatch) {
        node.relationName = tableMatch[1].replace(/[`"]/g, '');
      }

      // Extract index name
      const indexMatch = trimmed.match(/USING\s+(?:INDEX|INTEGER PRIMARY KEY)\s+([`"]?[\w]+[`"]?)/i);
      if (indexMatch) {
        node.indexName = indexMatch[1].replace(/[`"]/g, '');
      }

      nodes.push(node);
    }

    return {
      plan: this.buildTreeFromNodes(nodes),
      planningTime: 0,
      executionTime: 0,
      totalCost: nodes.length * 10,
      estimatedRows: 0,
      actualRows: 0
    };
  }

  private static mapSQLiteNodeType(description: string): PlanNodeType {
    const upperDesc = description.toUpperCase();
    
    if (upperDesc.includes('SEARCH') && upperDesc.includes('USING INDEX')) {
      return PlanNodeType.INDEX_SCAN;
    }
    if (upperDesc.includes('SCAN') && upperDesc.includes('USING INDEX')) {
      return PlanNodeType.INDEX_SCAN;
    }
    if (upperDesc.includes('SCAN')) {
      return PlanNodeType.SEQ_SCAN;
    }
    if (upperDesc.includes('COMPOUND')) {
      return PlanNodeType.SETOP;
    }
    if (upperDesc.includes('SORT')) {
      return PlanNodeType.SORT;
    }
    if (upperDesc.includes('AGGREGATE')) {
      return PlanNodeType.AGGREGATE;
    }

    return PlanNodeType.RESULT;
  }

  private static createEmptyPlan(): QueryPlanNode {
    return {
      nodeType: PlanNodeType.RESULT,
      outputColumns: [],
      costEstimate: { startupCost: 0, totalCost: 0 }
    };
  }

  /**
   * Analyze execution plan for issues
   */
  static analyzePlan(plan: ExplainAnalyzeResult): {
    issues: string[];
    suggestions: string[];
    score: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const analyzeNode = (node: QueryPlanNode): void => {
      // Check for sequential scans on large tables
      if (node.nodeType === PlanNodeType.SEQ_SCAN) {
        if ((node.actualRows || 0) > 10000) {
          issues.push(`Sequential scan on table '${node.relationName}' processed ${node.actualRows} rows`);
          suggestions.push(`Consider adding an index on columns used in WHERE clause for ${node.relationName}`);
          score -= 15;
        }
      }

      // Check for nested loops with large row counts
      if (node.nodeType === PlanNodeType.NESTED_LOOP) {
        const totalRows = (node.actualRows || 0) * (node.actualLoops || 1);
        if (totalRows > 100000) {
          issues.push(`Nested loop join processed ${totalRows} total rows`);
          suggestions.push('Consider using hash join or merge join for better performance');
          score -= 10;
        }
      }

      // Check for sorts without index
      if (node.nodeType === PlanNodeType.SORT && node.parentRelationships?.includes('Seq Scan')) {
        issues.push('Sort operation on potentially large dataset');
        suggestions.push('Consider adding an index on the ORDER BY column');
        score -= 5;
      }

      // Check for high loop counts
      if ((node.actualLoops || 0) > 100) {
        issues.push(`Node ${node.nodeType} executed ${node.actualLoops} times`);
        suggestions.push('High loop count suggests inefficient execution plan');
        score -= 10;
      }

      // Check cost ratio
      if (node.costEstimate.totalCost > 10000) {
        suggestions.push('High cost estimate - query may benefit from optimization');
        score -= 5;
      }

      // Recursively analyze children
      if (node.childPlans) {
        node.childPlans.forEach(child => analyzeNode(child));
      }
    };

    analyzeNode(plan.plan);

    return {
      issues,
      suggestions: [...new Set(suggestions)],
      score: Math.max(0, score)
    };
  }
}

export default ExplainAnalyzer;
