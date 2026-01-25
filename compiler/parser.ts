
import { 
  Token, TokenType, ProgramNode, DataDivisionNode, ProcedureDivisionNode, 
  VariableDeclarationNode, StatementNode, ConditionNode, ExpressionNode 
} from './types';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private error(token: Token, message: string): never {
    const found = token.type === TokenType.EOF ? 'EOF' : `'${token.value}'`;
    throw new Error(`IGYPS2120-S Syntax Error at Line ${token.line}, Column ${token.column}: ${message}. Found ${found}.`);
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    this.error(this.peek(), `Expected ${TokenType[type]} (${message})`);
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  // --- Parsing Logic ---

  public parse(): ProgramNode {
    this.consume(TokenType.IDENTIFICATION, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    this.consume(TokenType.PROGRAM_ID, "Program-ID Paragraph");
    this.consume(TokenType.DOT, "End of statement");
    const programId = this.consume(TokenType.IDENTIFIER, "Program Name").value;
    this.consume(TokenType.DOT, "End of statement");

    // Optional Environment Division
    if (this.match(TokenType.ENVIRONMENT)) {
        this.consume(TokenType.DIVISION, "Division Header");
        this.consume(TokenType.DOT, "End of statement");
        // Consume until Data or Procedure
        while (!this.check(TokenType.DATA) && !this.check(TokenType.PROCEDURE) && !this.isAtEnd()) {
            this.advance();
        }
    }

    const dataDivision = this.parseDataDivision();
    const procedureDivision = this.parseProcedureDivision();

    return {
      type: 'Program',
      id: programId,
      dataDivision,
      procedureDivision
    };
  }

  private parseDataDivision(): DataDivisionNode {
    this.consume(TokenType.DATA, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    this.consume(TokenType.WORKING_STORAGE, "Section Header");
    this.consume(TokenType.SECTION, "Section Header");
    this.consume(TokenType.DOT, "End of statement");

    const variables: VariableDeclarationNode[] = [];

    while (this.check(TokenType.LITERAL_NUMBER)) {
       const levelToken = this.advance(); 
       const level = parseInt(levelToken.value, 10);
       
       const name = this.consume(TokenType.IDENTIFIER, "Variable Name").value;
       
       this.consume(TokenType.PIC, "PIC Clause");
       
       let picType: 'X' | '9' = 'X';
       let picLength = 0;
       
       let picStr = "";
       // Consume PIC string until VALUE, DOT or EOF
       while (!this.check(TokenType.VALUE) && !this.check(TokenType.DOT) && !this.isAtEnd()) {
          picStr += this.advance().value;
       }

       if (picStr.includes('X') || picStr.includes('A')) {
           picType = 'X';
           if (picStr.includes('(')) {
               const match = /\((\d+)\)/.exec(picStr);
               picLength = match ? parseInt(match[1]) : 1;
           } else {
               picLength = picStr.length; 
           }
       } else if (picStr.includes('9')) {
           picType = '9';
           if (picStr.includes('(')) {
               const match = /\((\d+)\)/.exec(picStr);
               picLength = match ? parseInt(match[1]) : 1;
           } else {
               picLength = picStr.length; 
           }
       } else {
           picType = 'X';
           picLength = picStr.length || 1; 
       }

       let defaultValue: string | number | undefined;

       // Parse VALUE clause
       if (this.match(TokenType.VALUE)) {
           // Skip optional 'IS'
           if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'IS') {
              this.advance();
           }

           if (this.match(TokenType.LITERAL_STRING)) {
               defaultValue = this.previous().value;
           } else if (this.match(TokenType.LITERAL_NUMBER)) {
               // Number() handles integer, float, and signs (e.g. -12.50)
               defaultValue = Number(this.previous().value);
           } else if (this.match(TokenType.ZERO)) {
               defaultValue = 0;
           } else if (this.match(TokenType.SPACE)) {
               defaultValue = " ";
           } else {
               this.error(this.peek(), "Expected Literal, ZERO, or SPACE after VALUE");
           }
       }

       this.consume(TokenType.DOT, "End of variable declaration");

       variables.push({
           level,
           name,
           picType,
           picLength,
           defaultValue
       });
    }

    return { variables };
  }

  private parseProcedureDivision(): ProcedureDivisionNode {
    this.consume(TokenType.PROCEDURE, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");

    const statements: StatementNode[] = [];
    while (!this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
    }

    return { statements };
  }

  private parseStatement(): StatementNode | null {
    if (this.match(TokenType.MOVE)) return this.parseMove();
    if (this.match(TokenType.ADD)) return this.parseMath('ADD');
    if (this.match(TokenType.SUBTRACT)) return this.parseMath('SUBTRACT');
    if (this.match(TokenType.COMPUTE)) return this.parseCompute();
    if (this.match(TokenType.DISPLAY)) return this.parseDisplay();
    if (this.match(TokenType.ACCEPT)) return this.parseAccept();
    if (this.match(TokenType.IF)) return this.parseIf();
    if (this.match(TokenType.PERFORM)) return this.parsePerform();
    if (this.match(TokenType.STOP)) {
        this.consume(TokenType.RUN, "RUN after STOP");
        this.consume(TokenType.DOT, "End of statement");
        return { type: 'STOP_RUN' };
    }
    
    if (this.match(TokenType.DOT)) return null; 
    if (this.match(TokenType.THEN)) return null; // Handle stray THEN if it occurs

    this.error(this.peek(), "Unexpected token or unknown statement");
  }

  private parseMove(): StatementNode {
      const value = this.parseValue();
      this.consume(TokenType.TO, "Keyword TO");
      const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      this.match(TokenType.DOT); 
      return { type: 'MOVE', source: value, target };
  }

  private parseMath(type: 'ADD' | 'SUBTRACT'): StatementNode {
      const value = this.parseValue();
      let target = "";
      
      if (type === 'ADD') {
          this.consume(TokenType.TO, "Keyword TO");
          target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      } else {
          this.consume(TokenType.FROM, "Keyword FROM");
          target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      }
      this.match(TokenType.DOT);
      return { type, value, target };
  }

  private parseCompute(): StatementNode {
    const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
    
    // Optional ROUNDED logic can be added here if needed, for now skip if present
    // if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'ROUNDED') this.advance();
    
    this.consume(TokenType.EQUALS, "=");
    
    const expression = this.parseExpression();
    
    this.match(TokenType.DOT);
    return { type: 'COMPUTE', target, expression };
  }

  private parseExpression(): ExpressionNode {
    let left = this.parseTerm();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const operator = this.advance().type;
      const right = this.parseTerm();
      left = { type: 'Binary', left, operator, right };
    }
    return left;
  }

  private parseTerm(): ExpressionNode {
    let left = this.parseFactor();

    while (this.check(TokenType.ASTERISK) || this.check(TokenType.SLASH)) {
      const operator = this.advance().type;
      const right = this.parseFactor();
      left = { type: 'Binary', left, operator, right };
    }
    return left;
  }

  private parseFactor(): ExpressionNode {
    let left = this.parsePrimary();

    while (this.check(TokenType.POWER)) {
      const operator = this.advance().type;
      const right = this.parsePrimary();
      left = { type: 'Binary', left, operator, right };
    }
    return left;
  }

  private parsePrimary(): ExpressionNode {
    if (this.match(TokenType.LITERAL_NUMBER)) {
      return { type: 'Literal', value: Number(this.previous().value) };
    }
    if (this.match(TokenType.IDENTIFIER)) {
      return { type: 'Variable', name: this.previous().value };
    }
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, ")");
      return expr;
    }
    if (this.match(TokenType.MINUS)) {
      const right = this.parsePrimary();
      return { type: 'Unary', operator: TokenType.MINUS, right };
    }

    this.error(this.peek(), "Expected Expression (Number, Identifier, or '(')");
  }

  private parseDisplay(): StatementNode {
      const values: (string | number)[] = [];
      do {
          values.push(this.parseValue());
      } while (!this.check(TokenType.DOT) && !this.check(TokenType.END_IF) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_PERFORM) && !this.isAtEnd() && !this.isKeyword(this.peek().type));
      
      this.match(TokenType.DOT);
      return { type: 'DISPLAY', values };
  }

  private parseAccept(): StatementNode {
      const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      this.match(TokenType.DOT);
      return { type: 'ACCEPT', target };
  }

  private parseIf(): StatementNode {
      const condition = this.parseCondition();
      
      // Handle optional THEN
      if (this.match(TokenType.THEN)) {
          // Consumed
      }

      const thenBody: StatementNode[] = [];
      let terminatedByDot = false;

      // Parse statements until ELSE, END-IF, DOT, or EOF
      // Note: We check for keywords to avoid parsing them as statements if they appear
      while (!this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.check(TokenType.DOT) && !this.isAtEnd()) {
          const s = this.parseStatement();
          if (s) {
              thenBody.push(s);
              // If the statement consumed a DOT, it terminates the scope (and all parent scopes)
              if (this.previous().type === TokenType.DOT) {
                  terminatedByDot = true;
                  break;
              }
          }
      }

      let elseBody: StatementNode[] | undefined = undefined;
      
      // If we hit a DOT in the THEN body, the IF is closed. We must NOT parse ELSE.
      if (!terminatedByDot && this.match(TokenType.ELSE)) {
          elseBody = [];
          while (!this.check(TokenType.END_IF) && !this.check(TokenType.DOT) && !this.isAtEnd()) {
             const s = this.parseStatement();
             if (s) {
                 elseBody.push(s);
                 // If the statement consumed a DOT, it terminates the scope
                 if (this.previous().type === TokenType.DOT) {
                     terminatedByDot = true;
                     break;
                 }
             }
          }
      }

      if (terminatedByDot) {
         // IF statement was implicitly closed by a period in one of its bodies.
         return { type: 'IF', condition, thenBody, elseBody };
      }

      if (this.match(TokenType.END_IF)) {
          // Explicit scope terminator
          this.match(TokenType.DOT); // Optional period after END-IF
      } else {
          // Implicit termination (or EOF) by a DOT outside the body statements
          if (this.previous().type !== TokenType.DOT) {
              this.match(TokenType.DOT);
          }
      }

      return { type: 'IF', condition, thenBody, elseBody };
  }

  private parsePerform(): StatementNode {
      let until: ConditionNode | undefined;
      let times: number | string | undefined;

      if (this.match(TokenType.UNTIL)) {
          until = this.parseCondition();
      } else if (this.check(TokenType.LITERAL_NUMBER) || this.check(TokenType.IDENTIFIER)) {
          const val = this.parseValue();
          if (this.match(TokenType.TIMES) || (this.previous().value === 'TIMES')) {
              times = val;
          }
      }

      const body: StatementNode[] = [];
      while (!this.check(TokenType.END_PERFORM) && !this.isAtEnd()) {
          const s = this.parseStatement();
          if (s) body.push(s);
      }
      this.consume(TokenType.END_PERFORM, "Keyword END-PERFORM");
      this.match(TokenType.DOT);

      return { type: 'PERFORM', body, until, times };
  }

  private parseCondition(): ConditionNode {
      const left = this.parseValue();
      let operator: '=' | '>' | '<' = '=';
      
      if (this.match(TokenType.EQUALS)) operator = '=';
      else if (this.match(TokenType.GREATER)) operator = '>';
      else if (this.match(TokenType.LESS)) operator = '<';
      else this.error(this.peek(), "Expected Logical Operator (=, >, <)");

      const right = this.parseValue();
      return { left, operator, right };
  }

  private parseValue(): string | number {
      if (this.match(TokenType.LITERAL_NUMBER)) {
          return Number(this.previous().value);
      }
      if (this.match(TokenType.LITERAL_STRING)) {
          return this.previous().value;
      }
      if (this.match(TokenType.IDENTIFIER)) {
          return this.previous().value;
      }
      this.error(this.peek(), "Expected Value (Literal or Identifier)");
  }

  private isKeyword(type: TokenType): boolean {
      return type >= TokenType.MOVE && type <= TokenType.RUN;
  }
}
