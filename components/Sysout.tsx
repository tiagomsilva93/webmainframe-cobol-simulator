
import React, { useMemo } from 'react';
import { Diagnostic } from '../compiler/types';

interface SysoutProps {
  logs: string[];
  diagnostics: Diagnostic[];
}

export const Sysout: React.FC<SysoutProps> = ({ logs, diagnostics }) => {
  
  // Sort diagnostics: Line -> Column -> Severity
  const sortedDiagnostics = useMemo(() => {
     return [...diagnostics].sort((a, b) => {
         if (a.line !== b.line) return a.line - b.line;
         if (a.column !== b.column) return a.column - b.column;
         return a.severity === 'ERROR' ? -1 : 1;
     });
  }, [diagnostics]);

  const getLineClass = (diag: Diagnostic) => {
    switch (diag.severity) {
        case 'ERROR': return 'text-red-500 font-bold';
        case 'WARNING': return 'text-yellow-500';
        case 'INFO': return 'text-gray-500';
        default: return 'text-white';
    }
  };

  const getSeverityChar = (severity: string) => {
      if (severity === 'ERROR') return 'S'; // Severe
      if (severity === 'WARNING') return 'W';
      return 'I';
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#101010]">
      <div className="bg-neutral-800 text-white px-2 py-1 text-xs border-b border-gray-700 font-bold flex justify-between shrink-0">
        <span>SDSF OUTPUT DISPLAY - JOB00152</span>
        <span>LINE 0 TO {logs.length + sortedDiagnostics.length} OF {logs.length + sortedDiagnostics.length}</span>
      </div>
      
      <div className="flex-1 p-4 font-mono overflow-scroll" style={{ fontFamily: "'VT323', monospace", fontSize: '1.2rem' }}>
        <div className="mb-4 text-white opacity-50 whitespace-pre-line text-cyan-400">
            JES2 JOB LOG -- SYSTEM CICS1 -- NODE LOCAL <br/>
            -------------------------------------------------<br/>
            IRR010I  USERID ADMIN   IS ASSIGNED TO THIS JOB.<br/>
            ICH70001I ADMIN    LAST ACCESS AT {new Date().toLocaleTimeString()} ON MVS<br/>
            $HASP373 JOB00152 STARTED - WLM INIT - CLASS A - SYS CICS1<br/>
            -------------------------------------------------<br/>
        </div>

        {/* Compile Diagnostics */}
        {sortedDiagnostics.length > 0 && (
            <div className="mb-4 border-b border-gray-700 pb-2">
                <div className="text-white font-bold mb-1">COMPILER DIAGNOSTICS:</div>
                {sortedDiagnostics.map((diag, i) => (
                    <div key={`diag-${i}`} className={`mb-1 whitespace-pre ${getLineClass(diag)}`}>
                        {diag.code}-{getSeverityChar(diag.severity)} LINE {diag.line}, COL {diag.column}: {diag.message}
                    </div>
                ))}
            </div>
        )}

        {/* Runtime Logs */}
        {logs.map((log, i) => (
            <div key={i} className="mb-1 whitespace-pre text-cyan-400">
                {log}
            </div>
        ))}
        
        <div className="mt-4 text-white opacity-50 text-cyan-400">
           ------ MAXCC={sortedDiagnostics.some(e => e.severity === 'ERROR') ? '0012' : (sortedDiagnostics.some(e => e.severity === 'WARNING') ? '0004' : '0000')} ------
        </div>
      </div>
    </div>
  );
};
