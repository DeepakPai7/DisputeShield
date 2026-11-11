import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getPayPalAccessToken } from './auth.js';
import { logger } from '../utils/logger.js';
import { recordPayPalApiLog } from '../db/database.js';

let mcpClientInstance = null;
let mcpTransportInstance = null;
let discoveredTools = [];
let lastMcpError = null;
let mcpConnectingPromise = null;

const IS_WINDOWS = process.platform === 'win32';
const NPX_CMD = IS_WINDOWS ? 'npx.cmd' : 'npx';

export async function getPayPalMcpClient(forceReconnect = false) {
  if (!forceReconnect && mcpClientInstance && discoveredTools.length > 0) {
    return { client: mcpClientInstance, tools: discoveredTools };
  }

  if (mcpConnectingPromise) {
    return mcpConnectingPromise;
  }

  mcpConnectingPromise = (async () => {
    const startTime = Date.now();
    try {
      if (mcpClientInstance) {
        try {
          await mcpClientInstance.close();
        } catch (e) {}
        mcpClientInstance = null;
        mcpTransportInstance = null;
      }

      logger.info('Acquiring OAuth token for PayPal MCP server...');
      const token = await getPayPalAccessToken();

      logger.info(`Spawning official PayPal MCP server via stdio: ${NPX_CMD} -y @paypal/mcp --tools=all`);
      mcpTransportInstance = new StdioClientTransport({
        command: NPX_CMD,
        args: ['-y', '@paypal/mcp', '--tools=all'],
        env: {
          ...process.env,
          PAYPAL_ACCESS_TOKEN: token,
          PAYPAL_ENVIRONMENT: 'SANDBOX'
        }
      });

      const client = new Client(
        { name: 'disputeshield-ai-mcp', version: '2.0.0' },
        { capabilities: {} }
      );

      await client.connect(mcpTransportInstance);
      logger.info('Connected to PayPal MCP server! Discovering tools via tools/list...');

      const toolsResult = await client.listTools();
      discoveredTools = toolsResult.tools || [];
      mcpClientInstance = client;
      lastMcpError = null;

      const durationMs = Date.now() - startTime;
      logger.info(`PayPal MCP server initialized successfully with ${discoveredTools.length} tools discovered in ${durationMs}ms.`);

      recordPayPalApiLog({
        kind: 'mcp',
        endpointOrTool: 'tools/list',
        httpStatus: 200,
        durationMs,
        details: { toolCount: discoveredTools.length, toolNames: discoveredTools.map(t => t.name) }
      });

      return { client: mcpClientInstance, tools: discoveredTools };
    } catch (err) {
      lastMcpError = err.message;
      const durationMs = Date.now() - startTime;
      logger.error('Failed to initialize PayPal MCP server:', { message: err.message });

      recordPayPalApiLog({
        kind: 'mcp',
        endpointOrTool: 'tools/list',
        httpStatus: 500,
        durationMs,
        details: { error: err.message }
      });

      throw err;
    } finally {
      mcpConnectingPromise = null;
    }
  })();

  return mcpConnectingPromise;
}

export async function callMcpTool(toolName, toolArgs = {}, disputeId = null) {
  const { client } = await getPayPalMcpClient();
  const startTime = Date.now();

  try {
    logger.info(`[MCP CALL] Invoking tool "${toolName}"...`, { args: toolArgs });
    const result = await client.callTool({
      name: toolName,
      arguments: toolArgs
    });

    const durationMs = Date.now() - startTime;
    let isError = result.isError;
    let parsedContent = null;

    if (result.content && Array.isArray(result.content)) {
      const textItem = result.content.find(c => c.type === 'text');
      if (textItem) {
        try {
          parsedContent = JSON.parse(textItem.text);
        } catch (e) {
          parsedContent = textItem.text;
        }
      }
    }

    recordPayPalApiLog({
      kind: 'mcp',
      endpointOrTool: `tool:${toolName}`,
      httpStatus: isError ? 400 : 200,
      durationMs,
      disputeId,
      details: {
        args: toolArgs,
        summary: typeof parsedContent === 'object' ? Object.keys(parsedContent || {}) : String(parsedContent).slice(0, 100)
      }
    });

    return {
      success: !isError,
      data: parsedContent || result,
      raw: result,
      durationMs
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error(`[MCP CALL FAILED] Tool "${toolName}":`, { message: err.message });

    recordPayPalApiLog({
      kind: 'mcp',
      endpointOrTool: `tool:${toolName}`,
      httpStatus: 500,
      durationMs,
      disputeId,
      details: { args: toolArgs, error: err.message }
    });

    throw err;
  }
}

export function getMcpStatus() {
  return {
    connected: Boolean(mcpClientInstance && discoveredTools.length > 0),
    toolCount: discoveredTools.length,
    tools: discoveredTools.map(t => t.name),
    lastError: lastMcpError
  };
}

export async function closeMcpClient() {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.close();
    } catch (e) {}
    mcpClientInstance = null;
    mcpTransportInstance = null;
    discoveredTools = [];
  }
}

export default { getPayPalMcpClient, callMcpTool, getMcpStatus, closeMcpClient };
