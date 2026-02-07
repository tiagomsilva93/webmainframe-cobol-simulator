
import { Token, TokenType } from './types';

const KEYWORDS: Record<string, TokenType> = {
  'IDENTIFICATION': TokenType.IDENTIFICATION,
  'DIVISION': TokenType.DIVISION,
  'PROGRAM-ID': TokenType.PROGRAM_ID,
  
  'ENVIRONMENT': TokenType.ENVIRONMENT,
  'CONFIGURATION': TokenType.CONFIGURATION,
  'INPUT-OUTPUT': TokenType.INPUT_OUTPUT,
  'FILE-CONTROL': TokenType.FILE_CONTROL,
  'SELECT': TokenType.SELECT,
  'ASSIGN': TokenType.ASSIGN,
  'ORGANIZATION': TokenType.ORGANIZATION,
  'LINE': TokenType.LINE,
  'SEQUENTIAL': TokenType.SEQUENTIAL,
  'INDEXED': TokenType.INDEXED,
  'ACCESS': TokenType.ACCESS,
  'MODE': TokenType.MODE,
  'DYNAMIC': TokenType.DYNAMIC,
  'RANDOM': TokenType.RANDOM,
  'RECORD': TokenType.RECORD,
  'KEY': TokenType.KEY,
  'STATUS': TokenType.STATUS,

  'DATA': TokenType.DATA,
  'FILE': TokenType.FILE,
  'FD': TokenType.FD,
  'WORKING-STORAGE': TokenType.WORKING_STORAGE,
  'LINKAGE': TokenType.LINKAGE,
  'SECTION': TokenType.SECTION,
  // CICS MAP SECTION (SIMULATED)
  'MAP': TokenType.MAP_SECTION, 
  
  'PROCEDURE': TokenType.PROCEDURE,
  'PIC': TokenType.PIC,
  'VALUE': TokenType.VALUE,
  
  'MOVE': TokenType.MOVE,
  'ADD': TokenType.ADD,
  'SUBTRACT': TokenType.SUBTRACT,
  'MULTIPLY': TokenType.MULTIPLY,
  'DIVIDE': TokenType.DIVIDE,
  'COMPUTE': TokenType.COMPUTE,
  'TO': TokenType.TO,
  'FROM': TokenType.FROM,
  'BY': TokenType.BY,
  'INTO': TokenType.INTO,
  
  'IF': TokenType.IF,
  'THEN': TokenType.THEN,
  'ELSE': TokenType.ELSE,
  'END-IF': TokenType.END_IF,
  
  'PERFORM': TokenType.PERFORM,
  'UNTIL': TokenType.UNTIL,
  'TIMES': TokenType.TIMES,
  'END-PERFORM': TokenType.END_PERFORM,
  
  'ACCEPT': TokenType.ACCEPT,
  'DISPLAY': TokenType.DISPLAY,
  'STOP': TokenType.STOP,
  'RUN': TokenType.RUN,
  'CALL': TokenType.CALL,
  'USING': TokenType.USING,
  'EXIT': TokenType.EXIT,
  'PROGRAM': TokenType.PROGRAM,
  'GOBACK': TokenType.GOBACK,

  'OPEN': TokenType.OPEN,
  'CLOSE': TokenType.CLOSE,
  'READ': TokenType.READ,
  'WRITE': TokenType.WRITE,
  'REWRITE': TokenType.REWRITE,
  'DELETE': TokenType.DELETE,
  'START': TokenType.START,
  'INPUT': TokenType.INPUT,
  'OUTPUT': TokenType.OUTPUT,
  'I-O': TokenType.I_O,
  'EXTEND': TokenType.EXTEND,
  'AT': TokenType.AT,
  'END': TokenType.END,
  'INVALID': TokenType.INVALID,
  'NOT': TokenType.NOT,

  'EXEC': TokenType.EXEC,
  'CICS': TokenType.CICS,
  'END-EXEC': TokenType.END_EXEC,
  'SEND': TokenType.SEND,
  'RECEIVE': TokenType.RECEIVE,
  // 'MAP': TokenType.MAP, // Collision with MAP SECTION, handled in context
  'MAPSET': TokenType.MAPSET,
  'TRANSID': TokenType.TRANSID,
  'COMMAREA': TokenType.COMMAREA,
  'LENGTH': TokenType.LENGTH,
  'RIDFLD': TokenType.RIDFLD,
  'HANDLE': TokenType.HANDLE,
  'CONDITION': TokenType.CONDITION,
  'LINK': TokenType.LINK,
  'RETURN': TokenType.RETURN_CICS,
  
  // BMS Macros
  'DFHMDF': TokenType.DFHMDF,
  'POS': TokenType.POS,
  'NAME': TokenType.NAME,

  'ZERO': TokenType.ZERO,
  'ZEROS': TokenType.ZERO,
  'ZEROES': TokenType.ZERO,
  'SPACE': TokenType.SPACE,
  'SPACES': TokenType.SPACE,
  'IS': TokenType.IS
};

