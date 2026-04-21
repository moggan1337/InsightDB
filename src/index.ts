/**
 * InsightDB - Main Entry Point
 * Advanced Database Query Optimizer
 */

import {
  DatabaseEngine,
  ParsedQuery,
  QueryAnalysis,
  QueryIssue,
  ComplexityLevel,
  OptimizerConfig,
  IndexRecommendation,
  RewriteSuggestion,
  ExecutionTimePrediction,
  SchemaAnalysis,
  JoinOrderResult,
  ExplainAnalyzeResult,
  TableInfo,
  IndexInfo
} from './types';

import { SqlParserFacade } from './parsers/sql-parser';
import { ExplainAnalyzer } from './analyzers/explain-analyzer';
import { TimePredictor } from './analyzers/time-predictor';
import { SchemaAnalyzer } from './analyzers/schema-analyzer';
import { IndexRecommender } from './optimizers/index-recommender';
import { QueryRewriter } from './optimizers/query-rewriter';
import { JoinOptimizer } from './optimizers/join-optimizer';
import { PlanVisualizer } from './visualization/plan-visualizer';
import { DatabaseConnector, parseConnectionString } from './connectors/db-connector';

export {
  DatabaseEngine,
  SqlStatementType,
  IndexType,
  JoinType,
  AggregationType,
  ComplexityLevel,
  PlanNodeType,
  RewriteType
} from './types';

export {
  SqlParserFacade,
  ExplainAnalyzer,
  PlanVisualizer,
  DatabaseConnector,
  parseConnectionString
};

export interface InsightDBOptions {
  database?: DatabaseEngine;
  connectionString?: string;
  config?: Partial<OptimizerConfig>;
}

export class InsightDB {
  private connector?: DatabaseConnector;
  private config: OptimizerConfig;
  private tables: TableInfo[] = [];
  private indexes: IndexInfo[] = [];

  constructor(options: InsightDBOptions = {}) {
    this.config = {
      enableIndexRecommendations: true,
      enableQueryRewrite: true,
      enableTimePrediction: true,
      enableJoinOptimization: true,
      enablePartitionAnalysis: true,
      maxRecommendations: 10,
      confidenceThreshold: 0.5,
      ...options.config
    };

    if (options.connectionString) {
      const config = parseConnectionString(options.connectionString);
      this.connector = new DatabaseConnector(config);
    }
  }

