/**
 * SQL Parser - Tokenizer and Parser for SQL Queries
 * Supports PostgreSQL, MySQL, and SQLite syntax
 */

import {
  SqlStatementType,
  DatabaseEngine,
  ParsedQuery,
  QueryTable,
  ColumnRef,
  WhereCondition,
  JoinInfo,
  JoinType,
  OrderByClause,
  SortDirection,
  SelectExpression,
  AggregationType,
  GroupByClause,
  DataType,
  WindowFunction,
  WindowFrame
} from '../types';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

enum TokenType {
  KEYWORD = 'KEYWORD',
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  OPERATOR = 'OPERATOR',
  PUNCTUATION = 'PUNCTUATION',
  COMPARISON = 'COMPARISON',
  LOGICAL = 'LOGICAL',
  COMMENT = 'COMMENT',
  FUNCTION = 'FUNCTION',
  WILDCARD = 'WILDCARD',
  EOF = 'EOF'
}

// SQL Keywords
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
  'IS', 'NULL', 'TRUE', 'FALSE',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW',
  'AS', 'DISTINCT', 'ALL', 'UNION', 'INTERSECT', 'EXCEPT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
  'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
  'CASCADE', 'RESTRICT', 'CONSTRAINT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'UNIQUE', 'CHECK', 'DEFAULT', 'AUTO_INCREMENT', 'SERIAL',
  'VARCHAR', 'CHAR', 'TEXT', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT',
  'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIME', 'DATETIME', 'FLOAT', 'DOUBLE', 'DECIMAL',
  'NUMERIC', 'BLOB', 'JSON', 'JSONB', 'UUID', 'ARRAY', 'EXPLAIN', 'ANALYZE',
  'FOR', 'SHARE', 'NOWAIT', 'LOCK', 'RETURNING', 'USING'
]);

// Aggregate Functions
const AGGREGATE_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'COUNT_BIG', 'STRING_AGG', 'ARRAY_AGG', 'JSON_AGG', 'JSONB_AGG',
  'XMLAGG', 'BOOL_AND', 'BOOL_OR', 'EVERY', 'STDDEV', 'VARIANCE'
]);

export class SqlTokenizer {
  private sql: string;
  private position: number;
  private tokens: Token[];

  constructor(sql: string) {
    this.sql = sql.trim();
    this.position = 0;
    this.tokens = [];
  }

