
import React, { useEffect, useRef, useState } from 'react';

interface CopybookModalProps {
  isOpen: boolean;
  copybookName: string;
  foundAtLine: number;
  foundAtCol: number;
  onSubmit: (content: string) => void;
  onCancel: () => void;
}

export const CopybookModal: React.FC<CopybookModalProps> = ({ 
  isOpen, 
  copybookName, 
  foundAtLine, 
  foundAtCol,
  onSubmit,
  onCancel
}) => {
  const [content, setContent] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const defaultMsg = `IGYDS1089-S COPYBOOK '${copybookName}' MISSING AT L${foundAtLine}:C${foundAtCol}.`;

  useEffect(() => {
    if (isOpen) {
      setContent(""); 
      setErrorMsg(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLTextAreaElement>) => {
    if (e.currentTarget instanceof HTMLTextAreaElement) {
        const val = e.currentTarget.value;
        const selStart = e.currentTarget.selectionStart;
        
        const textBefore = val.substring(0, selStart);
        const lines = textBefore.split('\n');
        const currentLine = lines.length;
        const currentCol = lines[lines.length - 1].length + 1;
        setCursorPos({ line: currentLine, col: currentCol });
    }
  };

  const validate = (text: string): string | null => {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const upper = line.toUpperCase();
        
        // Forbidden Divisions in Copybook
        if (upper.includes("IDENTIFICATION DIVISION") || upper.includes("PROCEDURE DIVISION")) {
            return `IGYDS2070-S INVALID DIVISION HEADER AT LINE ${i + 1}`;
        }
        
        // Overflow Check (Col 73+) - excluding comments
        // Note: 6 chars sequence + 1 indicator + 65 chars code = 72. 
        // Index 72 is Col 73.
        if (line.length > 72 && line[6] !== '*') {
             return `IGYDS2071-W LINE ${i+1} EXCEEDS COL 72`;
        }
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    const err = validate(val);
    setErrorMsg(err);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'F3') {
          e.preventDefault();
          onCancel();
      }
      if (e.key === 'F6') {
          e.preventDefault();
          formatCode();
      }
      // Allow default Tab behavior or trap it?
      if (e.key === 'Tab') {
          e.preventDefault();
          const target = e.target as HTMLTextAreaElement;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const newValue = content.substring(0, start) + "    " + content.substring(end);
          setContent(newValue);
          // Need to manually reset cursor but React state sync makes it jump. Simplified for now.
      }
  };

  const formatCode = () => {
      const lines = content.split('\n');
      const formatted = lines.map(line => {
          const trimmed = line.trimStart();
          if (trimmed.length === 0) return "";
          if (trimmed.startsWith('*') || trimmed.startsWith('/')) return line; // Comment
          
          // Heuristic: Level numbers 01 and 77 go to Area A (Col 8, Index 7)
          if (trimmed.startsWith('01') || trimmed.startsWith('77')) {
             return "       " + trimmed; 
          }
          // Heuristic: Other levels go to Area B (Col 12, Index 11)
          if (/^\d\d/.test(trimmed)) {
             return "           " + trimmed; 
          }
          // Default to Area B
          return "           " + trimmed;
      });
      setContent(formatted.join('\n'));
      setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleSubmit = () => {
    // Block on Severe Errors (-S)
    if (errorMsg && errorMsg.includes("-S")) return;
    
    // Final check
    const err = validate(content);
    if (err && err.includes("-S")) {
        setErrorMsg(err);
        return;
    }
    onSubmit(content);
  };

  if (!isOpen) return null;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') setContent(e.target.result);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Calculate lines for gutter
  const linesArr = content.split('\n');
  const totalLines = Math.max(linesArr.length, 24);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 font-mono" onKeyDown={handleKeyDown}>
      <div className="bg-black border-2 border-gray-500 w-[900px] h-[600px] shadow-2xl flex flex-col flex-shrink-0">
        
        {/* ISPF Header */}
        <div className="bg-blue-900 text-white p-1 text-center font-bold tracking-widest border-b border-gray-600 text-sm flex justify-between px-4">
            <span>EDIT '{copybookName}'</span>
            <span>COL {cursorPos.col.toString().padStart(3, '0')}</span>
        </div>

        {/* Info / Message Bar */}
        <div className="bg-neutral-800 text-cyan-300 p-2 text-xs border-b border-gray-700 font-bold whitespace-pre flex justify-between items-center h-8">
            <span className={errorMsg ? "text-red-400 bg-black px-2 animate-pulse" : ""}>
              {errorMsg || defaultMsg}
            </span>
            <span className="text-yellow-500">SCROLL</span>
        </div>
        
        {/* Editor Main Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0a0a]">
            
            {/* Ruler Header */}
            <div className="flex shrink-0 text-cyan-500 bg-[#111] border-b border-gray-700 select-none text-lg leading-none pt-1" style={{ fontFamily: "'VT323', monospace" }}>
                <div className="w-16 border-r border-gray-700 bg-neutral-900"></div>
                <div className="flex-1 whitespace-pre pl-1 overflow-hidden">
                    <div className="opacity-50 text-xs text-yellow-600 mb-1">      * A   B</div>
                    <div className="font-bold tracking-normal">----+----1----+----2----+----3----+----4----+----5----+----6----+----7--</div>
                </div>
            </div>

            <div className="flex-1 flex relative overflow-hidden">
                {/* Line Numbers Gutter */}
                <div 
                    ref={lineNumbersRef}
                    className="w-16 bg-neutral-900 text-yellow-600 text-right pr-2 pt-2 font-mono text-lg leading-6 select-none border-r border-gray-700 overflow-hidden"
                    style={{ fontFamily: "'VT323', monospace" }}
                >
                    {Array.from({ length: totalLines }).map((_, i) => (
                        <div key={i}>{(i + 1).toString().padStart(6, '0')}</div>
                    ))}
                </div>

                {/* Main Text Area with Background Highlights */}
                <textarea 
                    ref={textareaRef}
                    value={content}
                    onChange={handleChange}
                    onScroll={handleScroll}
                    onKeyUp={handleKeyUp}
                    onClick={handleKeyUp}
                    className="flex-1 bg-transparent text-green-400 p-2 pt-2 focus:outline-none resize-none whitespace-pre overflow-auto leading-6 text-lg"
                    style={{ 
                        fontFamily: "'VT323', monospace",
                        background: `
                            linear-gradient(
                                90deg, 
                                rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 6ch,  /* Seq 1-6 */
                                transparent 6ch, transparent 7ch,                      /* Ind 7 */
                                rgba(255,255,0,0.05) 7ch, rgba(255,255,0,0.05) 11ch,   /* Area A 8-11 */
                                transparent 11ch, transparent 72ch,                    /* Area B 12-72 */
                                rgba(255,0,0,0.15) 72ch                                /* Overflow 73+ */
                            )
                        `
                    }}
                    spellCheck={false}
                    autoCapitalize="none"
                />
            </div>
        </div>

        {/* Footer Keys */}
        <div className="bg-neutral-900 p-2 border-t border-gray-600 flex justify-between items-center text-cyan-400 font-bold font-mono text-sm select-none">
           <div className="flex gap-4">
              <span className="cursor-pointer hover:text-white" onClick={onCancel}>F3=CANCEL</span>
              <span className="cursor-pointer hover:text-white" onClick={formatCode}>F6=FORMAT</span>
              <span className="cursor-pointer hover:text-white opacity-50">F7=UP</span>
              <span className="cursor-pointer hover:text-white opacity-50">F8=DOWN</span>
           </div>
           <div className="flex gap-2 items-center">
               <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-500 hover:text-white mr-4"
               >
                  [UPLOAD]
               </button>
               <span className="text-white mr-2">ENTER=SUBMIT</span>
               <button 
                  onClick={handleSubmit}
                  className="px-4 py-0.5 bg-blue-800 text-white hover:bg-blue-600 border border-blue-500 uppercase font-bold"
               >
                  SUBMIT
               </button>
           </div>
        </div>
        
        {/* Hidden File Input */}
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
        />

      </div>
    </div>
  );
};