  /**
   * Connect to a database
   */
  async connect(connectionString: string): Promise<void> {
    const config = parseConnectionString(connectionString);
    this.connector = new DatabaseConnector(config);
    await this.connector.connect();
    
    // Load schema information
    await this.loadSchema();
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.connector) {
      await this.connector.disconnect();
      this.connector = undefined;
    }
  }

  /**
   * Load schema information from connected database
   */
  private async loadSchema(): Promise<void> {
    if (!this.connector) return;

    this.tables = await this.connector.getTables();
    this.indexes = await this.connector.getIndexes();
  }

  /**
   * Set schema information manually (without database connection)
   */
  setSchema(tables: TableInfo[], indexes: IndexInfo[] = []): void {
    this.tables = tables;
    this.indexes = indexes;
  }

  /**
   * Analyze a SQL query
   */
  async analyze(query: string, database?: DatabaseEngine): Promise<QueryAnalysis> {
    const db = database || DatabaseEngine.POSTGRESQL;
    
    // Parse the query
    const parsedQuery = SqlParserFacade.parse(query);
    
    // Calculate complexity
    const complexity = this.calculateComplexity(parsedQuery);
    
    // Detect issues
    const issues = this.detectIssues(parsedQuery);
    
    // Get recommendations based on config
    const indexRecommendations: IndexRecommendation[] = [];
    const rewriteSuggestions: RewriteSuggestion[] = [];
    let explainPlan: ExplainAnalyzeResult | undefined;
    let timePrediction: ExecutionTimePrediction | undefined;
    let joinOrder: JoinOrderResult | undefined;
    let schemaAnalysis: SchemaAnalysis | undefined;

    // Index recommendations
    if (this.config.enableIndexRecommendations) {
      const recommender = new IndexRecommender();
      indexRecommendations.push(
        ...recommender.analyzeQuery(parsedQuery, this.tables, this.indexes)
      );
    }

    // Query rewrite suggestions
    if (this.config.enableQueryRewrite) {
      const rewriter = new QueryRewriter();
      rewriteSuggestions.push(...rewriter.analyze(parsedQuery));
    }

    // EXPLAIN ANALYZE (if connected)
    if (this.connector) {
      try {
        const explainOutput = await this.connector.explainAnalyze(query);
        explainPlan = ExplainAnalyzer.parse(explainOutput, db);
      } catch (error) {
        issues.push({
          severity: 'WARNING',
          code: 'EXPLAIN_FAILED',
          message: `Failed to get execution plan: ${error}`,
          suggestion: 'Query may have syntax errors'
        });
      }
    }

    // Time prediction
    if (this.config.enableTimePrediction) {
      const predictor = new TimePredictor();
      timePrediction = predictor.predict(parsedQuery, this.tables, this.indexes, explainPlan?.plan);
    }

    // Join optimization
    if (this.config.enableJoinOptimization && parsedQuery.joinClauses.length > 0) {
      const optimizer = new JoinOptimizer();
      joinOrder = optimizer.optimize(parsedQuery.tables, parsedQuery.joinClauses, this.tables);
    }

    // Schema analysis
    if (this.config.enablePartitionAnalysis && this.tables.length > 0) {
      const analyzer = new SchemaAnalyzer();
      schemaAnalysis = analyzer.analyze(this.tables, this.indexes);
    }

    // Calculate overall score
    const score = this.calculateScore(issues, explainPlan, indexRecommendations);

    return {
      query,
      database: db,
      complexity,
      parsedQuery,
      explainPlan,
      indexRecommendations: indexRecommendations.slice(0, this.config.maxRecommendations),
      rewriteSuggestions: rewriteSuggestions.slice(0, this.config.maxRecommendations),
      timePrediction,
      schemaAnalysis,
      joinOrder,
      issues,
      score,
      suggestions: this.generateSuggestions(
        issues,
        indexRecommendations,
        rewriteSuggestions,
        timePrediction
      )
    };
  }

  /**
   * Get EXPLAIN ANALYZE output
   */
  async explain(query: string, analyze: boolean = true): Promise<ExplainAnalyzeResult | null> {
    if (!this.connector) {
      throw new Error('Not connected to a database');
    }

    const sql = analyze ? query : `EXPLAIN ${query}`;
    const output = await this.connector.explainAnalyze(sql);
    return ExplainAnalyzer.parse(output, DatabaseEngine.POSTGRESQL);
  }

  /**
   * Visualize query plan
   */
  visualize(plan: ExplainAnalyzeResult, format: 'ascii' | 'json' | 'mermaid' | 'html' = 'ascii'): string {
    switch (format) {
      case 'ascii':
        return PlanVisualizer.renderAscii(plan);
      case 'json':
        return PlanVisualizer.renderJson(plan);
      case 'mermaid':
        return PlanVisualizer.toMermaid(plan);
      case 'html':
        return PlanVisualizer.toHtml(plan);
      default:
        return PlanVisualizer.renderAscii(plan);
    }
  }

  /**
   * Generate index creation SQL
   */
  generateIndexSQL(recommendation: IndexRecommendation, engine: DatabaseEngine = DatabaseEngine.POSTGRESQL): string {
    const recommender = new IndexRecommender();
    return recommender.generateCreateIndexSQL(recommendation, engine.toString());
  }

  /**
   * Apply recommended rewrites to query
   */
  applyRewrites(query: string, suggestions: RewriteSuggestion[]): string {
    const rewriter = new QueryRewriter();
    return rewriter.generateOptimizedQuery(query, suggestions);
  }

  /**
   * Get schema analysis
   */
  analyzeSchema(): SchemaAnalysis {
    const analyzer = new SchemaAnalyzer();
    return analyzer.analyze(this.tables, this.indexes);
  }

  /**
   * Calculate query complexity
   */
  private calculateComplexity(parsedQuery: ParsedQuery): ComplexityLevel {
    const score = SqlParserFacade.getComplexityScore(parsedQuery.rawSql);

    if (score < 20) return ComplexityLevel.TRIVIAL;
    if (score < 40) return ComplexityLevel.SIMPLE;
    if (score < 60) return ComplexityLevel.MODERATE;
    if (score < 80) return ComplexityLevel.COMPLEX;
    return ComplexityLevel.VERY_COMPLEX;
  }

  /**
   * Detect query issues
   */
  private detectIssues(parsedQuery: ParsedQuery): QueryIssue[] {
    const issues: QueryIssue[] = [];

    // Check for SELECT *
    if (parsedQuery.selectExpressions.some(e => e.expr === '*')) {
      issues.push({
        severity: 'INFO',
        code: 'SELECT_STAR',
        message: 'SELECT * fetches unnecessary columns',
        suggestion: 'Specify only needed columns'
      });
    }

    // Check for missing WHERE on large tables
    if (parsedQuery.whereConditions.length === 0 && parsedQuery.tables.length > 0) {
      const table = this.tables.find(t => 
        parsedQuery.tables.some(qt => qt.name === t.name)
      );
      if (table && (table.rowCount || 0) > 10000) {
        issues.push({
          severity: 'WARNING',
          code: 'NO_WHERE',
          message: 'Query without WHERE clause on large table',
          suggestion: 'Add filtering conditions to limit result set'
        });
      }
    }

    // Check for ORDER BY without index
    if (parsedQuery.orderBy.length > 0) {
      const hasIndex = this.indexes.some(idx => 
        parsedQuery.tables.some(t => idx.tableName === t.name)
      );
      if (!hasIndex) {
        issues.push({
          severity: 'INFO',
          code: 'ORDER_NO_INDEX',
          message: 'ORDER BY may cause full sort without index',
          suggestion: 'Consider adding index on ORDER BY columns'
        });
      }
    }

    // Check for DISTINCT on large result sets
    if (parsedQuery.distinct) {
      issues.push({
        severity: 'INFO',
        code: 'DISTINCT',
        message: 'DISTINCT requires sorting/unique operation',
        suggestion: 'Consider if DISTINCT is necessary or if GROUP BY would be better'
      });
    }

    // Check for OR conditions
    const orCount = parsedQuery.rawSql.match(/\bOR\b/gi)?.length || 0;
    if (orCount > 2) {
      issues.push({
        severity: 'WARNING',
        code: 'MANY_OR',
        message: `Query has ${orCount} OR conditions`,
        suggestion: 'Consider using UNION or IN for better index usage'
      });
    }

    // Check for implicit type conversion
    if (/\d+\s*=\s*'\d+'/.test(parsedQuery.rawSql) || /'\d+'\s*=\s*\d+/.test(parsedQuery.rawSql)) {
      issues.push({
        severity: 'WARNING',
        code: 'IMPLICIT_CAST',
        message: 'Implicit type conversion detected',
        suggestion: 'Use consistent types to avoid performance issues'
      });
    }

    return issues;
  }

  /**
   * Calculate overall query score (0-100)
   */
  private calculateScore(
    issues: QueryIssue[],
    plan: ExplainAnalyzeResult | undefined,
    recommendations: IndexRecommendation[]
  ): number {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'ERROR':
          score -= 20;
          break;
        case 'WARNING':
          score -= 10;
          break;
        case 'INFO':
          score -= 3;
          break;
      }
    }

    // Bonus for good execution plan
    if (plan) {
      const analysis = ExplainAnalyzer.analyzePlan(plan);
      score = Math.min(100, score + analysis.score / 10);
    }

    // Reduce for missing indexes
    score -= Math.min(20, recommendations.length * 3);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate human-readable suggestions
   */
  private generateSuggestions(
    issues: QueryIssue[],
    indexRecs: IndexRecommendation[],
    rewriteRecs: RewriteSuggestion[],
    prediction?: ExecutionTimePrediction
  ): string[] {
    const suggestions: string[] = [];

    // From issues
    for (const issue of issues) {
      if (issue.suggestion) {
        suggestions.push(issue.suggestion);
      }
    }

    // From index recommendations
    const highPriorityIndexes = indexRecs.filter(r => r.priority >= 80);
    if (highPriorityIndexes.length > 0) {
      suggestions.push(
        `Consider adding ${highPriorityIndexes.length} high-priority index(es)`
      );
    }

    // From rewrite suggestions
    const highImpactRewrites = rewriteRecs.filter(r => r.impact === 'HIGH');
    if (highImpactRewrites.length > 0) {
      suggestions.push(
        `${highImpactRewrites.length} high-impact query rewrite(s) available`
      );
    }

    // From time prediction
    if (prediction && prediction.bottlenecks.length > 0) {
      suggestions.push(...prediction.bottlenecks.map(b => `Address: ${b}`));
    }

    return [...new Set(suggestions)];
  }
}

// Factory function
export function createInsightDB(options?: InsightDBOptions): InsightDB {
  return new InsightDB(options);
}

export default InsightDB;
