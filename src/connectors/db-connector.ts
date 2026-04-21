/**
 * Database Connectors
 * Connect to PostgreSQL, MySQL, and SQLite databases
 */

import { DatabaseEngine, DbConnectionConfig, TableInfo, ColumnInfo, IndexInfo, DataType } from '../types';

// Dynamic imports to handle optional dependencies
let pg: any;
let mysql: any;
let sqlite: any;

export class DatabaseConnector {
  private config: DbConnectionConfig;
  private connection: any;

  constructor(config: DbConnectionConfig) {
    this.config = config;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        await this.connectPostgreSQL();
        break;
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        await this.connectMySQL();
        break;
      case DatabaseEngine.SQLITE:
        await this.connectSQLite();
        break;
      default:
        throw new Error(`Unsupported database engine: ${this.config.engine}`);
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      switch (this.config.engine) {
        case DatabaseEngine.POSTGRESQL:
          await this.connection.end();
          break;
        case DatabaseEngine.MYSQL:
        case DatabaseEngine.MARIADB:
          await this.connection.end();
          break;
        case DatabaseEngine.SQLITE:
          this.connection.close();
          break;
      }
      this.connection = null;
    }
  }

  private async connectPostgreSQL(): Promise<void> {
    try {
      const { default: pgModule } = await import('pg');
      pg = pgModule;
      const { Client } = pg;
      
      this.connection = new Client({
        host: this.config.host || 'localhost',
        port: this.config.port || 5432,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined
      });
      
      await this.connection.connect();
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL: ${error}`);
    }
  }

  private async connectMySQL(): Promise<void> {
    try {
      const mysqlModule = await import('mysql2/promise');
      mysql = mysqlModule;
      
      this.connection = await mysql.createConnection({
        host: this.config.host || 'localhost',
        port: this.config.port || 3306,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? {} : undefined
      });
    } catch (error) {
      throw new Error(`Failed to connect to MySQL: ${error}`);
    }
  }

  private async connectSQLite(): Promise<void> {
    try {
      const Database = (await import('better-sqlite3')).default;
      this.connection = new Database(this.config.database);
    } catch (error) {
      throw new Error(`Failed to connect to SQLite: ${error}`);
    }
  }

  /**
   * Execute a query
   */
  async query(sql: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        const pgResult = await this.connection.query(sql);
        return pgResult.rows;
        
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        const [rows] = await this.connection.execute(sql);
        return rows;
        
      case DatabaseEngine.SQLITE:
        const stmt = this.connection.prepare(sql);
        return stmt.all();
        
      default:
        throw new Error(`Unsupported database engine: ${this.config.engine}`);
    }
  }

  /**
   * Get EXPLAIN ANALYZE output
   */
  async explainAnalyze(sql: string): Promise<string> {
    let explainSql: string;
    
    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        explainSql = `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${sql}`;
        const pgResult = await this.query(explainSql);
        return JSON.stringify(pgResult[0] || pgResult, null, 2);
        
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        explainSql = `EXPLAIN ANALYZE ${sql}`;
        const [mysqlResult] = await this.connection.execute(explainSql);
        return this.formatMySQLExplain(mysqlResult);
        
      case DatabaseEngine.SQLITE:
        explainSql = `EXPLAIN QUERY PLAN ${sql}`;
        const sqliteResult = await this.query(explainSql);
        return this.formatSQLiteExplain(sqliteResult);
        
      default:
        throw new Error(`Unsupported database engine: ${this.config.engine}`);
    }
  }

  private formatMySQLExplain(rows: any[]): string {
    if (!rows || rows.length === 0) return '';
    
    const headers = Object.keys(rows[0]);
    const headerLine = '+' + headers.map(h => '-'.repeat(h.length + 2)).join('+') + '+';
    const headerRow = '| ' + headers.map(h => h.padEnd(h.length)).join(' | ') + ' |';
    
    const dataRows = rows.map(row => {
      return '| ' + headers.map(h => String(row[h] || '').padEnd(h.length)).join(' | ') + ' |';
    });
    
    return [headerLine, headerRow, headerLine, ...dataRows, headerLine].join('\n');
  }

  private formatSQLiteExplain(rows: any[]): string {
    return rows.map(row => {
      const parts = [];
      for (const [key, value] of Object.entries(row)) {
        parts.push(`${key}: ${value}`);
      }
      return parts.join(', ');
    }).join('\n');
  }

  /**
   * Get table information
   */
  async getTables(): Promise<TableInfo[]> {
    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        return this.getPostgreSQLTables();
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        return this.getMySQLTables();
      case DatabaseEngine.SQLITE:
        return this.getSQLiteTables();
      default:
        return [];
    }
  }

  private async getPostgreSQLTables(): Promise<TableInfo[]> {
    const sql = `
      SELECT 
        t.table_name,
        c.reltuples::bigint as row_count,
        pg_total_relation_size(t.table_schema || '.' || t.table_name)::bigint as size_bytes
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      JOIN pg_namespace n ON n.nspname = t.table_schema
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
    `;
    
    const rows = await this.query(sql);
    
    const tables: TableInfo[] = [];
    for (const row of rows) {
      const columns = await this.getPostgreSQLColumns(row.table_name);
      tables.push({
        name: row.table_name,
        columns,
        rowCount: row.row_count,
        sizeInBytes: row.size_bytes
      });
    }
    
    return tables;
  }

  private async getPostgreSQLColumns(tableName: string): Promise<ColumnInfo[]> {
    const sql = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        COALESCE(tc.constraint_type = 'PRIMARY KEY', false) as is_primary_key,
        COALESCE(ccu.constraint_name IS NOT NULL, false) as is_foreign_key,
        ccu.column_name as foreign_key_column,
        ccu.table_name as foreign_key_table
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_name = kcu.table_name 
        AND c.column_name = kcu.column_name
        AND c.table_schema = kcu.table_schema
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
        AND tc.constraint_type = 'PRIMARY KEY'
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `;
    
    const rows = await this.query(sql.replace('$1', `'${tableName}'`));
    
    return rows.map((row: any) => ({
      name: row.column_name,
      dataType: this.mapDataType(row.data_type),
      isNullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      isUnique: false,
      isIndexed: false,
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
      foreignKeyRef: row.is_foreign_key ? {
        table: row.foreign_key_table,
        column: row.foreign_key_column
      } : undefined
    }));
  }

  private async getMySQLTables(): Promise<TableInfo[]> {
    const sql = `SHOW TABLE STATUS`;
    const rows = await this.query(sql);
    
    const tables: TableInfo[] = [];
    for (const row of rows) {
      const columns = await this.getMySQLColumns(row.Name);
      tables.push({
        name: row.Name,
        columns,
        rowCount: row.Rows,
        sizeInBytes: row.Data_length + row.Index_length
      });
    }
    
    return tables;
  }

  private async getMySQLColumns(tableName: string): Promise<ColumnInfo[]> {
    const sql = `SHOW FULL COLUMNS FROM \`${tableName}\``;
    const rows = await this.query(sql);
    
    return rows.map((row: any) => ({
      name: row.Field,
      dataType: this.mapDataType(row.Type),
      isNullable: row.Null === 'YES',
      isPrimaryKey: row.Key === 'PRI',
      isForeignKey: row.Key === 'MUL' || row.Key === 'UNI',
      isUnique: row.Key === 'UNI',
      isIndexed: row.Key !== '',
      defaultValue: row.Default,
      maxLength: this.extractTypeLength(row.Type),
      foreignKeyRef: undefined
    }));
  }

  private async getSQLiteTables(): Promise<TableInfo[]> {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
    const rows = await this.query(sql);
    
    const tables: TableInfo[] = [];
    for (const row of rows) {
      const columns = await this.getSQLiteColumns(row.name);
      tables.push({
        name: row.name,
        columns,
        rowCount: undefined,
        sizeInBytes: undefined
      });
    }
    
    return tables;
  }

  private async getSQLiteColumns(tableName: string): Promise<ColumnInfo[]> {
    const sql = `PRAGMA table_info(\`${tableName}\`)`;
    const rows = await this.query(sql);
    
    return rows.map((row: any) => ({
      name: row.name,
      dataType: this.mapDataType(row.type),
      isNullable: row.notnull === 0,
      isPrimaryKey: row.pk === 1,
      isForeignKey: false,
      isUnique: row.pk === 1,
      isIndexed: false,
      defaultValue: row.dflt_value
    }));
  }

  /**
   * Get index information
   */
  async getIndexes(): Promise<IndexInfo[]> {
    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        return this.getPostgreSQLIndexes();
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        return this.getMySQLIndexes();
      case DatabaseEngine.SQLITE:
        return this.getSQLiteIndexes();
      default:
        return [];
    }
  }

  private async getPostgreSQLIndexes(): Promise<IndexInfo[]> {
    const sql = `
      SELECT 
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    
    const rows = await this.query(sql);
    
    return rows.map((row: any) => {
      const columns = this.extractIndexColumns(row.indexdef);
      return {
        name: row.indexname,
        tableName: row.tablename,
        columns,
        type: this.extractIndexType(row.indexdef),
        isUnique: row.indexdef.includes('UNIQUE'),
        isPrimary: row.indexname.includes('pkey'),
        isPartial: row.indexdef.includes('WHERE'),
        usageCount: 0
      };
    });
  }

  private async getMySQLIndexes(): Promise<IndexInfo[]> {
    const sql = `SHOW INDEX FROM`;
    const tables = await this.getTables();
    const indexes: IndexInfo[] = [];
    
    for (const table of tables) {
      const indexSql = `SHOW INDEX FROM \`${table.name}\``;
      const rows = await this.query(indexSql);
      
      const indexMap = new Map<string, IndexInfo>();
      for (const row of rows) {
        if (!indexMap.has(row.Key_name)) {
          indexMap.set(row.Key_name, {
            name: row.Key_name,
            tableName: table.name,
            columns: [],
            type: row.Non_unique === 0 ? 'UNIQUE' as const : 'BTREE' as const,
            isUnique: row.Non_unique === 0,
            isPrimary: row.Key_name === 'PRIMARY',
            isPartial: false,
            usageCount: 0
          });
        }
        indexMap.get(row.Key_name)!.columns.push(row.Column_name);
      }
      
      indexes.push(...Array.from(indexMap.values()));
    }
    
    return indexes;
  }

  private async getSQLiteIndexes(): Promise<IndexInfo[]> {
    const sql = `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`;
    const rows = await this.query(sql);
    
    return rows.map((row: any) => ({
      name: row.name,
      tableName: row.tbl_name,
      columns: this.extractSQLiteIndexColumns(row.sql),
      type: 'BTREE' as const,
      isUnique: row.sql.includes('UNIQUE'),
      isPrimary: row.name.includes('sqlite_autoindex'),
      isPartial: row.sql.includes('WHERE'),
      usageCount: 0
    }));
  }

  private extractIndexColumns(indexdef: string): string[] {
    const match = indexdef.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(',').map(c => c.trim().replace(/"/g, ''));
  }

  private extractSQLiteIndexColumns(sql: string): string[] {
    const match = sql.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(',').map(c => c.trim().replace(/[`"]/g, ''));
  }

  private extractIndexType(indexdef: string): string {
    if (indexdef.includes('USING GIN')) return 'GIN';
    if (indexdef.includes('USING GIST')) return 'GIST';
    if (indexdef.includes('USING HASH')) return 'HASH';
    if (indexdef.includes('USING BRIN')) return 'BRIN';
    return 'BTREE';
  }

  private extractTypeLength(type: string): number | undefined {
    const match = type.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private mapDataType(dbType: string): DataType {
    const upperType = dbType.toUpperCase();
    
    if (upperType.includes('INT')) return DataType.INTEGER;
    if (upperType.includes('BIGINT')) return DataType.BIGINT;
    if (upperType.includes('SMALLINT')) return DataType.SMALLINT;
    if (upperType.includes('VARCHAR') || upperType.includes('CHAR')) return DataType.VARCHAR;
    if (upperType.includes('TEXT') || upperType.includes('BLOB')) return DataType.TEXT;
    if (upperType.includes('BOOL')) return DataType.BOOLEAN;
    if (upperType.includes('DATE')) return DataType.DATE;
    if (upperType.includes('TIMESTAMP') || upperType.includes('DATETIME')) return DataType.TIMESTAMP;
    if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC')) return DataType.DECIMAL;
    if (upperType.includes('FLOAT')) return DataType.FLOAT;
    if (upperType.includes('DOUBLE')) return DataType.DOUBLE;
    if (upperType.includes('JSON')) return DataType.JSON;
    if (upperType.includes('UUID')) return DataType.UUID;
    if (upperType.includes('ARRAY')) return DataType.ARRAY;
    
    return DataType.UNKNOWN;
  }

  /**
   * Get table statistics
   */
  async getTableStats(tableName: string): Promise<any> {
    switch (this.config.engine) {
      case DatabaseEngine.POSTGRESQL:
        const pgStats = await this.query(`
          SELECT 
            reltuples::bigint as row_count,
            relpages * 8192 as table_size,
            idx_relpages * 8192 as index_size
          FROM pg_class
          WHERE relname = '${tableName}'
        `);
        return pgStats[0] || {};
        
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB:
        const [mysqlStats] = await this.connection.execute(
          `SHOW TABLE STATUS LIKE '${tableName}'`
        );
        return mysqlStats[0] || {};
        
      case DatabaseEngine.SQLITE:
        const sqliteStats = await this.query(`
          SELECT 
            COUNT(*) as row_count
          FROM ${tableName}
        `);
        return sqliteStats[0] || {};
        
      default:
        return {};
    }
  }
}

/**
 * Connection string parser
 */
export function parseConnectionString(
  connectionString: string
): DbConnectionConfig {
  // Format: postgresql://user:pass@host:port/database
  // Format: mysql://user:pass@host:port/database
  // Format: sqlite:///path/to/database.db
  
  const url = new URL(connectionString);
  const protocol = url.protocol.replace(':', '');
  
  let engine: DatabaseEngine;
  switch (protocol) {
    case 'postgresql':
      engine = DatabaseEngine.POSTGRESQL;
      break;
    case 'mysql':
    case 'mysql2':
      engine = DatabaseEngine.MYSQL;
      break;
    case 'sqlite':
      engine = DatabaseEngine.SQLITE;
      break;
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }

  return {
    engine,
    host: url.hostname || undefined,
    port: url.port ? parseInt(url.port, 10) : undefined,
    database: url.pathname.slice(1) || url.hostname, // SQLite uses path
    username: url.username || undefined,
    password: url.password || undefined,
    ssl: protocol === 'postgresql'
  };
}

export default DatabaseConnector;
