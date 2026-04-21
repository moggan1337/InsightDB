/**
 * Query Plan Visualization
 * Renders query plans as ASCII art, JSON, or other formats
 */

import {
  QueryPlanNode,
  PlanNodeType,
  PlanVisualization,
  PlanNodeViz,
  PlanEdgeViz,
  ExplainAnalyzeResult
} from '../types';

export class PlanVisualizer {
  /**
   * Render plan as ASCII tree
   */
  static renderAscii(plan: ExplainAnalyzeResult): string {
    const lines: string[] = [];
    lines.push('┌─ Query Plan');
    lines.push(`│ Total Cost: ${plan.totalCost.toFixed(2)}`);
    lines.push(`│ Est. Rows: ${plan.estimatedRows}`);
    if (plan.actualRows) {
      lines.push(`│ Actual Rows: ${plan.actualRows}`);
    }
    if (plan.executionTime) {
      lines.push(`│ Execution Time: ${plan.executionTime.toFixed(2)}ms`);
    }
    lines.push('│');
    
    this.renderNodeAscii(plan.plan, lines, '', true);
    
    lines.push('└');
    return lines.join('\n');
  }

  private static renderNodeAscii(
    node: QueryPlanNode,
    lines: string[],
    prefix: string,
    isLast: boolean
  ): void {
    const connector = isLast ? '└─ ' : '├─ ';
    const cost = node.costEstimate.totalCost;
    const rows = node.actualRows || node.costEstimate.totalCost;
    
    let nodeStr = `${prefix}${connector}${node.nodeType}`;
    
    if (node.relationName) {
      nodeStr += ` on ${node.relationName}`;
    }
    
    if (node.indexName) {
      nodeStr += ` (${node.indexName})`;
    }
    
    nodeStr += ` [cost=${cost.toFixed(2)}]`;
    
    if (node.actualRows !== undefined) {
      nodeStr += ` rows=${node.actualRows}`;
    }
    
    if (node.actualTime) {
      nodeStr += ` time=${node.actualTime.allRows.toFixed(2)}ms`;
    }

    lines.push(nodeStr);

    const childPrefix = prefix + (isLast ? '  ' : '│ ');

    if (node.childPlans && node.childPlans.length > 0) {
      node.childPlans.forEach((child, index) => {
        const isLastChild = index === node.childPlans!.length - 1;
        this.renderNodeAscii(child, lines, childPrefix, isLastChild);
      });
    }
  }

  /**
   * Render plan as JSON
   */
  static renderJson(plan: ExplainAnalyzeResult): string {
    return JSON.stringify(plan, null, 2);
  }

  /**
   * Render plan as compact summary
   */
  static renderSummary(plan: ExplainAnalyzeResult): string {
    const lines: string[] = [];
    
    lines.push('═══ QUERY PLAN SUMMARY ═══');
    lines.push('');
    lines.push(`Total Cost:     ${plan.totalCost.toFixed(2)}`);
    lines.push(`Est. Rows:      ${plan.estimatedRows.toLocaleString()}`);
    lines.push(`Actual Rows:    ${(plan.actualRows || 0).toLocaleString()}`);
    lines.push(`Execution Time: ${(plan.executionTime || 0).toFixed(2)}ms`);
    lines.push('');
    lines.push('Node Breakdown:');
    
    const nodeStats = this.getNodeStatistics(plan.plan);
    for (const [type, count] of Object.entries(nodeStats)) {
      lines.push(`  ${type}: ${count}`);
    }
    
    return lines.join('\n');
  }

  private static getNodeStatistics(node: QueryPlanNode): Record<string, number> {
    const stats: Record<string, number> = {};
    
    const countNode = (n: QueryPlanNode): void => {
      const type = n.nodeType;
      stats[type] = (stats[type] || 0) + 1;
      
      if (n.childPlans) {
        n.childPlans.forEach(countNode);
      }
    };
    
    countNode(node);
    return stats;
  }

