/**
 * InsightDB - Core Types and Interfaces
 * Defines the fundamental data structures for query optimization
 */

// SQL Statement Types
export enum SqlStatementType {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CREATE_TABLE = 'CREATE_TABLE',
  CREATE_INDEX = 'CREATE_INDEX',
  ALTER_TABLE = 'ALTER_TABLE',
  DROP_TABLE = 'DROP_TABLE',
  DROP_INDEX = 'DROP_INDEX',
  UNKNOWN = 'UNKNOWN'
}

// Database Engine Types
export enum DatabaseEngine {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  SQLITE = 'sqlite',
  MARIADB = 'mariadb',
  UNKNOWN = 'unknown'
}

// Column Data Types
export enum DataType {
  INTEGER = 'INTEGER',
  BIGINT = 'BIGINT',
  SMALLINT = 'SMALLINT',
  VARCHAR = 'VARCHAR',
  TEXT = 'TEXT',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  TIMESTAMP = 'TIMESTAMP',
  DECIMAL = 'DECIMAL',
  FLOAT = 'FLOAT',
  DOUBLE = 'DOUBLE',
  BLOB = 'BLOB',
  JSON = 'JSON',
  UUID = 'UUID',
  ARRAY = 'ARRAY',
  UNKNOWN = 'UNKNOWN'
}

// Query Complexity Levels
export enum ComplexityLevel {
  TRIVIAL = 'TRIVIAL',
  SIMPLE = 'SIMPLE',
  MODERATE = 'MODERATE',
  COMPLEX = 'COMPLEX',
  VERY_COMPLEX = 'VERY_COMPLEX'
}

// Index Types
export enum IndexType {
  BTREE = 'BTREE',
  HASH = 'HASH',
  GIN = 'GIN',
  GIST = 'GIST',
  BRIN = 'BRIN',
  FULLTEXT = 'FULLTEXT',
  UNIQUE = 'UNIQUE',
  COMPOSITE = 'COMPOSITE',
  PRIMARY = 'PRIMARY'
}

// Join Types
export enum JoinType {
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  FULL = 'FULL',
  CROSS = 'CROSS',
  NATURAL = 'NATURAL'
}

// Aggregation Types
export enum AggregationType {
  COUNT = 'COUNT',
  SUM = 'SUM',
  AVG = 'AVG',
  MIN = 'MIN',
  MAX = 'MAX',
  COUNT_DISTINCT = 'COUNT_DISTINCT',
  STRING_AGG = 'STRING_AGG',
  ARRAY_AGG = 'ARRAY_AGG'
}

// Sort Direction
export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

// Table Information
export interface TableInfo {
  name: string;
  schema?: string;
  alias?: string;
  columns: ColumnInfo[];
  rowCount?: number;
  sizeInBytes?: number;
  createdAt?: Date;
  lastAnalyzed?: Date;
}

// Column Information
export interface ColumnInfo {
  name: string;
  dataType: DataType;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isIndexed: boolean;
  defaultValue?: any;
  maxLength?: number;
  precision?: number;
  scale?: number;
  foreignKeyRef?: ForeignKeyRef;
}

// Index Information
export interface IndexInfo {
  name: string;
  tableName: string;
  columns: string[];
  type: IndexType;
  isUnique: boolean;
  isPrimary: boolean;
  isPartial: boolean;
  whereClause?: string;
  sizeInBytes?: number;
  usageCount: number;
  lastUsed?: Date;
}

// Foreign Key Reference
export interface ForeignKeyRef {
  table: string;
  column: string;
  onUpdate?: string;
  onDelete?: string;
}

// Query Table Reference
export interface QueryTable {
  name: string;
  alias?: string;
  schema?: string;
}

// Column Reference
export interface ColumnRef {
  table?: string;
  column: string;
}

// WHERE Condition
export interface WhereCondition {
  column: ColumnRef;
  operator: string;
  value: any;
  logicalOperator?: 'AND' | 'OR';
  negated?: boolean;
  subquery?: boolean;
}

// JOIN Information
export interface JoinInfo {
  type: JoinType;
  leftTable: QueryTable;
  rightTable: QueryTable;
  condition: WhereCondition[];
  using?: string[];
}

// ORDER BY Clause
export interface OrderByClause {
  column: ColumnRef;
  direction: SortDirection;
}

// GROUP BY Clause
export interface GroupByClause {
  columns: ColumnRef[];
  having?: WhereCondition[];
}

// SELECT Expression
export interface SelectExpression {
  expr: string;
  alias?: string;
  aggregation?: AggregationType;
  distinct?: boolean;
  windowFunction?: WindowFunction;
}

