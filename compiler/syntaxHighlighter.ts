
import { TokenType, Token } from './types';

export class SyntaxHighlighter {

  /**
   * Returns the CSS class for a given TokenType.
   */
  public static getTokenClass(type: TokenType): string {
    switch (type) {
      // Structure & Headers (Blue/Bold)
      case TokenType.IDENTIFICATION:
      case TokenType.DIVISION:
      case TokenType.PROGRAM_ID:
      case TokenType.ENVIRONMENT:
      case TokenType.DATA:
      case TokenType.WORKING_STORAGE:
      case TokenType.SECTION:
      case TokenType.PROCEDURE:
        return 'text-blue-400 font-bold';

      // Verbs (Cyan/Bold)
      case TokenType.MOVE:
      case TokenType.ADD:
      case TokenType.SUBTRACT:
      case TokenType.MULTIPLY:
      case TokenType.DIVIDE:
      case TokenType.COMPUTE:
      case TokenType.IF:
      case TokenType.THEN:
      case TokenType.ELSE:
      case TokenType.END_IF:
      case TokenType.PERFORM:
      case TokenType.UNTIL:
      case TokenType.TIMES:
      case TokenType.END_PERFORM:
      case TokenType.ACCEPT:
      case TokenType.DISPLAY:
      case TokenType.STOP:
      case TokenType.RUN:
        return 'text-cyan-300 font-bold';

      // Keywords / Connectors (White/Dim)
      case TokenType.TO:
      case TokenType.FROM:
      case TokenType.BY:
      case TokenType.INTO:
      case TokenType.GIVING:
      case TokenType.VALUE:
      case TokenType.PIC:
        return 'text-purple-300';

      // Constants (Yellow/Dim)
      case TokenType.ZERO:
      case TokenType.SPACE:
        return 'text-yellow-500 italic';

      // Literals
      case TokenType.LITERAL_STRING:
        return 'text-green-400';
      case TokenType.LITERAL_NUMBER:
        return 'text-yellow-300';

      // Operators
      case TokenType.EQUALS:
      case TokenType.GREATER:
      case TokenType.LESS:
      case TokenType.PLUS:
      case TokenType.MINUS:
      case TokenType.ASTERISK:
      case TokenType.SLASH:
      case TokenType.POWER:
        return 'text-white font-bold';

      // Identifiers
      case TokenType.IDENTIFIER:
        return 'text-gray-100';

      // Punctuation
      case TokenType.DOT:
        return 'text-white font-bold';
      
      default:
        return 'text-gray-400';
    }
  }

  /**
   * Groups tokens by line number for easier rendering.
   */
  public static groupTokensByLine(tokens: Token[], totalLines: number): Token[][] {
    const lines: Token[][] = Array.from({ length: totalLines + 1 }, () => []);
    
    for (const token of tokens) {
      if (token.line <= totalLines) {
        lines[token.line].push(token);
      }
    }
    
    // Sort tokens in each line by column to ensure correct rendering order
    lines.forEach(line => line.sort((a, b) => a.column - b.column));
    
    return lines;
  }
}
