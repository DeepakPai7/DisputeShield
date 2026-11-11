import { runDiagnostics } from '../src/services/diagnosticsService.js';
import { maskSecret } from '../src/config.js';

async function main() {
  console.log('\n======================================================');
  console.log('   DISPUTESHIELD AI - INTEGRATION DIAGNOSTICS');
  console.log('======================================================\n');

  try {
    const diag = await runDiagnostics(true);

    // 1. Environment & Config
    console.log('[1] Environment Configuration:');
    if (diag.environment.isSetupRequired) {
      console.log('    ❌ SETUP REQUIRED - Missing variables:');
      for (const m of diag.environment.missingVariables) {
        console.log(`       - ${m.key}: ${m.description} (${m.source})`);
      }
    } else {
      console.log('    ✅ All required environment variables configured.');
      console.log(`    ✅ Target API: ${diag.environment.apiBase} (Verified Sandbox)`);
    }

    // 2. PayPal OAuth2
    console.log('\n[2] PayPal Sandbox OAuth2:');
    if (diag.paypalOAuth.status === 'ok') {
      console.log(`    ✅ Authenticated (Client ID: ${diag.paypalOAuth.clientIdMasked})`);
      console.log(`    ✅ Token validity: ${diag.paypalOAuth.expiresInSeconds}s remaining`);
    } else {
      console.log(`    ❌ Failed: ${diag.paypalOAuth.error}`);
    }

    // 3. PayPal MCP Server
    console.log('\n[3] PayPal MCP Server (@paypal/mcp via stdio):');
    if (diag.paypalMcp.status === 'ok') {
      console.log(`    ✅ Connected over stdio transport`);
      console.log(`    ✅ Discovered ${diag.paypalMcp.toolCount} Agent Toolkit tools:`);
      const sample = diag.paypalMcp.tools.slice(0, 10).join(', ');
      console.log(`       [${sample}, ... +${diag.paypalMcp.toolCount - 10} more]`);
    } else {
      console.log(`    ❌ Failed: ${diag.paypalMcp.error}`);
    }

    // 4. PayPal Sandbox Disputes API
    console.log('\n[4] PayPal Sandbox Disputes API:');
    if (diag.paypalDisputesApi.status === 'ok') {
      console.log(`    ✅ Successfully queried GET /v1/customer/disputes`);
      console.log(`    ✅ Active sandbox disputes awaiting seller response: ${diag.paypalDisputesApi.disputeCount}`);
    } else {
      console.log(`    ❌ Failed: ${diag.paypalDisputesApi.error}`);
    }

    // 5. Google Gemini AI Model
    console.log('\n[5] Google Gemini AI Model & Function Calling:');
    if (diag.geminiAi.status === 'ok') {
      console.log(`    ✅ Model Verified: ${diag.geminiAi.modelId}`);
      console.log(`    ✅ Test prompt latency: ${diag.geminiAi.testPromptLatencyMs}ms`);
    } else {
      console.log(`    ❌ Failed: ${diag.geminiAi.error}`);
    }

    // 6. Database Truth
    console.log('\n[6] Database Truth (Disputes by Source):');
    if (diag.database.status === 'ok') {
      console.log(`    ✅ Total Disputes in DB: ${diag.database.totalDisputes}`);
      console.log(`    ✅ Breakdown by source:`, diag.database.disputesBySource);
      console.log(`    ✅ Total Storefront Orders: ${diag.database.totalOrders}`);
    } else {
      console.log(`    ❌ Failed: ${diag.database.error}`);
    }

    // 7. Channel3 Product Graph API
    console.log('\n[7] Channel3 Product Graph API:');
    if (diag.channel3?.status === 'ok') {
      console.log(`    ✅ Authenticated (Key: ${diag.channel3.keyMasked})`);
      console.log(`    ✅ Live product search verified (${diag.channel3.productsFound} items found in ${diag.channel3.latencyMs}ms)`);
    } else if (diag.channel3?.status === 'warning') {
      console.log(`    ⚠️  Not configured (${diag.channel3.error})`);
    } else {
      console.log(`    ❌ Failed: ${diag.channel3?.error || 'Unknown error'}`);
    }

    console.log('\n======================================================');
    if (diag.overallStatus === 'healthy') {
      console.log('   RESULT: ALL SYSTEMS OPERATIONAL (HACKATHON VERIFIED)   ');
    } else {
      console.log('   RESULT: SOME SYSTEMS DEGRADED - REVIEW ERRORS ABOVE    ');
    }
    console.log('======================================================\n');

    process.exit(diag.overallStatus === 'healthy' ? 0 : 1);
  } catch (err) {
    console.error('\nFatal Diagnostics Error:', err);
    process.exit(1);
  }
}

main();

