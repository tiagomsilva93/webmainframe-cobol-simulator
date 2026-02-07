
import React, { useRef, useMemo } from 'react';
import { Diagnostic } from '../compiler/types';
import { SyntaxHighlighter } from '../compiler/syntaxHighlighter';
import { Token, TokenType } from '../compiler/types';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, tokens, diagnostics }) => {
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

  // Group tokens by line once when input changes
  const tokensByLine = useMemo(() => {
    return SyntaxHighlighter.groupTokensByLine(tokens, codeLines.length);
  }, [tokens, codeLines.length]);

  /**
   * Renders a single line of code by combining Tokens and Raw Text (gaps/comments).
   */
  const renderLine = (lineIndex: number, lineContent: string) => {
    const lineNum = lineIndex + 1;
    const lineTokens = tokensByLine[lineNum] || [];
    
    // Check if line is a comment (Lexer discards them, so we check raw text)
    const indicator = lineContent[6];
    const isComment = lineContent.length >= 7 && (indicator === '*' || indicator === '/');

    if (isComment) {
       return <span className="text-gray-500 italic">{lineContent}</span>;
    }

    const elements: React.ReactNode[] = [];
    let currentColumn = 1; // 1-based column

    // Process tokens
    for (const token of lineTokens) {
        // 1. Fill gap before token (whitespace)
        if (token.column > currentColumn) {
            const gap = lineContent.substring(currentColumn - 1, token.column - 1);
            elements.push(<span key={`gap-${currentColumn}`} className="text-gray-500 opacity-50">{gap}</span>);
            currentColumn = token.column;
        }

        // 2. Render Token
        const tokenClass = SyntaxHighlighter.getTokenClass(token.type);
        
        // Check for diagnostics on this token
        const tokenDiags = diagnostics.filter(d => 
            d.line === lineNum && 
            d.column >= token.column && 
            d.column < (token.column + token.value.length)
        );

        let decorationClass = "";
        let title = "";

        if (tokenDiags.length > 0) {
            const severe = tokenDiags.find(d => d.severity === 'ERROR');
            const warn = tokenDiags.find(d => d.severity === 'WARNING');
            
            if (severe) {
                decorationClass = " underline decoration-wavy decoration-red-500 underline-offset-4";
                title = severe.message;
            } else if (warn) {
                decorationClass = " underline decoration-dotted decoration-yellow-500 underline-offset-4";
                title = warn.message;
            }
        }

        elements.push(
            <span 
                key={`tok-${token.column}`} 
                className={`${tokenClass} ${decorationClass}`}
                title={title}
            >
                {token.value}
            </span>
        );

        currentColumn += token.value.length;
    }

    // 3. Fill remaining gap after last token
    if (currentColumn <= lineContent.length) {
        const remaining = lineContent.substring(currentColumn - 1);
        elements.push(<span key={`gap-end`} className="text-gray-500 opacity-50">{remaining}</span>);
    }

    return elements;
  };

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
                    {codeLines.map((line, i) => (
                        <div key={i} className="relative h-6 w-full">
                            {renderLine(i, line)}
                        </div>
                    ))}
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
