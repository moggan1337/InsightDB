/**
 * Join Order Optimizer
 * Optimizes the order of table joins for minimal execution cost
 */

import {
  QueryTable,
  JoinInfo,
  JoinType,
  JoinOrderResult,
  JoinOrderAlternative,
  JoinStrategy,
  WhereCondition,
  TableInfo,
  ComplexityLevel
} from '../types';

interface JoinGraph {
  nodes: Map<string, JoinNode>;
  edges: Map<string, JoinEdge[]>;
}

interface JoinNode {
  table: QueryTable;
  rowCount: number;
  selectivity: number;
}

interface JoinEdge {
  from: string;
  to: string;
  joinCondition: WhereCondition[];
  cardinality: number;
}

interface JoinPlan {
  tables: QueryTable[];
  cost: number;
  strategies: JoinStrategy[];
}

export class JoinOptimizer {
  private tableSizes: Map<string, number> = new Map();
  private joinCardinalities: Map<string, Map<string, number>> = new Map();

  /**
   * Optimize join order for a query
   */
  optimize(
    tables: QueryTable[],
    joins: JoinInfo[],
    tableInfo: TableInfo[]
  ): JoinOrderResult {
    // Build join graph
    const graph = this.buildJoinGraph(tables, joins);
    
    // Set table sizes from schema
    for (const info of tableInfo) {
      this.tableSizes.set(info.name, info.rowCount || 10000);
    }

    // Set default sizes for unknown tables
    for (const table of tables) {
      if (!this.tableSizes.has(table.name)) {
        this.tableSizes.set(table.name, 10000); // Default 10k rows
      }
    }

    if (tables.length <= 2) {
      return this.optimizeSmallQuery(tables, joins);
    }

    // Use dynamic programming for optimal join order
    const optimal = this.findOptimalJoinOrder(graph, tables);

    // Generate alternatives
    const alternatives = this.generateAlternatives(graph, tables, optimal.cost);

    return {
      optimalOrder: optimal.tables,
      estimatedCost: optimal.cost,
      alternatives,
      joinStrategies: optimal.strategies
    };
  }

  private buildJoinGraph(tables: QueryTable[], joins: JoinInfo[]): JoinGraph {
    const graph: JoinGraph = {
      nodes: new Map(),
      edges: new Map()
    };

    // Initialize nodes
    for (const table of tables) {
      graph.nodes.set(table.name, {
        table,
        rowCount: this.tableSizes.get(table.name) || 10000,
        selectivity: 0.1
      });

      if (!graph.edges.has(table.name)) {
        graph.edges.set(table.name, []);
      }
    }

    // Build edges from join conditions
    for (const join of joins) {
      const from = join.leftTable.name;
      const to = join.rightTable.name;
      const cardinality = this.estimateJoinCardinality(join);

      // Add bidirectional edges
      graph.edges.get(from)?.push({
        from,
        to,
        joinCondition: join.condition,
        cardinality
      });

      graph.edges.get(to)?.push({
        from: to,
        to: from,
        joinCondition: join.condition,
        cardinality
      });
    }

    return graph;
  }

  private estimateJoinCardinality(join: JoinInfo): number {
    // Estimate based on join type and conditions
    let baseCardinality = 1000; // Default

    switch (join.type) {
      case JoinType.INNER:
        baseCardinality = 1000;
        break;
      case JoinType.LEFT:
      case JoinType.RIGHT:
        baseCardinality = 1500;
        break;
      case JoinType.FULL:
        baseCardinality = 2000;
        break;
      case JoinType.CROSS:
        baseCardinality = 10000;
        break;
    }

    // Adjust based on condition selectivity
    for (const cond of join.condition) {
      if (cond.operator === '=') {
        baseCardinality *= 0.5; // Equality is selective
      }
    }

    return Math.round(baseCardinality);
  }