  /**
   * Render plan as visualization data for web/CLI
   */
  static toVisualization(plan: ExplainAnalyzeResult): PlanVisualization {
    const nodes: PlanNodeViz[] = [];
    const edges: PlanEdgeViz[] = [];
    let nodeId = 0;

    const processNode = (node: QueryPlanNode, parentId?: string): string => {
      const id = `node_${nodeId++}`;
      
      let label = node.nodeType;
      if (node.relationName) {
        label += `\n${node.relationName}`;
      }
      if (node.actualRows !== undefined) {
        label += `\nRows: ${node.actualRows}`;
      }

      nodes.push({
        id,
        label,
        type: node.nodeType as PlanNodeType,
        cost: node.costEstimate.totalCost,
        rowCount: node.actualRows || 0,
        details: {
          startupCost: node.costEstimate.startupCost,
          totalCost: node.costEstimate.totalCost,
          actualTime: node.actualTime,
          actualLoops: node.actualLoops,
          indexName: node.indexName,
          filter: node.filter,
          indexCond: node.indexCond
        }
      });

      if (parentId) {
        edges.push({ from: parentId, to: id });
      }

      if (node.childPlans) {
        for (const child of node.childPlans) {
          processNode(child, id);
        }
      }

      return id;
    };

    processNode(plan.plan);

    return {
      nodes,
      edges,
      totalCost: plan.totalCost,
      estimatedTime: plan.executionTime || 0
    };
  }

  /**
   * Render as mermaid diagram
   */
  static toMermaid(plan: ExplainAnalyzeResult): string {
    const lines: string[] = [];
    lines.push('flowchart TD');
    
    let nodeId = 0;
    const nodeIds = new Map<string, string>();

    const processNode = (node: QueryPlanNode): string => {
      const id = `node${nodeId++}`;
      nodeIds.set(id, node.nodeType);

      let label = node.nodeType.replace(/ /g, '<br/>');
      if (node.relationName) {
        label += `<br/>${node.relationName}`;
      }
      label += `<br/>Cost: ${node.costEstimate.totalCost.toFixed(0)}`;
      
      if (node.actualRows !== undefined) {
        label += `<br/>Rows: ${node.actualRows}`;
      }

      // Use appropriate styling based on node type
      let style = '';
      if (node.nodeType === PlanNodeType.SEQ_SCAN) {
        style = 'fill:#ffcccc';
      } else if (node.nodeType === PlanNodeType.INDEX_SCAN) {
        style = 'fill:#ccffcc';
      } else if (node.nodeType.includes('JOIN')) {
        style = 'fill:#ccccff';
      } else if (node.nodeType === PlanNodeType.SORT) {
        style = 'fill:#ffffcc';
      }

      lines.push(`    ${id}["${label}"]${style ? `:::${this.getStyleClass(node.nodeType)}` : ''}`);

      if (node.childPlans) {
        for (const child of node.childPlans) {
          const childId = processNode(child);
          lines.push(`    ${id} --> ${childId}`);
        }
      }

      return id;
    };

    processNode(plan.plan);

    // Add style classes
    lines.push('');
    lines.push('    classDef scan fill:#ffcccc');
    lines.push('    classDef index fill:#ccffcc');
    lines.push('    classDef join fill:#ccccff');
    lines.push('    classDef sort fill:#ffffcc');

    return lines.join('\n');
  }

  private static getStyleClass(nodeType: PlanNodeType): string {
    if (nodeType === PlanNodeType.SEQ_SCAN) return 'scan';
    if (nodeType === PlanNodeType.INDEX_SCAN) return 'index';
    if (nodeType.includes('JOIN')) return 'join';
    if (nodeType === PlanNodeType.SORT) return 'sort';
    return '';
  }

