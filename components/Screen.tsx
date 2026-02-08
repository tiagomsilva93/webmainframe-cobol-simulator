
import React, { useEffect, useRef, useState } from 'react';
import { ScreenChar } from '../compiler/runtime';

interface ScreenProps {
    buffer: ScreenChar[];
    onInput: (buffer: ScreenChar[]) => void;
    active: boolean;
    cursorPosition?: number;
}

export const Screen: React.FC<ScreenProps> = ({ buffer, onInput, active, cursorPosition }) => {
    const [localBuffer, setLocalBuffer] = useState<ScreenChar[]>(buffer);
    const [cursor, setCursor] = useState(0);

    useEffect(() => {
        setLocalBuffer(buffer);
    }, [buffer]);

    useEffect(() => {
        if (active) {
            // Find first editable field or non-space?
            // Simple: Start at 0
        }
    }, [active]);
    
    // Force cursor position when prop changes (e.g. Panel Reset)
    useEffect(() => {
        if (cursorPosition !== undefined) {
            setCursor(cursorPosition);
        }
    }, [cursorPosition]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!active) return;
        
        if (e.key === 'Enter') {
            e.preventDefault();
            onInput(localBuffer);
            return;
        }

        if (e.key === 'ArrowRight') {
            setCursor((p) => Math.min(p + 1, 1919));
            return;
        }
        if (e.key === 'ArrowLeft') {
            setCursor((p) => Math.max(p - 1, 0));
            return;
        }
        if (e.key === 'ArrowDown') {
            setCursor((p) => Math.min(p + 80, 1919));
            return;
        }
        if (e.key === 'ArrowUp') {
            setCursor((p) => Math.max(p - 80, 0));
            return;
        }

        if (e.key.length === 1) {
            // Typing
            const newBuf = [...localBuffer];
            newBuf[cursor] = { ...newBuf[cursor], char: e.key.toUpperCase() };
            setLocalBuffer(newBuf);
            setCursor((p) => Math.min(p + 1, 1919));
        }
        
        if (e.key === 'Backspace') {
             const newBuf = [...localBuffer];
             const target = Math.max(0, cursor - 1);
             newBuf[target] = { ...newBuf[target], char: ' ' };
             setLocalBuffer(newBuf);
             setCursor(target);
        }
    };

    return (
        <div 
            className="w-full h-full bg-black text-green-500 font-mono text-xl outline-none overflow-hidden relative"
            style={{ 
                display: 'grid', 
                gridTemplateColumns: `repeat(80, 1ch)`, 
                gridTemplateRows: `repeat(24, 1.5rem)`,
                fontFamily: "'VT323', monospace",
                lineHeight: '1.5rem'
            }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            autoFocus
        >
            {localBuffer.map((cell, i) => {
                const isCursor = i === cursor;
                const isAttr = false; // Implement attributes later (invisible)
                return (
                    <div 
                        key={i} 
                        className={`
                            ${isCursor && active ? 'bg-green-500 text-black animate-pulse' : ''}
                            ${cell.attr === 1 ? 'text-white font-bold' : ''}
                        `}
                    >
                        {cell.char}
                    </div>
                );
            })}
        </div>
    );
};