// Window Function
export interface WindowFunction {
  function: string;
  partitionBy?: ColumnRef[];
  orderBy?: OrderByClause[];
  frame?: WindowFrame;
}

// Window Frame
export interface WindowFrame {
  type: 'ROWS' | 'RANGE';
  start?: number;
  end?: number;
}

// Parsed SQL Query
export interface ParsedQuery {
  type: SqlStatementType;
  tables: QueryTable[];
  selectExpressions: SelectExpression[];
  whereConditions: WhereCondition[];
  joinClauses: JoinInfo[];
  groupBy?: GroupByClause;
  orderBy: OrderByClause[];
  limit?: number;
  offset?: number;
  forUpdate?: boolean;
  distinct?: boolean;
  rawSql: string;
}

// Query Plan Node Types
export enum PlanNodeType {
  SEQ_SCAN = 'Seq Scan',
  INDEX_SCAN = 'Index Scan',
  INDEX_ONLY_SCAN = 'Index Only Scan',
  BITMAP_HEAP_SCAN = 'Bitmap Heap Scan',
  BITMAP_INDEX_SCAN = 'Bitmap Index Scan',
  NESTED_LOOP = 'Nested Loop',
  HASH_JOIN = 'Hash Join',
  MERGE_JOIN = 'Merge Join',
  MATERIALIZE = 'Materialize',
  SORT = 'Sort',
  LIMIT = 'Limit',
  AGGREGATE = 'Aggregate',
  HASH_AGGREGATE = 'HashAggregate',
  GROUP_AGGREGATE = 'GroupAggregate',
  RESULT = 'Result',
  VALUES_SCAN = 'Values Scan',
  CTE_SCAN = 'CTE Scan',
  WORK_TABLE_SCAN = 'Work Table Scan',
  FUNCTION_SCAN = 'Function Scan',
  TABLE_FUNCTION_SCAN = 'Table Function Scan',
  SUBQUERY_SCAN = 'Subquery Scan',
  SETOP = 'SetOp',
  UNIQUE = 'Unique',
  GATHER = 'Gather',
  GATHER_MERGE = 'Gather Merge',
  PARALLEL_SEQ_SCAN = 'Parallel Seq Scan',
  PARALLEL_INDEX_SCAN = 'Parallel Index Scan',
  INSERT = 'Insert',
  UPDATE = 'Update',
  DELETE = 'Delete'
}

// Query Plan Node
export interface QueryPlanNode {
  nodeType: PlanNodeType;
  relationName?: string;
  alias?: string;
  outputColumns: string[];
  costEstimate: CostEstimate;
  actualTime?: ActualTime;
  actualRows?: number;
  actualLoops?: number;
  parentRelationships?: string[];
  childPlans?: QueryPlanNode[];
  indexName?: string;
  hashCondition?: string;
  mergeCondition?: string;
  joinType?: JoinType;
  subplanName?: string;
  filter?: string;
  indexCond?: string;
  recheckCond?: string;
  relationName?: string;
}

// Cost Estimate
export interface CostEstimate {
  startupCost: number;
  totalCost: number;
}

// Actual Execution Time
export interface ActualTime {
  firstRow: number;
  allRows: number;
}

// EXPLAIN ANALYZE Result
export interface ExplainAnalyzeResult {
  plan: QueryPlanNode;
  planningTime: number;
  executionTime: number;
  totalCost: number;
  estimatedRows: number;
  actualRows: number;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  wallTime?: number;
}

// Index Recommendation
export interface IndexRecommendation {
  tableName: string;
  columns: string[];
  indexType: IndexType;
  priority: number;
  estimatedImprovement: number;
  estimatedSize: number;
  whereClause?: string;
  includeColumns?: string[];
  reason: string;
}

// Query Rewrite Suggestion
export interface RewriteSuggestion {
  id: string;
  type: RewriteType;
  original: string;
  rewritten: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  estimatedImprovement: number;
}

// Rewrite Types
export enum RewriteType {
  ELIMINATE_SUBQUERY = 'ELIMINATE_SUBQUERY',
  MERGE_VIEWS = 'MERGE_VIEWS',
  PUSH_DOWN_PREDICATES = 'PUSH_DOWN_PREDICATES',
  SIMPLIFY_EXPRESSIONS = 'SIMPLIFY_EXPRESSIONS',
  REDUCE_JOINS = 'REDUCE_JOINS',
  USE_INDEX = 'USE_INDEX',
  ELIMINATE_DISTINCT = 'ELIMINATE_DISTINCT',
  ELIMINATE_GROUP_BY = 'ELIMINATE_GROUP_BY',
  CONSTANT_FOLDING = 'CONSTANT_FOLDING',
  PROJECTION_PRUNING = 'PROJECTION_PRUNING'
}

