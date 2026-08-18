/**
 * win-shell-mcp 入口：启动 stdio MCP Server。
 *
 * shebang 由 tsup banner 注入（#!/usr/bin/env node）。
 */

import { startStdioServer } from './server.js';

startStdioServer().catch((err) => {
  console.error('Fatal: failed to start win-shell-mcp server:', err);
  process.exit(1);
});