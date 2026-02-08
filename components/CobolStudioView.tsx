
import React from 'react';
import { IspfEditor } from './IspfEditor';
import { Sysout } from './Sysout';
import { Diagnostic } from '../compiler/types';
import { ValidationError } from '../compiler/validator';

interface CobolStudioViewProps {
    content: string;
    onChange: (val: string) => void;
    logs: string[];
    diagnostics: Diagnostic[];
    onRun: () => void;
    onExit: () => void;
}

export const CobolStudioView: React.FC<CobolStudioViewProps> = ({ 
    content, 
    onChange, 
    logs, 
    diagnostics, 
    onRun, 
    onExit 
}) => {
    // Map Compiler Diagnostics to ValidationErrors for Editor
    const editorErrors: ValidationError[] = diagnostics.map(d => ({
        line: d.line,
        column: d.column,
        code: d.code,
        message: d.message,
        severity: d.severity
    }));

    return (
        <div className="flex w-full h-full bg-black overflow-hidden">
            {/* Left Pane: Editor (Strict 65%) */}
            <div className="w-[65%] h-full border-r-4 border-gray-700 flex flex-col shrink-0 relative z-10">
                <IspfEditor 
                    content={content} 
                    onChange={onChange} 
                    onExit={onExit} 
                    onRun={onRun}
                    datasetName="'DUCK.COBOL(STUDIO)'"
                    diagnostics={editorErrors}
                />
                
                {/* Editor Footer Keys */}
                <div className="bg-neutral-900 text-cyan-300 p-1 text-lg flex justify-between px-4 font-bold border-t border-gray-700 shrink-0 select-none">
                    <div className="flex gap-4">
                        <span>F1=HELP</span>
                        <span>F2=SPLIT</span>
                        <span className="cursor-pointer hover:text-white" onClick={onExit}>F3=EXIT</span>
                    </div>
                    <div className="flex gap-4">
                         <span className="cursor-pointer hover:text-white text-yellow-400" onClick={onRun}>F5=RUN</span>
                         <span>F7=UP</span>
                         <span>F8=DOWN</span>
                    </div>
                </div>
            </div>

            {/* Right Pane: Output / Sysout (Remaining 35%) */}
            <div className="flex-1 h-full flex flex-col bg-[#101010] min-w-0">
                <Sysout logs={logs} diagnostics={diagnostics} />
            </div>
        </div>
    );
};
