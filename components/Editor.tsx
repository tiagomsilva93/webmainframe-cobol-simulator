
import React, { useRef, useMemo } from 'react';
import { ValidationError } from '../compiler/validator';
import { SyntaxHighlighter, HighlightToken } from '../compiler/syntaxHighlighter';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  errors?: ValidationError[];
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, errors = [] }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Calculate lines dynamically based on content + buffer
  const codeLines = code.split('\n');
  const lineCount = codeLines.length;
  const minLines = 50; 
  const totalLines = Math.max(lineCount, minLines);

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

  // Common styles to ensure perfect alignment between Textarea and Overlay
  const FONT_STYLE = { 
    fontFamily: "'VT323', monospace", 
    fontSize: '1.25rem',  // Approx 20px
    lineHeight: '1.5rem', // 24px
    letterSpacing: 'normal'
  };

  // Helper to map token types to Tailwind classes
  const getTokenClass = (type: string) => {
    switch (type) {
      case 'sequence': return 'text-gray-600';
      case 'indicator': return 'text-yellow-600';
      case 'comment': return 'text-gray-500 italic opacity-80';
      case 'structure': return 'text-cyan-300 font-bold';
      
      // Control Verbs (IF, PERFORM) -> Bold Light Green
      case 'verb_control': return 'text-green-300 font-bold brightness-110';
      
      // Operational Verbs (MOVE, ADD) -> Standard Green
      case 'verb_op': return 'text-green-500';
      
      // Operators (=, >, <) -> White/Gray
      case 'operator': return 'text-gray-300 font-bold';
      
      // Levels (01, 77) -> Magenta
      case 'level': return 'text-purple-400 font-bold';
      case 'level_warning': return 'text-yellow-500 underline decoration-wavy';
      
      // Literals
      case 'literal_text': return 'text-yellow-300'; // Text = Yellow
      case 'literal_number': return 'text-cyan-200'; // Numbers = Cyan Light
      
      // Identifiers
      case 'identifier': return 'text-green-600'; // Standard
      case 'identifier_cond': return 'text-green-400 brightness-110'; // In context
      
      case 'overflow': return 'bg-red-900/40 text-red-300';
      case 'error': return 'text-red-500 underline decoration-wavy';
      default: return 'text-green-600'; 
    }
  };

  const highlightedLines = useMemo(() => {
    return codeLines.map(line => SyntaxHighlighter.highlightLine(line));
  }, [codeLines]);

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
                
                {/* Highlight Overlay (Behind Textarea) */}
                <div 
                    ref={overlayRef}
                    className="absolute inset-0 p-2 overflow-auto whitespace-pre z-0 pointer-events-none"
                    style={FONT_STYLE}
                >
                    {highlightedLines.map((tokens, i) => {
                        const error = errors.find(e => e.line === i + 1);
                        
                        return (
                          <div key={i} className="relative h-6 w-full">
                            {/* Syntax Highlighting */}
                            {tokens.map((token, tIdx) => (
                              <span key={tIdx} className={getTokenClass(token.type)}>
                                {token.text}
                              </span>
                            ))}

                            {/* Error Underline/Marker */}
                            {error && (
                                <span className="absolute left-0 bottom-0 w-full border-b-2 border-red-500/50 pointer-events-none">
                                </span>
                            )}
                            {/* Error Caret */}
                            {error && (
                                <span 
                                  className="absolute text-red-500 font-bold -bottom-1 z-30" 
                                  style={{ left: `calc(${error.column - 1}ch)` }}
                                >
                                  ^
                                </span>
                            )}
                          </div>
                        );
                    })}
                    {/* Padding for scroll */}
                    <div className="h-48"></div>
                </div>

                {/* Interactive Textarea (Transparent) */}
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
