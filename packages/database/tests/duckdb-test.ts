import { DuckDBInstance } from '@duckdb/node-api';

async function main() {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  
  await conn.run('CREATE TABLE test_olap (id INTEGER, value DOUBLE)');
  
  const stmt = await conn.prepare('INSERT INTO test_olap VALUES (?, ?)');
  stmt.bind([1, 100.5]);
  await stmt.run();
  
  const stmt2 = await conn.prepare('SELECT * FROM test_olap');
  const reader = await stmt2.runAndReadAll();
  console.log(reader.getRowObjects());
}
main();
