
export type TokenType = 
  | 'default' 
  | 'sequence' 
  | 'indicator' 
  | 'comment' 
  | 'structure' 
  | 'verb_control' 
  | 'verb_op' 
  | 'operator'
  | 'level' 
  | 'level_warning' 
  | 'literal_text' 
  | 'literal_number' 
  | 'identifier' 
  | 'identifier_cond'
  | 'overflow' 
  | 'error';

export interface HighlightToken {
  text: string;
  type: TokenType;
}

const CONTROL_KEYWORDS = new Set([
  'IF', 'ELSE', 'END-IF', 'PERFORM', 'END-PERFORM', 'UNTIL', 'EVALUATE', 
  'END-EVALUATE', 'THEN', 'TIMES', 'VARYING', 'WHEN', 'ALSO', 'GO', 'RETURN', 
  'EXIT', 'NEXT', 'SENTENCE'
]);

const OPERATIONAL_KEYWORDS = new Set([
  'ACCEPT', 'ADD', 'ALTER', 'CALL', 'CANCEL', 'CLOSE', 'COMPUTE', 'CONTINUE', 
  'DELETE', 'DISPLAY', 'DIVIDE', 'INITIALIZE', 'INSPECT', 'MERGE', 'MOVE', 
  'MULTIPLY', 'OPEN', 'READ', 'RELEASE', 'REWRITE', 'SEARCH', 'SET', 'SORT', 
  'START', 'STOP', 'STRING', 'SUBTRACT', 'UNSTRING', 'WRITE', 'TO', 'FROM', 
  'BY', 'INTO', 'GIVING', 'OF', 'PIC', 'VALUE', 'IS', 'RUN', 'REPLACING',
  'ZERO', 'ZEROS', 'ZEROES', 'SPACE', 'SPACES', 'LOW-VALUE', 'HIGH-VALUE',
  'COPY', 'PROGRAM-ID', 'AUTHOR', 'INSTALLATION', 'DATE-WRITTEN', 'DATE-COMPILED'
]);

const STRUCTURE_KEYWORDS = new Set([
  'IDENTIFICATION', 'DIVISION', 'ENVIRONMENT', 'DATA', 'WORKING-STORAGE', 
  'SECTION', 'PROCEDURE', 'FILE', 'LINKAGE', 'CONFIGURATION', 'INPUT-OUTPUT', 
  'FILE-CONTROL', 'FD'
]);

const LOGICAL_OPERATORS = new Set([
  '=', '>', '<', '>=', '<=', 'NOT', 'AND', 'OR'
]);

export class SyntaxHighlighter {

  public static highlightLine(line: string): HighlightToken[] {
    const tokens: HighlightToken[] = [];
    
    // 1. Sequence Area (Cols 1-6) - Indices 0-5
    if (line.length > 0) {
      const seq = line.substring(0, 6);
      tokens.push({ text: seq, type: 'sequence' });
    }
    
    // 2. Indicator Area (Col 7) - Index 6
    let isCommentLine = false;
    if (line.length > 6) {
      const ind = line[6];
      tokens.push({ text: ind, type: 'indicator' });
      if (ind === '*' || ind === '/') {
        isCommentLine = true;
      }
    }

    // 3. Area A & B (Cols 8-72) - Indices 7-71
    if (line.length > 7) {
      const maxContentIndex = Math.min(line.length, 72);
      const content = line.substring(7, maxContentIndex);
      
      if (isCommentLine) {
        tokens.push({ text: content, type: 'comment' });
      } else {
        // Tokenize the code content
        const contentTokens = this.tokenizeContent(content);
        
        // Post-process for context (basic)
        this.applyContextRules(contentTokens);
        
        tokens.push(...contentTokens);
      }
    }

    // 4. Overflow Area (Cols 73-80+) - Indices 72+
    if (line.length > 72) {
      const overflow = line.substring(72);
      tokens.push({ text: overflow, type: 'overflow' });
    }

    return tokens;
  }

  private static tokenizeContent(content: string): HighlightToken[] {
    const tokens: HighlightToken[] = [];
    // Regex Groups:
    // 1. Inline Comment (*> ...)
    // 2. String Literals
    // 3. Words (Identifier/Keyword)
    // 4. Numbers
    // 5. Logical Operators (>=, <=, >, <, =)
    // 6. Other Symbols (Dot, Parens, Math)
    // 7. Whitespace
    const regex = /((?:\*>).*)|("[^"]*"|'[^']*')|([\w-]+)|(\d+(?:\.\d+)?)|(>=|<=|[=><])|([^\s\w"']+)|\s+/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const text = match[0];
      const startIndex = match.index; // Relative to content start (Col 8)
      
      let type: TokenType = 'default';

      if (match[1]) { // Inline Comment
        type = 'comment';
      } else if (match[2]) { // String Literal
        type = 'literal_text';
      } else if (match[3]) { // Word
        type = this.classifyWord(match[3], startIndex);
      } else if (match[4]) { // Number
        type = 'literal_number';
      } else if (match[5]) { // Operator
        type = 'operator';
      } else if (match[6]) { // Symbol
        type = 'default'; // Dot, parens, etc.
      } else {
        // Whitespace
        type = 'default';
      }

      tokens.push({ text, type });
    }

    return tokens;
  }

  private static classifyWord(word: string, startIndex: number): TokenType {
    const upper = word.toUpperCase();

    // Check Area A vs Area B
    // Area A: Cols 8-11 (Indices 0-3 in content)
    // Area B: Cols 12-72 (Indices 4+ in content)
    const inAreaA = startIndex < 4;
    
    // Levels (01, 77, etc)
    if (/^\d+$/.test(word)) {
      if (inAreaA) return 'level';
      return 'level_warning'; // Level in Area B is questionable/warning
    }

    // Structure Headers (DIVISION, SECTION)
    if (STRUCTURE_KEYWORDS.has(upper)) {
        return inAreaA ? 'structure' : 'default'; // Structure headers usually in Area A
    }

    // Verbs
    if (CONTROL_KEYWORDS.has(upper)) {
        return !inAreaA ? 'verb_control' : 'default'; // Verbs must be in Area B
    }
    if (OPERATIONAL_KEYWORDS.has(upper)) {
        return !inAreaA ? 'verb_op' : 'default'; // Verbs must be in Area B
    }

    // Logical Operators (AND, OR, NOT)
    if (LOGICAL_OPERATORS.has(upper)) {
        return 'operator';
    }

    // Identifiers
    return 'identifier';
  }

  private static applyContextRules(tokens: HighlightToken[]) {
    // Simple state machine to highlight identifiers inside conditions
    let inCondition = false;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'verb_control' && (t.text === 'IF' || t.text === 'UNTIL' || t.text === 'WHEN')) {
            inCondition = true;
        } else if (t.type === 'verb_control' && (t.text === 'THEN' || t.text === 'ELSE')) {
            inCondition = false;
        } else if (t.text === '.') {
            inCondition = false;
        }

        if (inCondition && t.type === 'identifier') {
            t.type = 'identifier_cond';
        }
    }
  }
}