  /**
   * Highlight performance issues in the plan
   */
  static highlightIssues(plan: ExplainAnalyzeResult): string[] {
    const issues: string[] = [];

    const analyzeNode = (node: QueryPlanNode, depth: number = 0): void => {
      // Sequential scan on large table
      if (node.nodeType === PlanNodeType.SEQ_SCAN) {
        const rows = node.actualRows || node.costEstimate.totalCost;
        if (rows > 10000) {
          issues.push(
            `⚠️  Sequential scan on ${node.relationName || 'table'} (${rows.toLocaleString()} rows)`
          );
        }
      }

      // Nested loop with many iterations
      if (node.nodeType === PlanNodeType.NESTED_LOOP) {
        const loops = node.actualLoops || 0;
        if (loops > 1000) {
          issues.push(
            `⚠️  Nested loop executed ${loops.toLocaleString()} times - consider hash join`
          );
        }
      }

      // High cost node
      if (node.costEstimate.totalCost > 10000) {
        issues.push(
          `⚠️  High cost node: ${node.nodeType} (${node.costEstimate.totalCost.toFixed(0)})`
        );
      }

      // No index usage in WHERE
      if (node.filter && !node.indexCond) {
        issues.push(
          `ℹ️  Filter applied: ${node.filter.substring(0, 50)}...`
        );
      }

      // Recurse to children
      if (node.childPlans) {
        node.childPlans.forEach(child => analyzeNode(child, depth + 1));
      }
    };

    analyzeNode(plan.plan);

    return issues;
  }

  /**
   * Generate HTML visualization
   */
  static toHtml(plan: ExplainAnalyzeResult): string {
    const viz = this.toVisualization(plan);
    
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Query Plan Visualization</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #fff; }
    .node { 
      padding: 10px; margin: 5px; border-radius: 5px; 
      display: inline-block; text-align: center;
      cursor: pointer; transition: transform 0.2s;
    }
    .node:hover { transform: scale(1.05); }
    .seq-scan { background: #e74c3c; }
    .index-scan { background: #27ae60; }
    .join { background: #3498db; }
    .sort { background: #f39c12; }
    .other { background: #95a5a6; }
    .edge { stroke: #666; stroke-width: 2; }
    #graph { width: 100%; height: 600px; }
    .tooltip {
      position: absolute; background: #333; padding: 10px;
      border-radius: 5px; font-size: 12px; max-width: 300px;
      display: none; z-index: 1000;
    }
  </style>
</head>
<body>
  <h1>Query Execution Plan</h1>
  <div id="summary">
    <p><strong>Total Cost:</strong> ${plan.totalCost.toFixed(2)}</p>
    <p><strong>Estimated Rows:</strong> ${plan.estimatedRows.toLocaleString()}</p>
    <p><strong>Actual Rows:</strong> ${(plan.actualRows || 0).toLocaleString()}</p>
    <p><strong>Execution Time:</strong> ${(plan.executionTime || 0).toFixed(2)}ms</p>
  </div>
  <div id="issues">
    <h3>Potential Issues:</h3>
    ${this.highlightIssues(plan).map(i => `<p>${i}</p>`).join('')}
  </div>
  <div id="tree"></div>
  <script>
    const nodes = ${JSON.stringify(viz.nodes)};
    const edges = ${JSON.stringify(viz.edges)};
    
    function getClass(type) {
      if (type.includes('Scan') && type.includes('Seq')) return 'seq-scan';
      if (type.includes('Index')) return 'index-scan';
      if (type.includes('Join')) return 'join';
      if (type.includes('Sort')) return 'sort';
      return 'other';
    }
    
    function renderTree() {
      const container = document.getElementById('tree');
      function renderNode(node, depth = 0) {
        const div = document.createElement('div');
        div.className = 'node ' + getClass(node.type);
        div.style.marginLeft = (depth * 30) + 'px';
        div.innerHTML = '<strong>' + node.type + '</strong><br/>' +
          (node.label.includes('\\n') ? '' : '') +
          'Cost: ' + node.cost.toFixed(0) + '<br/>' +
          'Rows: ' + node.rowCount;
        container.appendChild(div);
        
        edges.filter(e => e.from === node.id).forEach(edge => {
          const child = nodes.find(n => n.id === edge.to);
          if (child) renderNode(child, depth + 1);
        });
      }
      
      const root = nodes.find(n => !edges.some(e => e.to === n.id));
      if (root) renderNode(root);
    }
    
    renderTree();
  </script>
</body>
</html>`;
  }
}

export default PlanVisualizer;
