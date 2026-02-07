
import React, { useState, useEffect, useRef } from 'react';

interface IspfEditorProps {
    initialContent: string;
    onSave: (content: string) => void;
    onExit: () => void;
    datasetName: string;
}

interface LineState {
    cmd: string;
    content: string;
}

export const IspfEditor: React.FC<IspfEditorProps> = ({ initialContent, onSave, onExit, datasetName }) => {
    const [lines, setLines] = useState<LineState[]>([]);
    const [message, setMessage] = useState("COMMAND ===>");
    const [commandLine, setCommandLine] = useState("");
    
    // History for Undo (Basic)
    const historyRef = useRef<LineState[][]>([]);

    useEffect(() => {
        const raw = initialContent.split('\n');
        setLines(raw.map(l => ({ cmd: '', content: l })));
        historyRef.current = [raw.map(l => ({ cmd: '', content: l }))];
    }, [initialContent]);

    const saveHistory = (newLines: LineState[]) => {
        historyRef.current.push(newLines);
        if (historyRef.current.length > 20) historyRef.current.shift();
    };

    const executeLineCommand = (index: number, cmd: string, params: string) => {
        const newLines = [...lines];
        const cmdUpper = cmd.toUpperCase();
        
        // I - Insert
        if (cmdUpper.startsWith('I')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            for(let i=0; i<count; i++) {
                newLines.splice(index + 1, 0, { cmd: '', content: '' });
            }
            newLines[index].cmd = '';
        }
        // D - Delete
        else if (cmdUpper.startsWith('D')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            newLines.splice(index, count);
        }
        // R - Repeat
        else if (cmdUpper.startsWith('R')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            const lineToCopy = newLines[index];
            for(let i=0; i<count; i++) {
                newLines.splice(index + 1, 0, { ...lineToCopy, cmd: '' });
            }
            newLines[index].cmd = '';
        }
        else {
            setMessage(`INVALID COMMAND: ${cmd}`);
            return;
        }

        saveHistory(newLines);
        setLines(newLines);
        setMessage("COMMAND PROCESSED");
    };

    const handleLineCmdKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = lines[index].cmd.trim();
            if (cmd) {
                executeLineCommand(index, cmd, '');
            }
        }
    };

    const handleContentChange = (index: number, val: string) => {
        const newLines = [...lines];
        newLines[index].content = val;
        setLines(newLines);
    };

    const handleMainCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = commandLine.trim().toUpperCase();
        if (cmd === 'SAVE') {
            onSave(lines.map(l => l.content).join('\n'));
            setMessage("DATASET SAVED");
        } else if (cmd === 'CANCEL' || cmd === 'EXIT') {
            onExit();
        } else if (cmd === 'SUBMIT') {
            onSave(lines.map(l => l.content).join('\n'));
            // In a real app, this would trigger job submission
            setMessage("JOB SUBMITTED (SIMULATED)");
        } else {
            setMessage("INVALID COMMAND");
        }
        setCommandLine("");
    };

    return (
        <div className="flex flex-col h-full bg-black font-mono text-green-500 text-lg">
            {/* Header */}
            <div className="bg-blue-900 text-white p-1 flex justify-between px-2 text-xl font-bold">
                <span>EDIT {datasetName}</span>
                <span>COL 001 080</span>
            </div>
            
            {/* Command Line */}
            <div className="flex items-center px-2 py-1 border-b border-gray-700">
                <span className="mr-2 text-white">COMMAND ===&gt;</span>
                <form onSubmit={handleMainCommand} className="flex-1">
                    <input 
                        className="bg-black text-red-500 font-bold outline-none uppercase w-full"
                        value={commandLine}
                        onChange={e => setCommandLine(e.target.value)}
                        autoFocus
                    />
                </form>
                <span className="text-yellow-400 text-sm">{message}</span>
            </div>

            {/* Editor Grid */}
            <div className="flex-1 overflow-auto bg-[#101010]">
                {lines.map((line, i) => (
                    <div key={i} className="flex hover:bg-[#202020]">
                        {/* Line Number / Command Area */}
                        <div className="w-20 bg-[#000040] text-cyan-300 border-r border-gray-600 flex shrink-0">
                            <input
                                className="w-full bg-transparent text-right pr-2 outline-none uppercase font-bold focus:bg-white focus:text-black cursor-text"
                                value={line.cmd || (i + 10000).toString().substring(1)}
                                onChange={(e) => {
                                    const newLines = [...lines];
                                    newLines[i].cmd = e.target.value;
                                    setLines(newLines);
                                }}
                                onKeyDown={(e) => handleLineCmdKeyDown(e, i)}
                                maxLength={6}
                            />
                        </div>
                        
                        {/* Content Area */}
                        <div className="flex-1 pl-2 relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-[72ch] bg-white/5 pointer-events-none border-r border-gray-700/30"></div>
                            <input 
                                className="w-full bg-transparent text-green-400 outline-none uppercase font-bold"
                                value={line.content}
                                onChange={(e) => handleContentChange(i, e.target.value)}
                                style={{ fontFamily: "'VT323', monospace", letterSpacing: '0px' }}
                            />
                        </div>
                    </div>
                ))}
                
                {/* End Marker */}
                <div className="text-cyan-600 pl-4 py-1">
                    ****** **************************** BOTTOM OF DATA ****************************
                </div>
            </div>
            
            {/* Footer */}
            <div className="bg-neutral-900 text-white p-1 text-sm flex justify-between px-4 font-bold">
                <span>F1=HELP</span>
                <span>F2=SPLIT</span>
                <span className="cursor-pointer hover:text-yellow-400" onClick={onExit}>F3=EXIT</span>
                <span>F7=UP</span>
                <span>F8=DOWN</span>
                <span>F9=SWAP</span>
                <span>F12=CANCEL</span>
            </div>
        </div>
    );
};