  tokenize(): Token[] {
    while (this.position < this.sql.length) {
      this.skipWhitespace();
      if (this.position >= this.sql.length) break;

      const char = this.sql[this.position];

      // Skip comments
      if (char === '-' && this.sql[this.position + 1] === '-') {
        this.skipLineComment();
        continue;
      }
      if (char === '/' && this.sql[this.position + 1] === '*') {
        this.skipBlockComment();
        continue;
      }

      // String literals
      if (char === "'" || char === '"') {
        this.tokens.push(this.readString(char));
        continue;
      }

      // Numbers
      if (this.isDigit(char)) {
        this.tokens.push(this.readNumber());
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentifierStart(char)) {
        this.tokens.push(this.readIdentifier());
        continue;
      }

      // Operators and punctuation
      this.tokens.push(this.readOperator());
    }

    this.tokens.push({ type: TokenType.EOF, value: '', position: this.position });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.position < this.sql.length && /\s/.test(this.sql[this.position])) {
      this.position++;
    }
  }

  private skipLineComment(): void {
    const start = this.position;
    this.position += 2;
    while (this.position < this.sql.length && this.sql[this.position] !== '\n') {
      this.position++;
    }
    this.tokens.push({ type: TokenType.COMMENT, value: this.sql.slice(start, this.position), position: start });
  }

  private skipBlockComment(): void {
    const start = this.position;
    this.position += 2;
    while (this.position < this.sql.length - 1) {
      if (this.sql[this.position] === '*' && this.sql[this.position + 1] === '/') {
        this.position += 2;
        break;
      }
      this.position++;
    }
    this.tokens.push({ type: TokenType.COMMENT, value: this.sql.slice(start, this.position), position: start });
  }

  private readString(quote: string): Token {
    const start = this.position;
    let value = '';
    this.position++; // Skip opening quote

    while (this.position < this.sql.length) {
      if (this.sql[this.position] === quote) {
        // Check for escaped quote
        if (this.sql[this.position + 1] === quote) {
          value += quote;
          this.position += 2;
        } else {
          this.position++; // Skip closing quote
          break;
        }
      } else {
        value += this.sql[this.position];
        this.position++;
      }
    }

    return { type: TokenType.STRING, value, position: start };
  }

  private readNumber(): Token {
    const start = this.position;
    let value = '';

    while (this.position < this.sql.length && (this.isDigit(this.sql[this.position]) || this.sql[this.position] === '.')) {
      value += this.sql[this.position];
      this.position++;
    }

    return { type: TokenType.NUMBER, value, position: start };
  }

  private readIdentifier(): Token {
    const start = this.position;
    let value = '';

    while (this.position < this.sql.length && this.isIdentifierChar(this.sql[this.position])) {
      value += this.sql[this.position];
      this.position++;
    }

    const upperValue = value.toUpperCase();
    const type = SQL_KEYWORDS.has(upperValue) ? TokenType.KEYWORD : TokenType.IDENTIFIER;

    return { type, value, position: start };
  }

  private readOperator(): Token {
    const start = this.position;
    const char = this.sql[this.position];
    this.position++;

    // Multi-character operators
    const twoChar = this.sql.slice(this.position - 1, this.position + 1);
    const threeChar = this.sql.slice(this.position - 1, this.position + 2);

    if (['<=', '>=', '!=', '<>', '||'].includes(twoChar)) {
      this.position++;
      return { type: TokenType.COMPARISON, value: twoChar, position: start };
    }

    if (['...', '&&', '||'].includes(threeChar)) {
      this.position += 2;
      return { type: TokenType.OPERATOR, value: threeChar, position: start };
    }

    if (['=', '<', '>'].includes(char)) {
      return { type: TokenType.COMPARISON, value: char, position: start };
    }

    if (['+', '-', '*', '/', '%', '^', '&', '|', '~'].includes(char)) {
      return { type: TokenType.OPERATOR, value: char, position: start };
    }

    return { type: TokenType.PUNCTUATION, value: char, position: start };
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isIdentifierStart(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }
}

