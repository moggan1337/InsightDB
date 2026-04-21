#!/usr/bin/env node

/**
 * InsightDB CLI
 * Command-line interface for the query optimizer
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import InsightDB, { DatabaseEngine } from './index';

const program = new Command();

program
  .name('insightdb')
  .description('Advanced Database Query Optimizer')
  .version('1.0.0')
  .option('-c, --connect <url>', 'Database connection string')
  .option('-d, --database <type>', 'Database type (postgresql, mysql, sqlite)')
  .option('--no-color', 'Disable colors');

/**
 * Analyze a query
 */
program
  .command('analyze <query>')
  .description('Analyze a SQL query for optimization opportunities')
  .option('-f, --format <format>', 'Output format (text, json, html)', 'text')
  .option('--no-index', 'Skip index recommendations')
  .option('--no-rewrite', 'Skip query rewrite suggestions')
  .option('--no-predict', 'Skip time prediction')
  .action(async (query: string, options: any) => {
    const spinner = ora('Analyzing query...').start();
    
    try {
      const insightdb = new InsightDB();
      const analysis = await insightdb.analyze(query);
      
      spinner.succeed('Analysis complete!');
      
      if (options.format === 'json') {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      // Text output
      console.log('\n' + chalk.bold('═══ QUERY ANALYSIS ═══') + '\n');
      
      // Score
      const scoreColor = analysis.score >= 80 ? 'green' : 
                         analysis.score >= 60 ? 'yellow' : 'red';
      console.log(chalk[scoreColor](`Score: ${analysis.score}/100`));
      console.log(chalk.gray(`Complexity: ${analysis.complexity}`));
      
      // Parsed query info
      console.log('\n' + chalk.bold('Query Structure:'));
      console.log(chalk.gray(`  Type: ${analysis.parsedQuery.type}`));
      console.log(chalk.gray(`  Tables: ${analysis.parsedQuery.tables.map(t => t.name).join(', ') || 'None'}`));
      console.log(chalk.gray(`  Joins: ${analysis.parsedQuery.joinClauses.length}`));
      console.log(chalk.gray(`  Conditions: ${analysis.parsedQuery.whereConditions.length}`));
      
      // Issues
      if (analysis.issues.length > 0) {
        console.log('\n' + chalk.bold('Issues:'));
        for (const issue of analysis.issues) {
          const icon = issue.severity === 'ERROR' ? '❌' : 
                       issue.severity === 'WARNING' ? '⚠️' : 'ℹ️';
          const color = issue.severity === 'ERROR' ? 'red' : 
                       issue.severity === 'WARNING' ? 'yellow' : 'cyan';
          console.log(`  ${icon} ${chalk[color](issue.code)}: ${issue.message}`);
          if (issue.suggestion) {
            console.log(chalk.gray(`     → ${issue.suggestion}`));
          }
        }
      }
      
      // Index recommendations
      if (analysis.indexRecommendations.length > 0) {
        console.log('\n' + chalk.bold('Index Recommendations:'));
        const table = new Table({
          head: ['Priority', 'Table', 'Columns', 'Type', 'Est. Improvement'],
          colWidths: [12, 15, 25, 10, 18]
        });
        
        for (const rec of analysis.indexRecommendations.slice(0, 10)) {
          table.push([
            rec.priority >= 90 ? '🔴 High' : rec.priority >= 70 ? '🟡 Med' : '🟢 Low',
            rec.tableName,
            rec.columns.join(', '),
            rec.indexType,
            `${rec.estimatedImprovement}%`
          ]);
        }
        console.log(table.toString());
      }
      
      // Rewrite suggestions
      if (analysis.rewriteSuggestions.length > 0) {
        console.log('\n' + chalk.bold('Rewrite Suggestions:'));
        for (const suggestion of analysis.rewriteSuggestions.slice(0, 5)) {
          const impactColor = suggestion.impact === 'HIGH' ? 'red' : 
                             suggestion.impact === 'MEDIUM' ? 'yellow' : 'gray';
          console.log(`\n  ${chalk.bold(suggestion.type)}`);
          console.log(chalk[impactColor](`  Impact: ${suggestion.impact}`));
          console.log(chalk.gray(`  Reason: ${suggestion.reason}`));
        }
      }
      
      // Time prediction
      if (analysis.timePrediction) {
        console.log('\n' + chalk.bold('Time Prediction:'));
        console.log(chalk.cyan(`  Estimated: ${analysis.timePrediction.estimatedTime} ${analysis.timePrediction.unit}`));
        console.log(chalk.gray(`  Confidence: ${analysis.timePrediction.confidence}%`));
        
        if (analysis.timePrediction.bottlenecks.length > 0) {
          console.log('\n  Bottlenecks:');
          for (const bottleneck of analysis.timePrediction.bottlenecks) {
            console.log(chalk.yellow(`    • ${bottleneck}`));
          }
        }
      }
      
      // Join optimization
      if (analysis.joinOrder) {
        console.log('\n' + chalk.bold('Join Order Optimization:'));
        console.log(chalk.gray(`  Optimal order: ${analysis.joinOrder.optimalOrder.map(t => t.name).join(' → ')}`));
        console.log(chalk.gray(`  Estimated cost: ${analysis.joinOrder.estimatedCost}`));
      }
      
      // Suggestions
      if (analysis.suggestions.length > 0) {
        console.log('\n' + chalk.bold('Recommendations:'));
        for (const suggestion of analysis.suggestions) {
          console.log(chalk.green(`  → ${suggestion}`));
        }
      }
      
      console.log('\n');
      
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

/**
 * Explain query plan
 */
program
  .command('explain <query>')
  .description('Get and display query execution plan')
  .option('-f, --format <format>', 'Output format (text, json, mermaid, html)', 'text')
  .option('--analyze', 'Run EXPLAIN ANALYZE', false)
  .action(async (query: string, options: any) => {
    if (!program.opts().connect) {
      console.error(chalk.red('Error: Database connection required. Use --connect option.'));
      process.exit(1);
    }
    
    const spinner = ora('Getting execution plan...').start();
    
    try {
      const insightdb = new InsightDB();
      await insightdb.connect(program.opts().connect);
      
      const plan = await insightdb.explain(query, options.analyze);
      
      if (!plan) {
        spinner.fail('Failed to get plan');
        process.exit(1);
      }
      
      spinner.succeed('Plan retrieved!');
      
      const output = insightdb.visualize(plan, options.format);
      console.log('\n' + output);
      
      // Highlight issues
      const issues = require('./visualization/plan-visualizer').PlanVisualizer.highlightIssues(plan);
      if (issues.length > 0) {
        console.log('\n' + chalk.bold('Issues Found:'));
        for (const issue of issues) {
          console.log(chalk.yellow(`  ${issue}`));
        }
      }
      
      await insightdb.disconnect();
      
    } catch (error) {
      spinner.fail('Failed to get plan');
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

/**
 * Analyze schema
 */
program
  .command('schema')
  .description('Analyze database schema')
  .option('-t, --table <name>', 'Analyze specific table')
  .action(async (options: any) => {
    if (!program.opts().connect) {
      console.error(chalk.red('Error: Database connection required. Use --connect option.'));
      process.exit(1);
    }
    
    const spinner = ora('Analyzing schema...').start();
    
    try {
      const insightdb = new InsightDB();
      await insightdb.connect(program.opts().connect);
      
      const analysis = insightdb.analyzeSchema();
      
      spinner.succeed('Schema analysis complete!');
      
      // Tables
      console.log('\n' + chalk.bold('═══ TABLES ═══'));
      const table = new Table({
        head: ['Name', 'Columns', 'Rows', 'Size'],
        colWidths: [25, 10, 15, 15]
      });
      
      for (const t of analysis.tables) {
        const size = t.sizeInBytes ? 
          (t.sizeInBytes / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown';
        table.push([
          t.name,
          t.columns.length,
          t.rowCount?.toLocaleString() || 'Unknown',
          size
        ]);
      }
      console.log(table.toString());
      
      // Relationships
      if (analysis.relationships.length > 0) {
        console.log('\n' + chalk.bold('═══ RELATIONSHIPS ═══'));
        const relTable = new Table({
          head: ['From', 'To', 'Type'],
          colWidths: [25, 25, 15]
        });
        
        for (const rel of analysis.relationships) {
          relTable.push([
            `${rel.fromTable}.${rel.fromColumn}`,
            `${rel.toTable}.${rel.toColumn}`,
            rel.type
          ]);
        }
        console.log(relTable.toString());
      }
      
      // Missing indexes
      if (analysis.missingIndexes.length > 0) {
        console.log('\n' + chalk.bold('═══ MISSING INDEXES ═══'));
        for (const idx of analysis.missingIndexes.slice(0, 10)) {
          console.log(`  ${chalk.cyan(idx.tableName)}.${idx.columns.join(', ')}`);
          console.log(chalk.gray(`    → ${idx.reason}`));
        }
      }
      
      // Redundancy
      if (analysis.redundancy.length > 0) {
        console.log('\n' + chalk.bold('═══ REDUNDANCY ISSUES ═══'));
        for (const red of analysis.redundancy) {
          console.log(chalk.yellow(`  ${red.type}:`));
          console.log(chalk.gray(`    ${red.description}`));
          console.log(chalk.green(`    → ${red.suggestion}`));
        }
      }
      
      // Normalization score
      const scoreColor = analysis.normalizationScore >= 80 ? 'green' : 
                         analysis.normalizationScore >= 60 ? 'yellow' : 'red';
      console.log(`\n${chalk.bold('Normalization Score:')} ${chalk[scoreColor](analysis.normalizationScore)}/100`);
      
      await insightdb.disconnect();
      
    } catch (error) {
      spinner.fail('Schema analysis failed');
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

/**
 * Generate index SQL
 */
program
  .command('gen-index')
  .description('Generate CREATE INDEX statements')
  .option('-t, --table <name>', 'Table name')
  .option('-c, --columns <cols>', 'Column names (comma-separated)')
  .option('-e, --engine <type>', 'Database engine (postgresql, mysql, sqlite)')
  .action(async (options: any) => {
    if (!options.table || !options.columns) {
      console.error(chalk.red('Error: --table and --columns are required'));
      process.exit(1);
    }
    
    const insightdb = new InsightDB();
    
    const recommendation = {
      tableName: options.table,
      columns: options.columns.split(',').map((c: string) => c.trim()),
      indexType: 'BTREE' as const,
      priority: 80,
      estimatedImprovement: 30,
      estimatedSize: 1000000
    };
    
    const engine = (options.engine as DatabaseEngine) || DatabaseEngine.POSTGRESQL;
    const sql = insightdb.generateIndexSQL(recommendation, engine);
    
    console.log('\n' + chalk.bold('Generated SQL:'));
    console.log(chalk.cyan(sql));
  });

/**
 * Interactive mode
 */
program
  .command('shell')
  .description('Start interactive query analysis shell')
  .action(async () => {
    console.log(chalk.bold('\n🔍 InsightDB Interactive Shell'));
    console.log(chalk.gray('Type "help" for commands, "exit" to quit\n'));
    
    if (!program.opts().connect) {
      console.log(chalk.yellow('⚠️  Not connected to database. Some features limited.'));
      console.log(chalk.gray('Use: insightdb shell --connect postgresql://...\n'));
    }
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const prompt = () => new Promise<string>(resolve => {
      rl.question('insightdb> ', resolve);
    });
    
    const insightdb = new InsightDB();
    
    if (program.opts().connect) {
      try {
        await insightdb.connect(program.opts().connect);
        console.log(chalk.green('✓ Connected to database\n'));
      } catch (error) {
        console.log(chalk.red(`✗ Connection failed: ${error}\n`));
      }
    }
    
    let running = true;
    while (running) {
      try {
        const input = await prompt();
        const trimmed = input.trim();
        
        if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
          running = false;
          if (insightdb) await insightdb.disconnect();
        } else if (trimmed === 'help') {
          console.log('\nCommands:');
          console.log('  analyze <query>  - Analyze a SQL query');
          console.log('  explain <query>  - Get execution plan');
          console.log('  schema           - Analyze schema');
          console.log('  help             - Show this help');
          console.log('  exit             - Exit shell\n');
        } else if (trimmed.length > 0) {
          try {
            const analysis = await insightdb.analyze(trimmed);
            console.log(chalk.green(`\n✓ Score: ${analysis.score}/100`));
            if (analysis.suggestions.length > 0) {
              console.log(chalk.cyan('Suggestions:'));
              analysis.suggestions.slice(0, 3).forEach((s: string) => {
                console.log(`  → ${s}`);
              });
            }
            console.log();
          } catch (error) {
            console.log(chalk.red(`\n✗ Error: ${error}\n`));
          }
        }
      } catch (e) {
        running = false;
      }
    }
    
    rl.close();
    console.log(chalk.gray('\nGoodbye!\n'));
  });

/**
 * Batch analyze from file
 */
program
  .command('batch <file>')
  .description('Analyze multiple queries from a file')
  .option('-o, --output <file>', 'Output file')
  .action(async (file: string, options: any) => {
    const fs = require('fs');
    
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`Error: File not found: ${file}`));
      process.exit(1);
    }
    
    const queries = fs.readFileSync(file, 'utf-8')
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));
    
    console.log(chalk.bold(`\n🔍 Batch Analysis: ${queries.length} queries\n`));
    
    const insightdb = new InsightDB();
    const results: any[] = [];
    
    for (let i = 0; i < queries.length; i++) {
      process.stdout.write(`[${i + 1}/${queries.length}] `);
      
      try {
        const analysis = await insightdb.analyze(queries[i]);
        results.push(analysis);
        
        const scoreColor = analysis.score >= 80 ? '32' : 
                           analysis.score >= 60 ? '33' : '31';
        console.log(`\x1b[${scoreColor}mScore: ${analysis.score}\x1b[0m`);
        
      } catch (error) {
        console.log(`\x1b[31mError\x1b[0m: ${error}`);
        results.push({ query: queries[i], error: String(error) });
      }
    }
    
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(chalk.green(`\n✓ Results saved to ${options.output}`));
    }
    
    // Summary
    const successful = results.filter((r: any) => !r.error);
    const avgScore = successful.reduce((sum: number, r: any) => sum + r.score, 0) / successful.length;
    
    console.log(chalk.bold('\n═══ SUMMARY ═══'));
    console.log(`Total: ${queries.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${results.length - successful.length}`);
    console.log(`Average Score: ${avgScore.toFixed(1)}`);
  });

program.parse(process.argv);