export class Lexer {
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  private isAlphaNumeric(char: string): boolean {
    return /^[a-zA-Z0-9\-_]+$/.test(char);
  }

  private isDigit(char: string): boolean {
    return /^[0-9]+$/.test(char);
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    const lines = this.source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineNum = i + 1;

      if (rawLine.length < 7) continue;

      const indicator = rawLine[6];
      if (indicator === '*' || indicator === '/') continue; 

      const maxCol = Math.min(rawLine.length, 72);
      if (rawLine.length <= 7) continue;

      const lineContent = rawLine.substring(7, maxCol);
      
      let pos = 0;
      while (pos < lineContent.length) {
        const char = lineContent[pos];
        const currentColumn = pos + 8; 

        if (/\s/.test(char)) {
          pos++;
          continue;
        }

        // Punctuation
        if (char === '.') { tokens.push({ type: TokenType.DOT, value: '.', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === '(') { tokens.push({ type: TokenType.LPAREN, value: '(', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === ')') { tokens.push({ type: TokenType.RPAREN, value: ')', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === ':') { tokens.push({ type: TokenType.COLON, value: ':', line: lineNum, column: currentColumn }); pos++; continue; }
        
        // Relational
        if (char === '=') { tokens.push({ type: TokenType.EQUALS, value: '=', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === '>') { tokens.push({ type: TokenType.GREATER, value: '>', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === '<') { tokens.push({ type: TokenType.LESS, value: '<', line: lineNum, column: currentColumn }); pos++; continue; }

        // Arithmetic
        if (char === '+') { tokens.push({ type: TokenType.PLUS, value: '+', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === '-') { tokens.push({ type: TokenType.MINUS, value: '-', line: lineNum, column: currentColumn }); pos++; continue; }
        if (char === '*') {
          if (pos + 1 < lineContent.length && lineContent[pos+1] === '*') {
            tokens.push({ type: TokenType.POWER, value: '**', line: lineNum, column: currentColumn }); pos += 2;
          } else {
            tokens.push({ type: TokenType.ASTERISK, value: '*', line: lineNum, column: currentColumn }); pos++;
          }
          continue;
        }
        if (char === '/') { tokens.push({ type: TokenType.SLASH, value: '/', line: lineNum, column: currentColumn }); pos++; continue; }

        // String Literals
        if (char === '"' || char === "'") {
          const quote = char;
          let value = quote;
          pos++; 
          while (pos < lineContent.length && lineContent[pos] !== quote) {
            value += lineContent[pos];
            pos++;
          }
          if (pos < lineContent.length) { value += lineContent[pos]; pos++; } 
          else { throw new Error(`IGYPS2002-S String literal not closed at Line ${lineNum}, Column ${currentColumn}`); }
          tokens.push({ type: TokenType.LITERAL_STRING, value, line: lineNum, column: currentColumn });
          continue;
        }

        // Words
        const isSign = (char === '+' || char === '-');
        const nextIsDigit = (pos + 1 < lineContent.length && this.isDigit(lineContent[pos+1]));

        if (this.isAlphaNumeric(char) || (isSign && nextIsDigit)) {
          let value = char;
          pos++;
          while (pos < lineContent.length) {
             const c = lineContent[pos];
             const isDecimalDot = (c === '.' && pos + 1 < lineContent.length && this.isDigit(lineContent[pos+1]));
             if (this.isAlphaNumeric(c) || isDecimalDot) { value += c; pos++; } else { break; }
          }
          
          const upperValue = value.toUpperCase();
          const isNumber = /^[\+\-]?[0-9]+(\.[0-9]+)?$/.test(upperValue);

          if (isNumber) {
             tokens.push({ type: TokenType.LITERAL_NUMBER, value: upperValue, line: lineNum, column: currentColumn });
          } else if (KEYWORDS[upperValue] !== undefined) {
             // Context check for MAP
             if (upperValue === 'MAP') {
                tokens.push({ type: TokenType.MAP, value: upperValue, line: lineNum, column: currentColumn });
             } else {
                tokens.push({ type: KEYWORDS[upperValue], value: upperValue, line: lineNum, column: currentColumn });
             }
          } else {
             tokens.push({ type: TokenType.IDENTIFIER, value: upperValue, line: lineNum, column: currentColumn });
          }
          continue;
        }

        throw new Error(`IGYPS2002-S Illegal character '${char}' at Line ${lineNum}, Column ${currentColumn}`);
      }
    }
    tokens.push({ type: TokenType.EOF, value: 'EOF', line: lines.length + 1, column: 0 });
    return tokens;
  }
}
