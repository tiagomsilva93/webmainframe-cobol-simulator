
import React, { useRef, useMemo } from 'react';
import { ValidationError, Severity } from '../compiler/validator';
import { SyntaxHighlighter, HighlightToken, TokenType } from '../compiler/syntaxHighlighter';
import { ASTNode } from '../compiler/types';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  errors?: ValidationError[];
  ast?: ASTNode;
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, errors = [], ast }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  const codeLines = code.split('\n');
  const minLines = 50; 
  const totalLines = Math.max(codeLines.length, minLines);

  const handleScroll = () => {
    if (textareaRef.current) {
      const top = textareaRef.current.scrollTop;
      const left = textareaRef.current.scrollLeft;
      if (linesRef.current) linesRef.current.scrollTop = top;
      if (overlayRef.current) {
         overlayRef.current.scrollTop = top;
         overlayRef.current.scrollLeft = left;
      }
    }
  };

  const RULER_TEXT = "      * A   B                                                               ";
  const RULER_SCALE= "----+----1----+----2----+----3----+----4----+----5----+----6----+----7----+----8";

  const FONT_STYLE = { 
    fontFamily: "'VT323', monospace", 
    fontSize: '1.25rem',
    lineHeight: '1.5rem',
    letterSpacing: 'normal'
  };

  const getTokenClass = (token: HighlightToken, severity: Severity | null) => {
    // Error Overrides
    if (severity === 'ERROR') return 'text-red-500 underline decoration-wavy font-bold decoration-2';
    if (severity === 'WARNING') return 'text-yellow-500 underline decoration-dotted decoration-2';
    if (severity === 'INFO') return 'text-gray-500 underline decoration-dashed opacity-80';

    // Token Colors per Request
    switch (token.type) {
      case 'keyword': return 'text-blue-400 font-bold';       // Blue
      case 'identifier': return 'text-gray-100';              // White
      case 'literal_string': return 'text-green-400';         // Green
      case 'literal_number': return 'text-yellow-300';        // Yellow
      case 'comment': return 'text-gray-500 italic';          // Gray
      case 'operator': return 'text-purple-400 font-bold';    // Purple
      case 'error': return 'bg-red-900/40 text-red-300';      // Red (Background for serious formatting errors)
      case 'sequence': return 'text-gray-600';
      case 'indicator': return 'text-yellow-600';
      default: return 'text-gray-300';
    }
  };

  const highlightedLines = useMemo(() => {
    return codeLines.map((line, idx) => SyntaxHighlighter.highlightLine(line, idx + 1, ast));
  }, [codeLines, ast]);

  return (
    <div className="flex-1 h-full flex flex-col border-r border-gray-700 bg-black">
      <div className="bg-neutral-800 text-white px-2 py-1 text-xs border-b border-gray-700 font-bold shrink-0">
        EDIT DATASET 'SYS1.COBOL.SOURCE(HELLO)' - 01.00
      </div>
      
      <div className="relative flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div 
            ref={linesRef}
            className="w-16 bg-neutral-900 text-yellow-600 text-right pr-2 pt-[calc(2.5rem+8px)] font-mono text-sm leading-6 select-none border-r border-gray-700 overflow-hidden shrink-0 z-20"
            style={FONT_STYLE}
        >
            {Array.from({ length: totalLines }).map((_, i) => (
                <div key={i}>{(i + 1).toString().padStart(6, '0')}</div>
            ))}
        </div>
        
        {/* Code Area Container */}
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-black">
            
            {/* ISPF Ruler */}
            <div className="bg-[#000040] text-cyan-300 select-none border-b border-blue-900 shrink-0 z-20 w-full pl-2 whitespace-pre pointer-events-none"
                 style={{ ...FONT_STYLE, lineHeight: '1.25rem' }}>
                <div className="opacity-50">{RULER_TEXT}</div>
                <div className="font-bold">{RULER_SCALE}</div>
            </div>

            <div className="relative flex-1 h-full w-full">
                
                {/* Highlight Overlay */}
                <div 
                    ref={overlayRef}
                    className="absolute inset-0 p-2 overflow-auto whitespace-pre z-0 pointer-events-none"
                    style={FONT_STYLE}
                >
                    {highlightedLines.map((tokens, i) => {
                        const lineErrors = errors.filter(e => e.line === i + 1);
                        
                        return (
                          <div key={i} className="relative h-6 w-full">
                            {tokens.map((token, tIdx) => {
                                const tokenErrors = lineErrors.filter(e => {
                                    const tStart = token.startColumn;
                                    const tEnd = tStart + token.text.length;
                                    return e.column >= tStart && e.column < tEnd + 1;
                                });

                                let severity: Severity | null = null;
                                if (tokenErrors.some(e => e.severity === 'ERROR')) severity = 'ERROR';
                                else if (tokenErrors.some(e => e.severity === 'WARNING')) severity = 'WARNING';
                                else if (tokenErrors.some(e => e.severity === 'INFO')) severity = 'INFO';
                                
                                return (
                                  <span key={tIdx} className={getTokenClass(token, severity)}>
                                    {token.text}
                                  </span>
                                );
                            })}
                          </div>
                        );
                    })}
                    <div className="h-48"></div>
                </div>

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    onScroll={handleScroll}
                    spellCheck={false}
                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono text-sm leading-6 p-2 resize-none focus:outline-none uppercase overflow-auto whitespace-pre z-10 selection:bg-blue-500/30 selection:text-transparent"
                    value={code}
                    onChange={(e) => onChange(e.target.value)}
                    style={FONT_STYLE}
                />
            </div>
        </div>
      </div>
    </div>
  );
};