// Execution Time Prediction
export interface ExecutionTimePrediction {
  estimatedTime: number;
  unit: 'ms' | 's' | 'min';
  confidence: number;
  factors: PredictionFactor[];
  bottlenecks: string[];
}

// Prediction Factor
export interface PredictionFactor {
  name: string;
  impact: number;
  description: string;
}

// Schema Analysis Result
export interface SchemaAnalysis {
  tables: TableInfo[];
  relationships: TableRelationship[];
  missingIndexes: IndexRecommendation[];
  redundancy: RedundancyInfo[];
  normalizationScore: number;
}

// Table Relationship
export interface TableRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
  isUsedInQuery: boolean;
}

// Redundancy Info
export interface RedundancyInfo {
  type: string;
  description: string;
  suggestion: string;
}

// Join Order Optimization
export interface JoinOrderResult {
  optimalOrder: QueryTable[];
  estimatedCost: number;
  alternatives: JoinOrderAlternative[];
  joinStrategies: JoinStrategy[];
}

// Join Order Alternative
export interface JoinOrderAlternative {
  order: QueryTable[];
  estimatedCost: number;
  savingsPercent: number;
}

// Join Strategy
export interface JoinStrategy {
  tables: QueryTable[];
  strategy: 'NESTED_LOOP' | 'HASH_JOIN' | 'MERGE_JOIN';
  estimatedCost: number;
}

// Partition Analysis
export interface PartitionAnalysis {
  tableName: string;
  partitionColumn?: string;
  partitionType?: string;
  partitionCount?: number;
  partitionSizes?: Map<string, number>;
  recommendations: PartitionRecommendation[];
}

// Partition Recommendation
export interface PartitionRecommendation {
  type: 'ADD_PARTITION' | 'MODIFY_PARTITION' | 'REMOVE_PARTITION';
  description: string;
  estimatedImprovement: number;
}

// Query Analysis Result
export interface QueryAnalysis {
  query: string;
  database: DatabaseEngine;
  complexity: ComplexityLevel;
  parsedQuery: ParsedQuery;
  explainPlan?: ExplainAnalyzeResult;
  indexRecommendations: IndexRecommendation[];
  rewriteSuggestions: RewriteSuggestion[];
  timePrediction?: ExecutionTimePrediction;
  schemaAnalysis?: SchemaAnalysis;
  joinOrder?: JoinOrderResult;
  partitionAnalysis?: PartitionAnalysis[];
  issues: QueryIssue[];
  score: number;
  suggestions: string[];
}

// Query Issue
export interface QueryIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  location?: string;
  suggestion?: string;
}

// Connection Configuration
export interface DbConnectionConfig {
  engine: DatabaseEngine;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  socketPath?: string;
  ssl?: boolean;
}

// Optimizer Configuration
export interface OptimizerConfig {
  enableIndexRecommendations: boolean;
  enableQueryRewrite: boolean;
  enableTimePrediction: boolean;
  enableJoinOptimization: boolean;
  enablePartitionAnalysis: boolean;
  maxRecommendations: number;
  confidenceThreshold: number;
}

// Visualization Data
export interface PlanVisualization {
  nodes: PlanNodeViz[];
  edges: PlanEdgeViz[];
  totalCost: number;
  estimatedTime: number;
}

// Plan Node for Visualization
export interface PlanNodeViz {
  id: string;
  label: string;
  type: PlanNodeType;
  cost: number;
  rowCount: number;
  details: Record<string, any>;
}

// Plan Edge for Visualization
export interface PlanEdgeViz {
  from: string;
  to: string;
  label?: string;
}

// Statistics
export interface TableStatistics {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  indexSizeBytes: number;
  columnStats: ColumnStatistics[];
  indexStats: IndexStatistics[];
}

// Column Statistics
export interface ColumnStatistics {
  columnName: string;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  mostFrequentValues: { value: any; frequency: number }[];
  minValue?: any;
  maxValue?: any;
  avgLength?: number;
  histogram?: any[];
}

// Index Statistics
export interface IndexStatistics {
  indexName: string;
  bloatFactor: number;
  scanCount: number;
  lastScan?: Date;
  lastUse?: Date;
}

// Query Optimization Result
export interface OptimizationResult {
  originalQuery: string;
  optimizedQuery: string;
  improvements: string[];
  estimatedImprovement: number;
  appliedOptimizations: string[];
}

// Export all types
export default {
  SqlStatementType,
  DatabaseEngine,
  DataType,
  ComplexityLevel,
  IndexType,
  JoinType,
  AggregationType,
  SortDirection,
  PlanNodeType,
  RewriteType
};