export class SqlParser {
  private tokens: Token[];
  private position: number;
  private currentToken: Token;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.position = 0;
    this.currentToken = tokens[0] || { type: TokenType.EOF, value: '', position: 0 };
  }

  parse(): ParsedQuery {
    this.skipComments();

    if (this.currentToken.type === TokenType.KEYWORD) {
      const keyword = this.currentToken.value.toUpperCase();

      switch (keyword) {
        case 'SELECT':
          return this.parseSelect();
        case 'INSERT':
          return this.parseInsert();
        case 'UPDATE':
          return this.parseUpdate();
        case 'DELETE':
          return this.parseDelete();
        case 'EXPLAIN':
          return this.parseExplain();
        default:
          return this.parseUnknown();
      }
    }

    return this.parseUnknown();
  }

  private advance(): void {
    this.position++;
    this.currentToken = this.tokens[this.position] || { type: TokenType.EOF, value: '', position: this.position };
    this.skipComments();
  }

  private skipComments(): void {
    while (this.currentToken.type === TokenType.COMMENT) {
      this.position++;
      this.currentToken = this.tokens[this.position] || { type: TokenType.EOF, value: '', position: this.position };
    }
  }

  private expect(type: TokenType, value?: string): void {
    if (this.currentToken.type !== type) {
      throw new Error(`Expected ${type} at position ${this.currentToken.position}`);
    }
    if (value && this.currentToken.value.toUpperCase() !== value.toUpperCase()) {
      throw new Error(`Expected "${value}" at position ${this.currentToken.position}`);
    }
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.currentToken.type !== type) return false;
    if (value && this.currentToken.value.toUpperCase() !== value.toUpperCase()) return false;
    return true;
  }

  private parseSelect(): ParsedQuery {
    const rawSql = this.getRawSql();
    this.advance(); // Skip SELECT

    const selectExpressions: SelectExpression[] = [];
    const tables: QueryTable[] = [];
    const whereConditions: WhereCondition[] = [];
    const joinClauses: JoinInfo[] = [];
    const orderBy: OrderByClause[] = [];
    let groupBy: GroupByClause | undefined;
    let limit: number | undefined;
    let offset: number | undefined;
    let distinct = false;

    // DISTINCT
    if (this.match(TokenType.KEYWORD, 'DISTINCT')) {
      distinct = true;
      this.advance();
    } else if (this.match(TokenType.KEYWORD, 'ALL')) {
      this.advance();
    }

    // SELECT expressions
    while (!this.isEnd() && !this.matchKeyword(['FROM', 'WHERE', 'ORDER', 'GROUP', 'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT'])) {
      selectExpressions.push(this.parseSelectExpression());

      if (this.match(TokenType.PUNCTUATION, ',')) {
        this.advance();
      } else {
        break;
      }
    }

    // FROM clause
    if (this.matchKeyword(['FROM'])) {
      this.advance();
      this.parseFromClause(tables);
    }

    // JOIN clauses
    while (this.parseJoinClause(tables, joinClauses)) {
      // Continue parsing joins
    }

    // WHERE clause
    if (this.matchKeyword(['WHERE'])) {
      this.advance();
      this.parseWhereClause(whereConditions);
    }

    // GROUP BY clause
    if (this.matchKeyword(['GROUP'])) {
      this.advance();
      this.expect(TokenType.KEYWORD, 'BY');
      this.advance();

      const columns: ColumnRef[] = [];
      while (!this.isEnd()) {
        columns.push(this.parseColumnRef());

        if (!this.match(TokenType.PUNCTUATION, ',')) break;
        this.advance();
      }

      let having: WhereCondition[] | undefined;
      if (this.matchKeyword(['HAVING'])) {
        this.advance();
        having = [];
        this.parseWhereClause(having);
      }

      groupBy = { columns, having };
    }

    // ORDER BY clause
    if (this.matchKeyword(['ORDER'])) {
      this.advance();
      this.expect(TokenType.KEYWORD, 'BY');
      this.advance();

      while (!this.isEnd()) {
        const colRef = this.parseColumnRef();
        let direction: SortDirection = SortDirection.ASC;

        if (this.match(TokenType.KEYWORD, 'DESC')) {
          direction = SortDirection.DESC;
          this.advance();
        } else if (this.match(TokenType.KEYWORD, 'ASC')) {
          this.advance();
        }

        orderBy.push({ column: colRef, direction });

        if (!this.match(TokenType.PUNCTUATION, ',')) break;
        this.advance();
      }
    }

    // LIMIT clause
    if (this.matchKeyword(['LIMIT'])) {
      this.advance();
      if (this.currentToken.type === TokenType.NUMBER) {
        limit = parseInt(this.currentToken.value, 10);
        this.advance();
      }
    }

    // OFFSET clause
    if (this.matchKeyword(['OFFSET'])) {
      this.advance();
      if (this.currentToken.type === TokenType.NUMBER) {
        offset = parseInt(this.currentToken.value, 10);
        this.advance();
      }
    }

    return {
      type: SqlStatementType.SELECT,
      tables,
      selectExpressions,
      whereConditions,
      joinClauses,
      groupBy,
      orderBy,
      limit,
      offset,
      distinct,
      rawSql
    };
  }

  private parseSelectExpression(): SelectExpression {
    const expr: SelectExpression = {
      expr: this.currentToken.value,
      alias: undefined,
      aggregation: undefined,
      distinct: false
    };

    // Handle aggregation functions
    const funcName = this.currentToken.value.toUpperCase();
    if (AGGREGATE_FUNCTIONS.has(funcName)) {
      expr.aggregation = this.getAggregationType(funcName);
      expr.expr = this.currentToken.value + '(';
      this.advance();

      // Handle DISTINCT in aggregate
      if (this.match(TokenType.KEYWORD, 'DISTINCT')) {
        expr.distinct = true;
        expr.expr += 'DISTINCT ';
        this.advance();
      }

      // Parse function arguments
      if (!this.match(TokenType.PUNCTUATION, '*') || funcName !== 'COUNT') {
        while (!this.match(TokenType.PUNCTUATION, ')')) {
          expr.expr += this.currentToken.value;
          this.advance();
        }
      } else {
        expr.expr += '*';
        this.advance();
      }

      expr.expr += ')';
      this.advance();
    } else {
      this.advance();

      // Parse expression until we hit a delimiter
      while (!this.isEnd() && !this.match(TokenType.PUNCTUATION, ',') &&
             !this.match(TokenType.PUNCTUATION, ')') && !this.matchKeyword(['FROM', 'WHERE', 'ORDER', 'GROUP'])) {
        expr.expr += ' ' + this.currentToken.value;
        this.advance();
      }
    }

    // Check for alias (AS keyword or direct identifier)
    if (this.match(TokenType.KEYWORD, 'AS')) {
      this.advance();
      if (this.currentToken.type === TokenType.IDENTIFIER) {
        expr.alias = this.currentToken.value;
        this.advance();
      }
    } else if (this.currentToken.type === TokenType.IDENTIFIER && 
               !this.isKeyword(this.currentToken.value) &&
               !this.matchKeyword(['FROM', 'WHERE', 'ORDER', 'GROUP', 'LIMIT'])) {
      expr.alias = this.currentToken.value;
      this.advance();
    }

    return expr;
  }

  private parseFromClause(tables: QueryTable[]): void {
    tables.push(this.parseTableReference());

    // Handle multiple tables (comma-separated)
    while (this.match(TokenType.PUNCTUATION, ',')) {
      this.advance();
      tables.push(this.parseTableReference());
    }

    // Handle subqueries
    while (this.match(TokenType.KEYWORD, 'JOIN') || this.matchKeyword(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'])) {
      this.parseJoinClause(tables, []);
    }
  }

  private parseTableReference(): QueryTable {
    const table: QueryTable = {
      name: this.currentToken.value,
      alias: undefined
    };

    this.advance();

    // Handle schema.table notation
    if (this.match(TokenType.PUNCTUATION, '.')) {
      const schema = table.name;
      this.advance();
      table.name = `${schema}.${this.currentToken.value}`;
      table.schema = schema;
      this.advance();
    }

    // Check for alias
    if (this.match(TokenType.KEYWORD, 'AS')) {
      this.advance();
    }

    if (this.currentToken.type === TokenType.IDENTIFIER && !this.isKeyword(this.currentToken.value)) {
      table.alias = this.currentToken.value;
      this.advance();
    }

    // Handle table hints (MySQL)
    if (this.match(TokenType.KEYWORD, 'USE') || this.match(TokenType.KEYWORD, 'IGNORE') || this.match(TokenType.KEYWORD, 'FORCE')) {
      while (!this.matchKeyword(['WHERE', 'ORDER', 'GROUP', 'LIMIT']) && !this.isEnd()) {
        this.advance();
      }
    }

    return table;
  }

  private parseJoinClause(tables: QueryTable[], joinClauses: JoinInfo[]): boolean {
    let joinType: JoinType = JoinType.INNER;
    let leftTable: QueryTable | undefined;
    let rightTable: QueryTable | undefined;
    const condition: WhereCondition[] = [];

    // Detect join type
    const keyword = this.currentToken.value.toUpperCase();

    switch (keyword) {
      case 'JOIN':
        this.advance();
        break;
      case 'INNER':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        break;
      case 'LEFT':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'OUTER')) this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        joinType = JoinType.LEFT;
        break;
      case 'RIGHT':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'OUTER')) this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        joinType = JoinType.RIGHT;
        break;
      case 'FULL':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'OUTER')) this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        joinType = JoinType.FULL;
        break;
      case 'CROSS':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        joinType = JoinType.CROSS;
        break;
      case 'NATURAL':
        this.advance();
        if (this.match(TokenType.KEYWORD, 'JOIN')) this.advance();
        joinType = JoinType.NATURAL;
        break;
      default:
        return false;
    }

    rightTable = this.parseTableReference();

    // Parse ON clause
    if (this.matchKeyword(['ON'])) {
      this.advance();
      this.parseJoinCondition(condition);
    } else if (this.matchKeyword(['USING'])) {
      this.advance();
      this.expect(TokenType.PUNCTUATION, '(');
      this.advance();
      // Parse USING columns
      while (!this.match(TokenType.PUNCTUATION, ')')) {
        this.advance();
      }
      this.advance();
    }

    // Get left table from the tables array if available
    leftTable = tables[tables.length - 1];

    if (rightTable) {
      tables.push(rightTable);
      joinClauses.push({
        type: joinType,
        leftTable: leftTable || { name: '' },
        rightTable,
        condition
      });
    }

    return true;
  }

  private parseJoinCondition(condition: WhereCondition[]): void {
    const leftCol = this.parseColumnRef();

    let operator = '';
    if (this.match(TokenType.COMPARISON, '=') || this.match(TokenType.COMPARISON, '<>') ||
        this.match(TokenType.COMPARISON, '!=') || this.match(TokenType.COMPARISON, '<')) {
      operator = this.currentToken.value;
      this.advance();
    }

    const rightCol = this.parseColumnRef();

    condition.push({
      column: leftCol,
      operator,
      value: rightCol,
      logicalOperator: undefined,
      negated: false,
      subquery: false
    });

    // Handle AND/OR
    while (this.match(TokenType.KEYWORD, 'AND') || this.match(TokenType.KEYWORD, 'OR')) {
      const logicalOp = this.currentToken.value.toUpperCase() as 'AND' | 'OR';
      this.advance();

      const nextLeftCol = this.parseColumnRef();
      this.advance(); // Skip operator
      const nextRightCol = this.parseColumnRef();

      condition.push({
        column: nextLeftCol,
        operator: '=',
        value: nextRightCol,
        logicalOperator: logicalOp,
        negated: false,
        subquery: false
      });
    }
  }

  private parseWhereClause(conditions: WhereCondition[]): void {
    conditions.push(this.parseCondition());

    while (this.match(TokenType.KEYWORD, 'AND') || this.match(TokenType.KEYWORD, 'OR')) {
      const logicalOp = this.currentToken.value.toUpperCase() as 'AND' | 'OR';
      this.advance();
      const nextCondition = this.parseCondition();
      nextCondition.logicalOperator = logicalOp;
      conditions.push(nextCondition);
    }
  }

  private parseCondition(): WhereCondition {
    const condition: WhereCondition = {
      column: { column: '' },
      operator: '=',
      value: null,
      negated: false
    };

    // Handle NOT
    if (this.match(TokenType.KEYWORD, 'NOT')) {
      condition.negated = true;
      this.advance();
    }

    // Handle subquery operators
    if (this.match(TokenType.KEYWORD, 'EXISTS') || this.match(TokenType.KEYWORD, 'IN') ||
        this.match(TokenType.KEYWORD, 'BETWEEN') || this.match(TokenType.KEYWORD, 'LIKE')) {
      return this.parseSpecialCondition(condition);
    }

    // Parse column reference
    condition.column = this.parseColumnRef();

    // Parse operator
    if (this.currentToken.type === TokenType.COMPARISON) {
      condition.operator = this.currentToken.value;
      this.advance();
    } else if (this.match(TokenType.KEYWORD, 'IS')) {
      this.advance();
      if (this.match(TokenType.KEYWORD, 'NOT')) {
        condition.negated = true;
        this.advance();
      }
      this.expect(TokenType.KEYWORD, 'NULL');
      condition.operator = 'IS';
      this.advance();
      return condition;
    }

    // Parse value
    if (this.match(TokenType.STRING)) {
      condition.value = this.currentToken.value;
      this.advance();
    } else if (this.match(TokenType.NUMBER)) {
      condition.value = parseFloat(this.currentToken.value);
      this.advance();
    } else if (this.currentToken.type === TokenType.IDENTIFIER) {
      condition.value = this.parseColumnRef();
      this.advance();
    } else if (this.match(TokenType.KEYWORD, 'NULL')) {
      condition.value = null;
      this.advance();
    } else if (this.match(TokenType.PUNCTUATION, '(')) {
      // Subquery
      condition.subquery = true;
      let parenCount = 1;
      let subquery = '(';
      this.advance();
      while (parenCount > 0 && !this.isEnd()) {
        if (this.currentToken.value === '(') parenCount++;
        if (this.currentToken.value === ')') parenCount--;
        subquery += ' ' + this.currentToken.value;
        this.advance();
      }
      condition.value = subquery;
    }

    return condition;
  }

  private parseSpecialCondition(condition: WhereCondition): WhereCondition {
    const keyword = this.currentToken.value.toUpperCase();
    this.advance();

    condition.column = { column: keyword };

    if (keyword === 'EXISTS' || keyword === 'IN') {
      if (this.match(TokenType.PUNCTUATION, '(')) {
        let parenCount = 0;
        let subquery = '';
        while (!this.isEnd()) {
          if (this.currentToken.value === '(') parenCount++;
          if (this.currentToken.value === ')') parenCount--;
          subquery += ' ' + this.currentToken.value;
          this.advance();
          if (parenCount === 0 && this.currentToken.value === ')') break;
        }
        condition.value = subquery;
        this.advance();
      }
    } else if (keyword === 'BETWEEN') {
      condition.operator = 'BETWEEN';
      // Parse BETWEEN value AND value
      // Simplified - just skip for now
    } else if (keyword === 'LIKE') {
      condition.operator = 'LIKE';
      if (this.match(TokenType.STRING)) {
        condition.value = this.currentToken.value;
        this.advance();
      }
    }

    return condition;
  }

  private parseColumnRef(): ColumnRef {
    const ref: ColumnRef = { column: '' };
    let table = '';

    if (this.match(TokenType.IDENTIFIER)) {
      if (this.match(TokenType.PUNCTUATION, '.')) {
        table = this.currentToken.value;
        this.advance();
        this.expect(TokenType.IDENTIFIER);
        ref.table = table;
        ref.column = this.currentToken.value;
        this.advance();
      } else {
        ref.column = this.currentToken.value;
        this.advance();
      }
    } else {
      ref.column = this.currentToken.value;
      this.advance();
    }

    return ref;
  }

  private parseInsert(): ParsedQuery {
    const rawSql = this.getRawSql();
    this.advance();

    const tables: QueryTable[] = [];

    if (this.matchKeyword(['INTO'])) {
      this.advance();
    }

    if (this.currentToken.type === TokenType.IDENTIFIER) {
      tables.push({ name: this.currentToken.value });
      this.advance();
    }

    // Parse column list and VALUES
    while (!this.isEnd() && !this.matchKeyword(['VALUES', 'SELECT'])) {
      this.advance();
    }

    return {
      type: SqlStatementType.INSERT,
      tables,
      selectExpressions: [],
      whereConditions: [],
      joinClauses: [],
      orderBy: [],
      rawSql
    };
  }

  private parseUpdate(): ParsedQuery {
    const rawSql = this.getRawSql();
    this.advance();

    const tables: QueryTable[] = [];
    const whereConditions: WhereCondition[] = [];

    if (this.currentToken.type === TokenType.IDENTIFIER) {
      tables.push({ name: this.currentToken.value });
      this.advance();
    }

    if (this.matchKeyword(['SET'])) {
      this.advance();
      // Skip SET clause content
      while (!this.isEnd() && !this.matchKeyword(['WHERE'])) {
        this.advance();
      }
    }

    if (this.matchKeyword(['WHERE'])) {
      this.advance();
      this.parseWhereClause(whereConditions);
    }

    return {
      type: SqlStatementType.UPDATE,
      tables,
      selectExpressions: [],
      whereConditions,
      joinClauses: [],
      orderBy: [],
      rawSql
    };
  }

  private parseDelete(): ParsedQuery {
    const rawSql = this.getRawSql();
    this.advance();

    const tables: QueryTable[] = [];
    const whereConditions: WhereCondition[] = [];

    if (this.matchKeyword(['FROM'])) {
      this.advance();
    }

    if (this.currentToken.type === TokenType.IDENTIFIER) {
      tables.push({ name: this.currentToken.value });
      this.advance();
    }

    if (this.matchKeyword(['WHERE'])) {
      this.advance();
      this.parseWhereClause(whereConditions);
    }

    return {
      type: SqlStatementType.DELETE,
      tables,
      selectExpressions: [],
      whereConditions,
      joinClauses: [],
      orderBy: [],
      rawSql
    };
  }

  private parseExplain(): ParsedQuery {
    this.advance();

    // Skip EXPLAIN keywords (ANALYZE, FORMAT, etc.)
    while (this.matchKeyword(['ANALYZE', 'FORMAT', 'COSTS', 'BUFFERS', 'VERBOSE', 'TIMING', 'SUMMARY'])) {
      this.advance();
    }

    // Parse the actual query
    return this.parse();
  }

  private parseUnknown(): ParsedQuery {
    return {
      type: SqlStatementType.UNKNOWN,
      tables: [],
      selectExpressions: [],
      whereConditions: [],
      joinClauses: [],
      orderBy: [],
      rawSql: this.getRawSql()
    };
  }

  private matchKeyword(keywords: string[]): boolean {
    return keywords.some(k => this.currentToken.value.toUpperCase() === k);
  }

  private isKeyword(value: string): boolean {
    return SQL_KEYWORDS.has(value.toUpperCase());
  }

  private isEnd(): boolean {
    return this.currentToken.type === TokenType.EOF;
  }

  private getAggregationType(funcName: string): AggregationType | undefined {
    const mapping: Record<string, AggregationType> = {
      'COUNT': AggregationType.COUNT,
      'SUM': AggregationType.SUM,
      'AVG': AggregationType.AVG,
      'MIN': AggregationType.MIN,
      'MAX': AggregationType.MAX,
      'COUNT_BIG': AggregationType.COUNT,
      'STRING_AGG': AggregationType.STRING_AGG,
      'ARRAY_AGG': AggregationType.ARRAY_AGG,
    };
    return mapping[funcName.toUpperCase()];
  }

  private getRawSql(): string {
    return this.sql || '';
  }

  private sql: string = '';
}