  private optimizeSmallQuery(tables: QueryTable[], joins: JoinInfo[]): JoinOrderResult {
    const strategies: JoinStrategy[] = [];
    let estimatedCost = 0;

    // For 2-table queries, choose optimal order
    if (tables.length === 2) {
      const [t1, t2] = tables;
      const size1 = this.tableSizes.get(t1.name) || 10000;
      const size2 = this.tableSizes.get(t2.name) || 10000;

      // Put smaller table first (usually better for hash join)
      const optimalOrder = size1 <= size2 ? tables : [tables[1], tables[0]];
      
      estimatedCost = size1 * size2; // Nested loop cost

      strategies.push({
        tables: optimalOrder,
        strategy: size1 * size2 > 1000000 ? 'HASH_JOIN' : 'NESTED_LOOP',
        estimatedCost
      });

      return {
        optimalOrder,
        estimatedCost,
        alternatives: [{
          order: optimalOrder,
          estimatedCost,
          savingsPercent: 0
        }],
        joinStrategies: strategies
      };
    }

    return {
      optimalOrder: tables,
      estimatedCost: 0,
      alternatives: [],
      joinStrategies: []
    };
  }

  private findOptimalJoinOrder(graph: JoinGraph, tables: QueryTable[]): JoinPlan {
    const n = tables.length;
    const memo: Map<string, JoinPlan> = new Map();

    // Dynamic programming approach
    const dp = new Map<string, number>();
    const parent = new Map<string, string>();

    // Base case: single tables
    for (const table of tables) {
      dp.set(table.name, this.tableSizes.get(table.name) || 10000);
    }

    // Build up from pairs to full set
    const subsets = this.generateSubsets(tables.map(t => t.name));

    for (const subset of subsets) {
      if (subset.length === 1) continue;

      let bestCost = Infinity;
      let bestOrder: QueryTable[] = [];

      // Try all ways to split the subset
      for (let i = 1; i < subset.length; i++) {
        const left = subset.slice(0, i);
        const right = subset.slice(i);

        const leftKey = left.sort().join(',');
        const rightKey = right.sort().join(',');
        const fullKey = subset.sort().join(',');

        const leftCost = dp.get(leftKey) || 0;
        const rightCost = dp.get(rightKey) || 0;

        // Estimate join cost
        const joinCost = this.estimateJoinCost(leftCost, rightCost, graph);

        const totalCost = leftCost + rightCost + joinCost;

        if (totalCost < bestCost) {
          bestCost = totalCost;
          bestOrder = this.tablesFromNames(subset, tables);
          parent.set(fullKey, `${leftKey}|${rightKey}`);
        }
      }

      dp.set(subset.sort().join(','), bestCost);
    }

    const fullKey = tables.map(t => t.name).sort().join(',');
    const bestOrder: string[] = [];
    
    return {
      tables: bestOrder.length > 0 ? bestOrder : tables,
      cost: dp.get(fullKey) || 0,
      strategies: this.determineJoinStrategies(graph, tables)
    };
  }

