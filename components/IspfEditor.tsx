
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ValidationError } from '../compiler/validator';
import { Lexer } from '../compiler/lexer';
import { TokenType } from '../compiler/types';
import { getTokenClass, ISPF_THEME } from '../utils/ispfTheme';

interface IspfEditorProps {
    content: string;
    onChange: (content: string) => void;
    onExit: () => void;
    onRun: () => void;
    datasetName: string;
    diagnostics: ValidationError[];
}

interface LineState {
    cmd: string;
    content: string;
}

export const IspfEditor: React.FC<IspfEditorProps> = ({ content, onChange, onExit, onRun, datasetName, diagnostics }) => {
    const [lines, setLines] = useState<LineState[]>([]);
    const [message, setMessage] = useState("COMMAND ===>");
    const [commandLine, setCommandLine] = useState("");
    
    // Internal ref to track if changes are local or prop-driven to avoid loop
    const isLocalUpdate = useRef(false);
    const lineInputsRef = useRef<Map<number, HTMLInputElement>>(new Map());
    
    // Cursor positioning system
    const pendingCursor = useRef<{ line: number, col: number } | null>(null);

    // Initial Load & External Updates
    useEffect(() => {
        if (!isLocalUpdate.current) {
            const raw = content.split('\n');
            // Ensure at least 24 lines to fill screen look
            while (raw.length < 24) raw.push("");
            // Ensure strictly 80 cols
            setLines(raw.map(l => ({ cmd: '', content: l.padEnd(80, ' ').substring(0, 80) })));
        }
        isLocalUpdate.current = false;
    }, [content]);

    // Apply cursor position after render
    useLayoutEffect(() => {
        if (pendingCursor.current) {
            const { line, col } = pendingCursor.current;
            const input = lineInputsRef.current.get(line);
            if (input) {
                input.focus();
                // Safety clamp
                const safeCol = Math.max(6, Math.min(80, col));
                input.setSelectionRange(safeCol, safeCol);
            }
            pendingCursor.current = null;
        }
    });

    const updateContent = (newLines: LineState[]) => {
        isLocalUpdate.current = true;
        setLines(newLines);
        const joined = newLines.map(l => l.content).join('\n');
        onChange(joined);
    };

    // --- Protected Area Logic ---
    // Columns 1-6 (Indices 0-5) are protected. 
    // Column 7 (Index 6) is Indicator. 
    // Column 8 (Index 7) is Area A.
    // Column 12 (Index 11) is Area B.
    const FIRST_EDITABLE_COL = 6; // Index 6 (Col 7)

    const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>, index: number) => {
        const target = e.currentTarget;
        if (target.selectionStart !== null && target.selectionStart < FIRST_EDITABLE_COL) {
            target.setSelectionRange(FIRST_EDITABLE_COL, FIRST_EDITABLE_COL);
        }
    };

    // --- Keyboard Handling ---

    const handleContentKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        const target = e.currentTarget;
        const cursor = target.selectionStart || 0;
        const currentLine = lines[index].content;

        // 1. Navigation Keys
        if (e.key === 'Home') {
            e.preventDefault();
            // Toggle between Col 7 (Indicator) and Col 8 (Area A)
            // Or strictly Area A? Prompt says "Home -> firstEditableColumn". 
            // Let's toggle for convenience: If at 6, go to 7. If > 6, go to 6.
            const dest = cursor === FIRST_EDITABLE_COL ? 7 : FIRST_EDITABLE_COL;
            target.setSelectionRange(dest, dest);
            return;
        }

        if (e.key === 'End') {
            e.preventDefault();
            // Last non-blank char
            const trimmed = currentLine.trimEnd();
            const dest = Math.min(80, Math.max(FIRST_EDITABLE_COL, trimmed.length));
            target.setSelectionRange(dest, dest);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            // Logic: Start(6) -> Area A(7) -> Area B(11) -> +4 Steps
            let nextStop = 80;
            if (cursor < FIRST_EDITABLE_COL) nextStop = FIRST_EDITABLE_COL;
            else if (cursor < 7) nextStop = 7;   // To Area A (Col 8)
            else if (cursor < 11) nextStop = 11; // To Area B (Col 12)
            else {
                // Next tab stop (every 4 chars usually)
                nextStop = cursor + 4; 
                // Align to 4-boundaries optionally, or just jump
                nextStop = Math.min(80, nextStop);
            }
            target.setSelectionRange(nextStop, nextStop);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (index > 0) {
                pendingCursor.current = { line: index - 1, col: cursor };
                // Force update to trigger layout effect even if lines didn't change? 
                // We need to trigger a render or manually focus. 
                // Manual focus is better here since state might not change.
                const prevInput = lineInputsRef.current.get(index - 1);
                if (prevInput) {
                    prevInput.focus();
                    prevInput.setSelectionRange(cursor, cursor);
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (index < lines.length - 1) {
                const nextInput = lineInputsRef.current.get(index + 1);
                if (nextInput) {
                    nextInput.focus();
                    nextInput.setSelectionRange(cursor, cursor);
                }
            }
            return;
        }

        if (e.key === 'ArrowLeft') {
            // Allow default but block entering protected area
            if (cursor <= FIRST_EDITABLE_COL) {
                e.preventDefault();
            }
            return;
        }

        // 2. Editing Keys (Fixed Width Buffer Logic)

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (cursor <= FIRST_EDITABLE_COL) return; // Protected

            // Shift Left Logic
            // [0...cursor-1] + [cursor...] -> [0...cursor-2] + [cursor...] + " "
            const prefix = currentLine.substring(0, cursor - 1);
            const suffix = currentLine.substring(cursor);
            const newLine = (prefix + suffix + " ").substring(0, 80);

            const newLines = [...lines];
            newLines[index].content = newLine;
            updateContent(newLines);
            pendingCursor.current = { line: index, col: cursor - 1 };
            return;
        }

        if (e.key === 'Delete') {
            e.preventDefault();
            // Pull Left Logic
            // [0...cursor] + [cursor+1...] -> [0...cursor] + [cursor+1...] + " "
            const prefix = currentLine.substring(0, cursor);
            const suffix = currentLine.substring(cursor + 1);
            const newLine = (prefix + suffix + " ").substring(0, 80);

            const newLines = [...lines];
            newLines[index].content = newLine;
            updateContent(newLines);
            pendingCursor.current = { line: index, col: cursor };
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const newLines = [...lines];
            // Split line or Insert Empty? 
            // ISPF split: Content after cursor moves to next line.
            // ISPF plain enter: Insert empty line.
            // Let's do Insert Empty Line for now as requested previously.
            // But if we want "Terminal feel", usually Enter splits if not at end.
            // Keeping "Insert Empty Line" behavior for simplicity per previous context.
            // Align cursor to Area A (Col 8 / Index 7) of new line.
            newLines.splice(index + 1, 0, { cmd: '', content: ''.padEnd(80, ' ') });
            updateContent(newLines);
            pendingCursor.current = { line: index + 1, col: 7 };
            return;
        }

        // 3. Typing (Insert Mode with Truncation)
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            
            // Allow typing at end? No, max 80 cols. 
            if (cursor >= 80) return;

            // Insert char, shift right, drop last char
            const char = e.key.toUpperCase();
            const prefix = currentLine.substring(0, cursor);
            const suffix = currentLine.substring(cursor, 79); // 79 to make room for 1 char (total 80)
            const newLine = (prefix + char + suffix).padEnd(80, ' ').substring(0, 80);

            const newLines = [...lines];
            newLines[index].content = newLine;
            updateContent(newLines);
            pendingCursor.current = { line: index, col: cursor + 1 };
        }
    };

    // Standard handler for paste/etc fallback
    const handleContentChange = (index: number, val: string) => {
        // Enforce 80 chars
        const safeVal = val.padEnd(80, ' ').substring(0, 80).toUpperCase();
        const newLines = [...lines];
        newLines[index].content = safeVal;
        updateContent(newLines);
    };

    // --- Line Command Handling (Existing) ---
    const handleLineCmdKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = lines[index].cmd.trim();
            if (cmd) {
                executeLineCommand(index, cmd);
            }
        }
    };
    
    const executeLineCommand = (index: number, cmd: string) => {
        const newLines = [...lines];
        const cmdUpper = cmd.toUpperCase();
        
        if (cmdUpper.startsWith('I')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            for(let i=0; i<count; i++) {
                newLines.splice(index + 1, 0, { cmd: '', content: ''.padEnd(80, ' ') });
            }
            newLines[index].cmd = '';
            setMessage("LINE INSERTED");
        }
        else if (cmdUpper.startsWith('D')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            newLines.splice(index, count);
            setMessage("LINE DELETED");
        }
        else if (cmdUpper.startsWith('R')) {
            const count = parseInt(cmdUpper.substring(1) || '1') || 1;
            const lineToCopy = newLines[index];
            for(let i=0; i<count; i++) {
                newLines.splice(index + 1, 0, { ...lineToCopy, cmd: '' });
            }
            newLines[index].cmd = '';
            setMessage("LINE REPEATED");
        }
        else {
            setMessage(`INVALID CMD: ${cmd}`);
            return;
        }
        updateContent(newLines);
    };

    const handleMainCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = commandLine.trim().toUpperCase();
        if (cmd === 'SAVE') {
            setMessage("DATASET SAVED");
        } else if (cmd === 'CANCEL' || cmd === 'EXIT') {
            onExit();
        } else if (cmd === 'SUBMIT' || cmd === 'RUN') {
            onRun();
        } else {
            setMessage("INVALID COMMAND");
        }
        setCommandLine("");
    };

    // Helper to render syntax highlighting for a single line
    const renderHighlightedLine = (text: string) => {
        // Comments
        if (text.length > 6 && (text[6] === '*' || text[6] === '/')) {
            return <span className={ISPF_THEME.colors.COMMENT}>{text}</span>;
        }

        try {
            const tokens = new Lexer(text).tokenize().filter(t => t.type !== TokenType.EOF);
            
            const elements: React.ReactNode[] = [];
            let currentIdx = 0; 

            tokens.forEach((token, i) => {
                const tokenStart = token.column - 1; 
                
                if (tokenStart > currentIdx) {
                    elements.push(
                        <span key={`gap-${i}`} className="text-transparent selection:bg-blue-500/30">
                            {text.substring(currentIdx, tokenStart)}
                        </span>
                    );
                }

                const className = getTokenClass(token.type);
                elements.push(
                    <span key={`tok-${i}`} className={className}>
                        {token.value}
                    </span>
                );

                currentIdx = tokenStart + token.value.length;
            });

            if (currentIdx < text.length) {
                 elements.push(
                    <span key="gap-end" className="text-transparent selection:bg-blue-500/30">
                        {text.substring(currentIdx)}
                    </span>
                 );
            }
            
            return elements;

        } catch (e) {
            return <span className={ISPF_THEME.colors.DEFAULT}>{text}</span>;
        }
    };

    // Constants
    const LINE_HEIGHT = '1.5rem';
    const FONT_STYLE = { 
        fontFamily: "'VT323', monospace",
        fontSize: '1.25rem',
        lineHeight: LINE_HEIGHT,
        letterSpacing: '0px'
    };

    return (
        <div className="flex flex-col h-full bg-black font-mono text-green-500 text-xl relative border-r border-gray-700 w-full overflow-hidden">
            {/* ISPF Header */}
            <div className="bg-blue-900 text-white p-0.5 flex justify-between px-2 text-xl font-bold shrink-0">
                <span>EDIT       {datasetName}</span>
                <span>COL 001 080</span>
            </div>
            
            {/* Command Line */}
            <div className="flex items-center px-2 py-0 border-b border-gray-700 bg-black shrink-0">
                <span className="mr-2 text-cyan-300">COMMAND ===&gt;</span>
                <form onSubmit={handleMainCommand} className="flex-1">
                    <input 
                        className="bg-black text-red-500 font-bold outline-none uppercase w-full"
                        value={commandLine}
                        onChange={e => setCommandLine(e.target.value)}
                        autoFocus
                    />
                </form>
                <span className="text-yellow-400 text-lg">{message}</span>
            </div>

            {/* Editor Area */}
            <div 
                className="flex-1 overflow-y-auto overflow-x-hidden bg-black relative custom-scrollbar"
                style={FONT_STYLE}
            >
                 {/* Header Ruler - Fixed Width */}
                 <div className="flex sticky top-0 z-20 bg-black border-b border-gray-800 text-blue-400 w-[86ch] pointer-events-none">
                    <div className="w-[6ch] text-right border-r border-gray-700 mr-[1ch] shrink-0"></div>
                    <div className="whitespace-pre font-bold">
                        <span className="text-yellow-600 opacity-50">      * A   B                                                               </span><br/>
                        <span>----+----1----+----2----+----3----+----4----+----5----+----6----+----7----+----8</span>
                    </div>
                 </div>

                {lines.map((line, i) => {
                    const lineNum = i + 1;
                    const error = diagnostics.find(d => d.line === lineNum);
                    
                    return (
                        <div key={i} className="flex hover:bg-[#111] group relative w-max">
                            {/* Line Number */}
                            <div className={`w-[6ch] text-right border-r border-gray-800 mr-[1ch] shrink-0 select-none z-10 ${error ? 'bg-red-900 text-white' : 'text-cyan-500'}`}>
                                <input
                                    className="w-full bg-transparent text-right outline-none uppercase font-bold focus:text-white cursor-text"
                                    value={line.cmd || i.toString().padStart(6, '0')}
                                    onChange={(e) => {
                                        const newLines = [...lines];
                                        newLines[i].cmd = e.target.value;
                                        setLines(newLines);
                                    }}
                                    onKeyDown={(e) => handleLineCmdKeyDown(e, i)}
                                    maxLength={6}
                                />
                            </div>
                            
                            {/* Content Stack - Strict 80ch Width */}
                            <div className="relative w-[80ch] flex-shrink-0 h-[1.5rem]">
                                {/* Layer 1: Error Background */}
                                {error && (
                                    <div className={`absolute inset-0 ${ISPF_THEME.colors.ERROR_BG} pointer-events-none`}></div>
                                )}

                                {/* Layer 2: Syntax Highlight Renderer (Behind input) */}
                                <div className="absolute inset-0 whitespace-pre pointer-events-none z-0" aria-hidden="true">
                                    {renderHighlightedLine(line.content)}
                                </div>

                                {/* Layer 3: Transparent Editable Input (Top) */}
                                <input 
                                    ref={el => {
                                        if (el) lineInputsRef.current.set(i, el);
                                        else lineInputsRef.current.delete(i);
                                    }}
                                    className={`relative z-10 w-full h-full bg-transparent outline-none uppercase font-bold text-transparent caret-white selection:bg-blue-500/30 selection:text-transparent p-0 m-0 border-none`}
                                    value={line.content}
                                    onChange={(e) => handleContentChange(i, e.target.value)}
                                    onKeyDown={(e) => handleContentKeyDown(e, i)}
                                    onSelect={(e) => handleSelect(e, i)}
                                    maxLength={80}
                                    spellCheck={false}
                                    style={{
                                        color: 'transparent',
                                        caretColor: 'white',
                                        width: '80ch',
                                        maxWidth: '80ch'
                                    }}
                                />
                            </div>
                            
                            {/* Visual Marker for Error (Outside 80 col limit) */}
                            {error && (
                                <div className={`ml-2 ${ISPF_THEME.colors.ERROR_TEXT} text-sm flex items-center animate-pulse z-10 whitespace-nowrap`}>
                                    &lt;&lt; {error.code}
                                </div>
                            )}
                        </div>
                    );
                })}
                
                <div className="text-cyan-600 pl-[8ch] py-1">
                    ****** **************************** BOTTOM OF DATA ****************************
                </div>
                <div className="h-48"></div>
            </div>
        </div>
    );
};