export class SqlParserFacade {
  /**
   * Parse a SQL query string into a structured ParsedQuery object
   */
  static parse(sql: string): ParsedQuery {
    const tokenizer = new SqlTokenizer(sql);
    const tokens = tokenizer.tokenize();
    const parser = new SqlParser(tokens);
    (parser as any).sql = sql;
    return parser.parse();
  }

  /**
   * Detect the SQL statement type without full parsing
   */
  static detectType(sql: string): SqlStatementType {
    const upperSql = sql.trim().toUpperCase();
    
    if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH')) {
      return SqlStatementType.SELECT;
    }
    if (upperSql.startsWith('INSERT')) {
      return SqlStatementType.INSERT;
    }
    if (upperSql.startsWith('UPDATE')) {
      return SqlStatementType.UPDATE;
    }
    if (upperSql.startsWith('DELETE')) {
      return SqlStatementType.DELETE;
    }
    if (upperSql.startsWith('CREATE TABLE')) {
      return SqlStatementType.CREATE_TABLE;
    }
    if (upperSql.startsWith('CREATE INDEX') || upperSql.startsWith('CREATE UNIQUE INDEX')) {
      return SqlStatementType.CREATE_INDEX;
    }
    if (upperSql.startsWith('DROP TABLE')) {
      return SqlStatementType.DROP_TABLE;
    }
    if (upperSql.startsWith('DROP INDEX')) {
      return SqlStatementType.DROP_INDEX;
    }
    if (upperSql.startsWith('ALTER TABLE')) {
      return SqlStatementType.ALTER_TABLE;
    }