  private generateSubsets(names: string[]): string[][] {
    const subsets: string[][] = [];
    const n = names.length;

    for (let mask = 1; mask < (1 << n); mask++) {
      const subset: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(names[i]);
        }
      }
      subsets.push(subset);
    }

    // Sort by size (smaller first)
    return subsets.sort((a, b) => a.length - b.length);
  }

  private tablesFromNames(names: string[], allTables: QueryTable[]): QueryTable[] {
    const nameSet = new Set(names);
    return allTables.filter(t => nameSet.has(t.name));
  }

  private estimateJoinCost(leftCost: number, rightCost: number, graph: JoinGraph): number {
    // Simplified cost model
    const ioCost = (leftCost + rightCost) / 1000; // I/O proportional to data size
    const cpuCost = (leftCost + rightCost) * 0.01; // CPU cost

    return Math.round(ioCost + cpuCost);
  }

  private determineJoinStrategies(graph: JoinGraph, tables: QueryTable[]): JoinStrategy[] {
    const strategies: JoinStrategy[] = [];

    for (let i = 0; i < tables.length - 1; i++) {
      const left = tables[i];
      const right = tables[i + 1];
      const leftSize = this.tableSizes.get(left.name) || 10000;
      const rightSize = this.tableSizes.get(right.name) || 10000;

      let strategy: JoinStrategy['strategy'];
      let estimatedCost: number;

      if (leftSize * rightSize > 10000000) {
        strategy = 'HASH_JOIN';
        estimatedCost = leftSize + rightSize + leftSize * Math.log(rightSize);
      } else if (leftSize < 1000 || rightSize < 1000) {
        strategy = 'NESTED_LOOP';
        estimatedCost = leftSize * rightSize;
      } else {
        strategy = 'MERGE_JOIN';
        estimatedCost = leftSize + rightSize + leftSize * Math.log(rightSize);
      }

      strategies.push({
        tables: [left, right],
        strategy,
        estimatedCost: Math.round(estimatedCost)
      });
    }

    return strategies;
  }

  private generateAlternatives(
    graph: JoinGraph,
    tables: QueryTable[],
    optimalCost: number
  ): JoinOrderAlternative[] {
    const alternatives: JoinOrderAlternative[] = [];

    // Generate a few alternative orderings
    const reversed = [...tables].reverse();
    const shuffled = this.shuffleArray([...tables]);

    const orderings = [
      { name: 'reversed', order: reversed },
      { name: 'shuffled', order: shuffled },
      { name: 'by-size-asc', order: this.sortBySize(tables, 'asc') },
      { name: 'by-size-desc', order: this.sortBySize(tables, 'desc') }
    ];

    for (const { name, order } of orderings) {
      const cost = this.estimateOrderCost(order, graph);
      const savings = ((optimalCost - cost) / optimalCost) * 100;

      alternatives.push({
        order,
        estimatedCost: cost,
        savingsPercent: Math.max(0, savings)
      });
    }

    // Sort by cost and take top 3
    return alternatives
      .sort((a, b) => a.estimatedCost - b.estimatedCost)
      .slice(0, 3);
  }

  private estimateOrderCost(order: QueryTable[], graph: JoinGraph): number {
    let cost = 0;
    let accumulatedSize = 1;

    for (let i = 0; i < order.length; i++) {
      const table = order[i];
      const tableSize = this.tableSizes.get(table.name) || 10000;
      
      // Cost of joining this table
      if (i === 0) {
        cost += tableSize;
      } else {
        // Find edge to previous table
        const prevTable = order[i - 1];
        const edges = graph.edges.get(table.name) || [];
        const edge = edges.find(e => e.to === prevTable.name);
        
        const joinSize = edge ? Math.min(tableSize, accumulatedSize) * 0.5 : tableSize * accumulatedSize;
        cost += joinSize;
      }

      accumulatedSize = Math.max(1, accumulatedSize * tableSize * 0.001);
    }

    return cost;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private sortBySize(tables: QueryTable[], direction: 'asc' | 'desc'): QueryTable[] {
    return [...tables].sort((a, b) => {
      const sizeA = this.tableSizes.get(a.name) || 10000;
      const sizeB = this.tableSizes.get(b.name) || 10000;
      return direction === 'asc' ? sizeA - sizeB : sizeB - sizeA;
    });
  }

  /**
   * Generate SQL with optimized join order
   */
  generateOptimizedSQL(
    originalSQL: string,
    optimalOrder: QueryTable[],
    tables: QueryTable[],
    joins: JoinInfo[]
  ): string {
    // This is a simplified version - real implementation would need
    // to preserve aliases and rewrite the query structure
    
    const tableMap = new Map(tables.map(t => [t.name, t]));
    const reorderedTables = optimalOrder.map(name => tableMap.get(name.name)).filter(Boolean) as QueryTable[];

    // Build new FROM clause
    const fromClause = reorderedTables
      .map(t => t.alias ? `${t.name} AS ${t.alias}` : t.name)
      .join(', ');

    // Note: This is a simplified rewrite - actual implementation would
    // need to track and rewrite all references to tables/aliases
    
    return originalSQL;
  }
}

export default JoinOptimizer;
