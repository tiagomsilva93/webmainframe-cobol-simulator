
import { ASTNode, TokenContext } from './types';

// Simplified categories mapping for the UI
export type TokenType = 
  | 'keyword' 
  | 'identifier' 
  | 'literal_string' 
  | 'literal_number' 
  | 'comment' 
  | 'operator' 
  | 'sequence' 
  | 'indicator'
  | 'error'
  | 'default';

export interface HighlightToken {
  text: string;
  type: TokenType;
  startColumn: number;
}

const KEYWORDS = new Set([
  'IDENTIFICATION', 'DIVISION', 'PROGRAM-ID', 'ENVIRONMENT', 'DATA', 'WORKING-STORAGE', 
  'SECTION', 'PROCEDURE', 'PIC', 'VALUE', 'MOVE', 'ADD', 'SUBTRACT', 'COMPUTE', 'TO', 
  'FROM', 'IF', 'THEN', 'ELSE', 'END-IF', 'PERFORM', 'UNTIL', 'TIMES', 'END-PERFORM', 
  'ACCEPT', 'DISPLAY', 'STOP', 'RUN', 'ZERO', 'ZEROS', 'ZEROES', 'SPACE', 'SPACES',
  'GIVING', 'BY', 'IS', 'OF', 'REPLACING', 'COPY'
]);

const OPERATORS = new Set(['=', '>', '<', '>=', '<=', '+', '-', '*', '/', '**']);

export class SyntaxHighlighter {

  public static highlightLine(line: string, lineNumber: number, ast?: ASTNode): HighlightToken[] {
    const tokens: HighlightToken[] = [];
    
    // 1. Sequence Area (Cols 1-6)
    if (line.length > 0) {
      const seq = line.substring(0, Math.min(6, line.length));
      tokens.push({ text: seq, type: 'sequence', startColumn: 1 });
    }
    
    // 2. Indicator Area (Col 7)
    let isComment = false;
    if (line.length > 6) {
      const ind = line[6];
      if (ind === '*' || ind === '/') isComment = true;
      tokens.push({ text: ind, type: isComment ? 'comment' : 'indicator', startColumn: 7 });
    }

    // 3. Content Area (Cols 8-72)
    if (line.length > 7) {
      const content = line.substring(7, Math.min(line.length, 72));
      
      if (isComment) {
        tokens.push({ text: content, type: 'comment', startColumn: 8 });
      } else {
        const contentTokens = this.tokenizeContent(content, 8);
        tokens.push(...contentTokens);
      }
    }

    // 4. Overflow (Cols 73+)
    if (line.length > 72) {
      const overflow = line.substring(72);
      tokens.push({ text: overflow, type: 'error', startColumn: 73 });
    }

    return tokens;
  }

  private static tokenizeContent(content: string, offset: number): HighlightToken[] {
    const tokens: HighlightToken[] = [];
    // Regex matches: 
    // 1. Strings ("..." or '...')
    // 2. Words (Alphanumeric + hyphens)
    // 3. Numbers (Digits + optional dot)
    // 4. Operators
    // 5. Whitespace/Symbols
    const regex = /("[^"]*"|'[^']*')|([\w-]+)|(\d+(?:\.\d+)?)|(>=|<=|\*\*|[=><+\-*/])|([^\s\w"']+)|\s+/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const text = match[0];
      const startIndex = match.index;
      const absColumn = offset + startIndex;

      let type: TokenType = 'default';

      if (match[1]) { 
        type = 'literal_string';
      } else if (match[2]) { 
        // Word classification
        const upper = match[2].toUpperCase();
        if (/^\d+$/.test(upper)) {
           // Level number or integer
           type = 'literal_number'; // We group levels as numbers for color simplicity or special handle? Prompt asked for Yellow for numbers.
        } else if (KEYWORDS.has(upper)) {
           type = 'keyword';
        } else {
           type = 'identifier';
        }
      } else if (match[3]) { 
        type = 'literal_number';
      } else if (match[4]) {
        type = 'operator';
      } else {
        // Symbols or Whitespace
        type = 'default';
      }

      tokens.push({ text, type, startColumn: absColumn });
    }

    return tokens;
  }
}
