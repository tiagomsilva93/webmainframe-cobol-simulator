
import { Token, TokenType } from './types';

const KEYWORDS: Record<string, TokenType> = {
  'IDENTIFICATION': TokenType.IDENTIFICATION,
  'DIVISION': TokenType.DIVISION,
  'PROGRAM-ID': TokenType.PROGRAM_ID,
  'ENVIRONMENT': TokenType.ENVIRONMENT,
  'DATA': TokenType.DATA,
  'WORKING-STORAGE': TokenType.WORKING_STORAGE,
  'SECTION': TokenType.SECTION,
  'PROCEDURE': TokenType.PROCEDURE,
  'PIC': TokenType.PIC,
  'VALUE': TokenType.VALUE,
  'MOVE': TokenType.MOVE,
  'ADD': TokenType.ADD,
  'SUBTRACT': TokenType.SUBTRACT,
  'COMPUTE': TokenType.COMPUTE,
  'TO': TokenType.TO,
  'FROM': TokenType.FROM,
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
  'ZERO': TokenType.ZERO,
  'ZEROS': TokenType.ZERO,
  'ZEROES': TokenType.ZERO,
  'SPACE': TokenType.SPACE,
  'SPACES': TokenType.SPACE
};

export class Lexer {
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  private isAlphaNumeric(char: string): boolean {
    return /^[a-zA-Z0-9\-]+$/.test(char);
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

      // Normalization Rule 1: Lines shorter than 7 chars are effectively empty in Fixed Format
      // (Area B starts at index 7 / col 8, but actually meaningful code starts at col 8 or 12)
      // We need to at least check index 6 (col 7)
      if (rawLine.length < 7) continue;

      // Normalization Rule 2: Column 7 (Index 6) is Indicator Area.
      const indicator = rawLine[6];
      if (indicator === '*' || indicator === '/') {
          // Comment Line - Ignore entire line
          continue; 
      }
      // Note: We are treating 'D' (debug) as normal code or ignoring.
      // We are currently NOT handling continuation '-' logic strictly merging lines,
      // but we ARE skipping the indicator column itself.

      // Normalization Rule 3: Process only Columns 8 thru 72 (Indices 7 to 71)
      // This strictly enforces the 80-column card image rule where 73-80 are ignored.
      const maxCol = Math.min(rawLine.length, 72);
      
      // If line is too short to have Area A/B content, skip
      if (rawLine.length <= 7) continue;

      const lineContent = rawLine.substring(7, maxCol);
      
      let pos = 0;
      while (pos < lineContent.length) {
        const char = lineContent[pos];

        // Calculate actual physical column number (1-based)
        // pos 0 in lineContent corresponds to index 7 in rawLine, which is Column 8.
        const currentColumn = pos + 8; 

        if (/\s/.test(char)) {
          pos++;
          continue;
        }

        // Handle Dot
        if (char === '.') {
          tokens.push({ type: TokenType.DOT, value: '.', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }

        // Handle Parens
        if (char === '(') {
          tokens.push({ type: TokenType.LPAREN, value: '(', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }
        if (char === ')') {
          tokens.push({ type: TokenType.RPAREN, value: ')', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }

        // Handle Relational Operators
        if (char === '=') {
          tokens.push({ type: TokenType.EQUALS, value: '=', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }
        if (char === '>') {
          tokens.push({ type: TokenType.GREATER, value: '>', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }
        if (char === '<') {
          tokens.push({ type: TokenType.LESS, value: '<', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }

        // Handle Arithmetic Operators
        if (char === '+') {
          tokens.push({ type: TokenType.PLUS, value: '+', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }
        if (char === '-') {
           // We check for Signed Numbers in the "Words" logic below.
           // However, if we are here, it means it wasn't captured as a signed number start.
           // E.g. "A - B", the space before - prevents it from being a signed number of previous token?
           // Actually, the "Words" logic below starts at 'char'.
           // If 'char' is '-', we check 'nextIsDigit'. If true, it's a number.
           // If false, it falls through to here. So this is safe for operator.
           tokens.push({ type: TokenType.MINUS, value: '-', line: lineNum, column: currentColumn });
           pos++;
           continue;
        }
        if (char === '*') {
          if (pos + 1 < lineContent.length && lineContent[pos+1] === '*') {
            tokens.push({ type: TokenType.POWER, value: '**', line: lineNum, column: currentColumn });
            pos += 2;
          } else {
            tokens.push({ type: TokenType.ASTERISK, value: '*', line: lineNum, column: currentColumn });
            pos++;
          }
          continue;
        }
        if (char === '/') {
          tokens.push({ type: TokenType.SLASH, value: '/', line: lineNum, column: currentColumn });
          pos++;
          continue;
        }

        // Handle String Literals
        if (char === '"' || char === "'") {
          const quote = char;
          let value = '';
          pos++; // skip quote
          
          while (pos < lineContent.length && lineContent[pos] !== quote) {
            value += lineContent[pos];
            pos++;
          }
          
          if (pos < lineContent.length) {
             pos++; // skip closing quote
          } else {
             throw new Error(`IGYPS2002-S String literal not closed at Line ${lineNum}, Column ${currentColumn}`);
          }
          
          tokens.push({ type: TokenType.LITERAL_STRING, value, line: lineNum, column: currentColumn });
          continue;
        }

        // Handle Words (Identifiers, Keywords, Numbers)
        const isSign = (char === '+' || char === '-');
        const nextIsDigit = (pos + 1 < lineContent.length && this.isDigit(lineContent[pos+1]));

        if (this.isAlphaNumeric(char) || (isSign && nextIsDigit)) {
          let value = char;
          pos++;

          while (pos < lineContent.length) {
             const c = lineContent[pos];
             // Allow dots only if followed by digit (decimal point)
             const isDecimalDot = (c === '.' && pos + 1 < lineContent.length && this.isDigit(lineContent[pos+1]));
             
             if (this.isAlphaNumeric(c) || isDecimalDot) {
                value += c;
                pos++;
             } else {
                break;
             }
          }
          
          const upperValue = value.toUpperCase();
          
          // Check for Number (Integer or Decimal, Signed or Unsigned)
          const isNumber = /^[\+\-]?[0-9]+(\.[0-9]+)?$/.test(upperValue);

          if (isNumber) {
             tokens.push({ type: TokenType.LITERAL_NUMBER, value: upperValue, line: lineNum, column: currentColumn });
          } else if (KEYWORDS[upperValue] !== undefined) {
             tokens.push({ type: KEYWORDS[upperValue], value: upperValue, line: lineNum, column: currentColumn });
          } else {
             tokens.push({ type: TokenType.IDENTIFIER, value: upperValue, line: lineNum, column: currentColumn });
          }
          continue;
        }

        // Unknown character
        throw new Error(`IGYPS2002-S Illegal character '${char}' at Line ${lineNum}, Column ${currentColumn}`);
      }
    }

    tokens.push({ type: TokenType.EOF, value: 'EOF', line: lines.length + 1, column: 0 });
    return tokens;
  }
}