    return SqlStatementType.UNKNOWN;
  }

  /**
   * Get query complexity score (0-100)
   */
  static getComplexityScore(sql: string): number {
    const parsed = this.parse(sql);
    let score = 0;

    // Base score by statement type
    switch (parsed.type) {
      case SqlStatementType.SELECT:
        score += 10;
        break;
      case SqlStatementType.INSERT:
      case SqlStatementType.UPDATE:
      case SqlStatementType.DELETE:
        score += 5;
        break;
      default:
        return 0;
    }

    // Joins
    score += parsed.joinClauses.length * 15;

    // Subqueries
    const subqueryCount = (sql.match(/\(SELECT|\(WITH/gi) || []).length;
    score += subqueryCount * 20;

    // Aggregations
    const hasGroupBy = parsed.groupBy !== undefined;
    score += hasGroupBy ? 10 : 0;

    // ORDER BY
    score += parsed.orderBy.length * 5;

    // LIMIT/OFFSET
    score += (parsed.limit ? 5 : 0) + (parsed.offset ? 5 : 0);

    // DISTINCT
    score += parsed.distinct ? 5 : 0;

    // LIKE patterns
    const likeCount = (sql.match(/LIKE|ILIKE/gi) || []).length;
    score += likeCount * 10;

    // OR conditions
    const orCount = (sql.match(/\bOR\b/gi) || []).length;
    score += orCount * 8;

    // Functions in WHERE
    const funcInWhere = (sql.match(/WHERE.*\(|AND.*\(/gi) || []).length;
    score += funcInWhere * 10;

    return Math.min(100, score);
  }
}

export default {
  SqlTokenizer,
  SqlParser,
  SqlParserFacade
};
