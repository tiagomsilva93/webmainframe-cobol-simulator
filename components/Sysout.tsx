
import React from 'react';

interface SysoutProps {
  logs: string[];
  errors: string[];
}

export const Sysout: React.FC<SysoutProps> = ({ logs, errors }) => {
  
  const getLineClass = (text: string) => {
    // Errors: Red + Bold
    if (text.includes('-S ') || text.includes('ERROR:')) return 'text-red-500 font-bold';
    
    // Warnings: Yellow (Normal weight per requirement)
    if (text.includes('-W ')) return 'text-yellow-500';
    
    // Info: Gray (Normal weight)
    if (text.includes('-I ')) return 'text-gray-500';
    
    // Default log output (DISPLAY statements)
    return 'text-cyan-400';
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#101010]">
      <div className="bg-neutral-800 text-white px-2 py-1 text-xs border-b border-gray-700 font-bold flex justify-between shrink-0">
        <span>SDSF OUTPUT DISPLAY - JOB00152</span>
        <span>LINE 0 TO {logs.length + errors.length} OF {logs.length + errors.length}</span>
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

        {errors.map((err, i) => (
            <div key={`err-${i}`} className={`mb-1 whitespace-pre ${getLineClass(err)}`}>
                {err}
            </div>
        ))}

        {logs.map((log, i) => (
            <div key={i} className="mb-1 whitespace-pre text-cyan-400">
                {log}
            </div>
        ))}
        
        <div className="mt-4 text-white opacity-50 text-cyan-400">
           ------ MAXCC={errors.some(e => e.includes('-S') || e.includes('ERROR')) ? '0012' : (errors.some(e => e.includes('-W')) ? '0004' : '0000')} ------
        </div>
      </div>
    </div>
  );
};
