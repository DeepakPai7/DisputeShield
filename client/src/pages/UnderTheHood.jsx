import React, { useState, useEffect } from 'react';
import { getDiagnostics, getAuditLogs, getPayPalApiLogs } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { 
  CheckCircle2, XCircle, RefreshCw, Terminal, Lock, Activity, 
  Cpu, ShieldCheck, Box, ChevronDown, ChevronRight
} from 'lucide-react';

export default function UnderTheHood() {
  const { disputes } = useApp();
  const [activeTab, setActiveTab] = useState('connections'); // 'connections' | 'traces' | 'logs'
  const [diagnostics, setDiagnostics] = useState(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  const [refreshingDiag, setRefreshingDiag] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [paypalLogs, setPayPalLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState(null);

  const fetchDiagnostics = async (force = false) => {
    if (force) setRefreshingDiag(true);
    else setLoadingDiag(true);
    try {
      const data = await getDiagnostics(force);
      setDiagnostics(data);
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      setLoadingDiag(false);
      setRefreshingDiag(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const [auditRes, paypalRes] = await Promise.all([
        getAuditLogs(),
        getPayPalApiLogs(50)
      ]);
      setAuditLogs(auditRes.logs || []);
      setPayPalLogs(paypalRes || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics(false);
    fetchLogs();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Page Title & Intro */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Under the hood
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          For judges and developers: proof that this app really uses PayPal and Gemini.
        </p>
      </div>

      {/* 3 Simple Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('connections')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'connections'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Connections
        </button>
        <button
          onClick={() => setActiveTab('traces')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'traces'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          What the AI did
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'logs'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          PayPal activity log
        </button>
      </div>

      {/* TAB 1: Connections */}
      {activeTab === 'connections' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Service Status</h2>
              <p className="text-xs text-slate-500">Live checks across PayPal Sandbox and Google Gemini</p>
            </div>
            <button
              onClick={() => fetchDiagnostics(true)}
              disabled={refreshingDiag}
              className="px-3.5 py-1.5 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingDiag ? 'animate-spin' : ''}`} />
              <span>{refreshingDiag ? 'Testing...' : 'Run test again'}</span>
            </button>
          </div>

          {loadingDiag && !diagnostics ? (
            <p className="text-xs text-slate-400 py-4">Checking connection health...</p>
          ) : diagnostics ? (
            <div className="space-y-3 divide-y divide-slate-100">
              {/* Row 1: PayPal Login */}
              <div className="flex items-center justify-between pt-3 first:pt-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    diagnostics.paypalOAuth.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">PayPal Login (OAuth2)</h3>
                    <p className="text-xs text-slate-500">
                      Sandbox Client ID: {diagnostics.paypalOAuth.clientIdMasked} • Token expires in {diagnostics.paypalOAuth.expiresInSeconds}s
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {diagnostics.paypalOAuth.status === 'ok' ? 'Working' : 'Error'}
                </span>
              </div>

              {/* Row 2: PayPal Tools */}
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    diagnostics.paypalMcp.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Official PayPal Tools (@paypal/mcp)</h3>
                    <p className="text-xs text-slate-500">
                      {diagnostics.paypalMcp.toolCount} tools connected over local standard process
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {diagnostics.paypalMcp.toolCount} tools ready
                </span>
              </div>

              {/* Row 3: Gemini Model */}
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    diagnostics.geminiAi.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Google Gemini AI</h3>
                    <p className="text-xs text-slate-500">
                      Active model: {diagnostics.geminiAi.modelId} • Response speed: {diagnostics.geminiAi.testPromptLatencyMs}ms
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {diagnostics.geminiAi.status === 'ok' ? 'Verified' : 'Error'}
                </span>
              </div>

              {/* Row 4: Disputes Found */}
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">PayPal Disputes Check</h3>
                    <p className="text-xs text-slate-500">
                      Real-time queries to PayPal Customer Disputes v1 API
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-600">
                  {diagnostics.paypalDisputesApi.disputeCount} active in sandbox
                </span>
              </div>

              {/* Row 5: Channel3 Product Graph */}
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    diagnostics.channel3?.status === 'ok' ? 'bg-emerald-500' : (diagnostics.channel3?.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500')
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Channel3 Product Graph API</h3>
                    <p className="text-xs text-slate-500">
                      {diagnostics.channel3?.configured 
                        ? `Live catalog search (${diagnostics.channel3.productsFound} items in ${diagnostics.channel3.latencyMs}ms) • Key: ${diagnostics.channel3.keyMasked}` 
                        : (diagnostics.channel3?.error || 'Channel3 key not configured (using practice products)')}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold ${
                  diagnostics.channel3?.status === 'ok' ? 'text-emerald-700' : (diagnostics.channel3?.status === 'warning' ? 'text-amber-700' : 'text-rose-700')
                }`}>
                  {diagnostics.channel3?.status === 'ok' ? 'Connected' : (diagnostics.channel3?.status === 'warning' ? 'Practice Mode' : 'Error')}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-rose-500">Failed to load connection status.</p>
          )}
        </div>
      )}

      {/* TAB 2: What the AI did (Agent Traces) */}
      {activeTab === 'traces' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">AI Lookups by Dispute</h2>
            <p className="text-xs text-slate-500">
              Exact tools and seller records queried by Gemini during evaluation
            </p>
          </div>

          {disputes.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No disputes evaluated yet. Open a dispute in "Try it" to see the AI agent loop trace.
            </p>
          ) : (
            <div className="space-y-3">
              {disputes.map((d) => {
                const trace = d.latest_analysis?.agent_trace || [];
                const isExpanded = expandedTraceId === d.id;

                return (
                  <div key={d.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedTraceId(isExpanded ? null : d.id)}
                    >
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">
                          Claim #{d.paypal_dispute_id} ({d.item_title || 'Purchase'})
                        </h3>
                        <p className="text-xs text-slate-500">
                          {trace.length} tools checked • Model: {d.agent_model || 'gemini-3.5-flash'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#003087]">
                          {isExpanded ? 'Hide calls' : 'Show calls'}
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 font-mono text-xs">
                        {trace.length === 0 ? (
                          <p className="text-slate-400 text-[11px] font-sans">No tool calls recorded for this dispute.</p>
                        ) : (
                          trace.map((call, idx) => {
                            const isMcp = call.tool?.includes('_') || call.toolName?.includes('_');
                            return (
                              <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">
                                      {call.tool || call.toolName}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                      isMcp ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-[#003087]'
                                    }`}>
                                      {isMcp ? 'PayPal MCP' : 'Seller Records'}
                                    </span>
                                  </div>
                                  {call.resultSummary && (
                                    <p className="text-[11px] text-slate-500 font-sans">
                                      {call.resultSummary}
                                    </p>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400">
                                  {call.durationMs || call.duration_ms || 0}ms
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PayPal Activity Log & Audit Trail */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-xs">
          {/* Cryptographic hash chain note */}
          <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between text-xs text-[#003087]">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                <strong>Audit protection:</strong> Every action is protected with a SHA-256 hash chain linking to the prior record.
              </span>
            </div>
            <span className="font-mono text-[10px] font-bold">SHA-256</span>
          </div>

          {/* Raw PayPal API Logs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Raw API Activity Log - PayPal & Channel3 ({paypalLogs.length})
              </h2>
              <span className="text-xs text-slate-400">Live recorded in SQLite</span>
            </div>

            {loadingLogs ? (
              <p className="text-xs text-slate-400 py-3">Loading logs...</p>
            ) : paypalLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No API calls recorded yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Call</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paypalLogs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.kind === 'channel3' 
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : log.kind === 'mcp' 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-blue-100 text-[#003087]'
                          }`}>
                            {log.kind.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 truncate max-w-xs">
                          {log.endpoint_or_tool}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-bold ${
                            log.http_status >= 200 && log.http_status < 300 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {log.http_status || '200'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {log.duration_ms}ms
                        </td>
                        <td className="py-2 px-3 text-slate-400">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

