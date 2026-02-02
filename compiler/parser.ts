
import { 
  Token, TokenType, ProgramNode, DataDivisionNode, ProcedureDivisionNode, 
  VariableDeclarationNode, StatementNode, ConditionNode, ExpressionNode, ASTNode 
} from './types';

interface ParserContext {
  currentDivision: TokenType | null;
  ifStack: number;
  performStack: number;
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  
  // 1. Context State
  private context: ParserContext = {
    currentDivision: null,
    ifStack: 0,
    performStack: 0
  };

  // 2. Structural AST State
  private astStack: ASTNode[] = [];
  private rootAST: ASTNode | null = null;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // --- AST Building Helpers ---

  // REVISION: Added optional startToken to fix AST alignment (e.g., IF starting at condition)
  private startNode(type: string, startToken?: Token) {
    const token = startToken || this.peek(); 
    // If we are at EOF, use previous line
    const startLine = token.type === TokenType.EOF ? (this.previous().line || 1) : token.line;

    const node: ASTNode = {
      type,
      startLine,
      endLine: startLine, // Temporary, updated on exit
      children: []
    };

    if (this.astStack.length > 0) {
      const parent = this.astStack[this.astStack.length - 1];
      parent.children.push(node);
    } else {
      this.rootAST = node;
    }

    this.astStack.push(node);
  }

  private endNode() {
    if (this.astStack.length > 0) {
      const node = this.astStack.pop();
      if (node) {
        // Use previous token line as end line, because 'current' is usually ahead by one after consumption
        node.endLine = this.previous().line;
      }
    }
  }

  // --- Core Parser Methods ---

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
    // Reset Context & AST
    this.context = { currentDivision: null, ifStack: 0, performStack: 0 };
    this.astStack = [];
    this.rootAST = null;

    this.startNode('Program');

    this.startNode('IdentificationDivision');
    this.context.currentDivision = TokenType.IDENTIFICATION;
    this.consume(TokenType.IDENTIFICATION, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    this.consume(TokenType.PROGRAM_ID, "Program-ID Paragraph");
    this.consume(TokenType.DOT, "End of statement");
    const programId = this.consume(TokenType.IDENTIFIER, "Program Name").value;
    this.consume(TokenType.DOT, "End of statement");
    this.endNode(); // End ID Division

    // Optional Environment Division
    if (this.match(TokenType.ENVIRONMENT)) {
        this.context.currentDivision = TokenType.ENVIRONMENT;
        this.consume(TokenType.DIVISION, "Division Header");
        this.consume(TokenType.DOT, "End of statement");
        // Consume until Data or Procedure
        while (!this.check(TokenType.DATA) && !this.check(TokenType.PROCEDURE) && !this.isAtEnd()) {
            this.advance();
        }
    }

    const dataDivision = this.parseDataDivision();
    const procedureDivision = this.parseProcedureDivision();

    this.endNode(); // End Program

    return {
      type: 'Program',
      id: programId,
      dataDivision,
      procedureDivision,
      debugAST: this.rootAST || undefined
    };
  }

  private parseDataDivision(): DataDivisionNode {
    this.startNode('DataDivision');
    this.context.currentDivision = TokenType.DATA;
    this.consume(TokenType.DATA, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    this.startNode('WorkingStorageSection');
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

    this.endNode(); // End WorkingStorage
    this.endNode(); // End DataDivision

    return { variables };
  }

  private parseProcedureDivision(): ProcedureDivisionNode {
    this.startNode('ProcedureDivision');
    this.context.currentDivision = TokenType.PROCEDURE;
    this.consume(TokenType.PROCEDURE, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");

    const statements: StatementNode[] = [];
    while (!this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
    }

    this.endNode(); // End ProcedureDivision

    return { statements };
  }

  private parseStatement(): StatementNode | null {
    // PASS 3: Context-Aware Semantic Validation
    // Check for orphaned control flow keywords before checking for valid statements
    
    if (this.check(TokenType.ELSE)) {
        if (this.context.ifStack === 0) {
            this.error(this.peek(), "IGYPS2120-S 'ELSE' phrase not expected. No active 'IF' statement");
        }
        return null; 
    }

    if (this.check(TokenType.END_IF)) {
        if (this.context.ifStack === 0) {
            this.error(this.peek(), "IGYPS2120-S 'END-IF' phrase not expected. No active 'IF' statement");
        }
        return null; // Let the caller (parseIf) handle it
    }

    if (this.check(TokenType.END_PERFORM)) {
        if (this.context.performStack === 0) {
            this.error(this.peek(), "IGYPS2120-S 'END-PERFORM' phrase not expected. No active 'PERFORM' statement");
        }
        return null; // Let the caller (parsePerform) handle it
    }
    
    // Valid Statements
    if (this.match(TokenType.MOVE)) return this.parseMove();
    if (this.match(TokenType.ADD)) return this.parseMath('ADD');
    if (this.match(TokenType.SUBTRACT)) return this.parseMath('SUBTRACT');
    if (this.match(TokenType.COMPUTE)) return this.parseCompute();
    if (this.match(TokenType.DISPLAY)) return this.parseDisplay();
    if (this.match(TokenType.ACCEPT)) return this.parseAccept();
    if (this.match(TokenType.IF)) return this.parseIf();
    if (this.match(TokenType.PERFORM)) return this.parsePerform();
    if (this.match(TokenType.STOP)) {
        this.startNode('Statement', this.previous());
        this.consume(TokenType.RUN, "RUN after STOP");
        this.consume(TokenType.DOT, "End of statement");
        this.endNode();
        return { type: 'STOP_RUN' };
    }
    
    // Bare dots are allowed (Empty Statements) and consumed
    if (this.match(TokenType.DOT)) return null; 
    
    // REVISION: THEN should NOT be consumed or ignored here. 
    // It is only valid inside parseIf. If found here, it's an error.
    if (this.check(TokenType.THEN)) {
         this.error(this.peek(), "IGYPS2120-S 'THEN' phrase not expected. No active 'IF' statement or misplaced");
    }

    // If we are here, we found a token that is not a start of a statement
    // and not a valid terminator in the current context.
    this.error(this.peek(), "IGYPS2072-S Invalid statement or unexpected token");
  }

  private parseMove(): StatementNode {
      this.startNode('Statement', this.previous());
      const value = this.parseValue();
      this.consume(TokenType.TO, "Keyword TO");
      const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      this.match(TokenType.DOT); 
      this.endNode();
      return { type: 'MOVE', source: value, target };
  }

  private parseMath(type: 'ADD' | 'SUBTRACT'): StatementNode {
      this.startNode('Statement', this.previous());
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
      this.endNode();
      return { type, value, target };
  }

  private parseCompute(): StatementNode {
    this.startNode('Statement', this.previous());
    const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
    // Skip ROUNDED
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'ROUNDED') this.advance();
    this.consume(TokenType.EQUALS, "=");
    const expression = this.parseExpression();
    this.match(TokenType.DOT);
    this.endNode();
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

    this.error(this.peek(), "Expected Expression");
  }

  private parseDisplay(): StatementNode {
      this.startNode('Statement', this.previous());
      const values: (string | number)[] = [];
      let safetyCounter = 0;
      do {
          values.push(this.parseValue());
          safetyCounter++;
          if (safetyCounter > 50) this.error(this.peek(), "Display statement too long or missing terminator");
      } while (!this.check(TokenType.DOT) && !this.check(TokenType.END_IF) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_PERFORM) && !this.isAtEnd() && !this.isKeyword(this.peek().type));
      
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'DISPLAY', values };
  }

  private parseAccept(): StatementNode {
      this.startNode('Statement', this.previous());
      const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'ACCEPT', target };
  }

  private parseIf(): StatementNode {
      this.context.ifStack++;
      // REVISION: Use previous() (the IF token) to start the node, otherwise it starts at condition.
      this.startNode('IfStatement', this.previous());
      try {
          const condition = this.parseCondition();
          
          if (this.match(TokenType.THEN)) {
              // Optional THEN
          }

          const thenBody: StatementNode[] = [];
          let terminatedByDot = false;

          // Body Loop
          while (!this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
              // REVISION: Check if we are ALREADY at a dot before trying to parse a statement
              // This handles the case where the previous statement consumed its dot, or there is a bare dot.
              if (this.check(TokenType.DOT)) {
                  this.consume(TokenType.DOT, "Terminating Dot");
                  terminatedByDot = true;
                  break;
              }

              const s = this.parseStatement();
              if (s) {
                  thenBody.push(s);
                  // Check if the statement we just parsed consumed a dot
                  if (this.previous().type === TokenType.DOT) {
                      terminatedByDot = true;
                      break;
                  }
              } else {
                  // parseStatement returned null (likely a bare dot was consumed inside it)
                  if (this.previous().type === TokenType.DOT) {
                      terminatedByDot = true;
                  }
                  break; 
              }
          }

          let elseBody: StatementNode[] | undefined = undefined;
          
          // Only enter ELSE if not terminated by period
          if (!terminatedByDot && this.match(TokenType.ELSE)) {
              elseBody = [];
              while (!this.check(TokenType.END_IF) && !this.isAtEnd()) {
                 if (this.check(TokenType.DOT)) {
                    this.consume(TokenType.DOT, "Terminating Dot");
                    terminatedByDot = true;
                    break;
                 }

                 const s = this.parseStatement();
                 if (s) {
                     elseBody.push(s);
                     if (this.previous().type === TokenType.DOT) {
                         terminatedByDot = true;
                         break;
                     }
                 } else {
                     if (this.previous().type === TokenType.DOT) {
                         terminatedByDot = true;
                     }
                     break;
                 }
              }
          }

          if (terminatedByDot) {
             this.endNode();
             return { type: 'IF', condition, thenBody, elseBody };
          }

          if (this.match(TokenType.END_IF)) {
              this.match(TokenType.DOT);
          } else {
              // Implicit termination checking
              if (this.previous().type !== TokenType.DOT) {
                  this.match(TokenType.DOT); 
              }
          }

          this.endNode();
          return { type: 'IF', condition, thenBody, elseBody };
      } finally {
          this.context.ifStack--;
      }
  }

  private parsePerform(): StatementNode {
      this.context.performStack++;
      this.startNode('PerformStatement', this.previous());
      try {
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
              // REVISION: Only push if s is valid. 
              // If parseStatement returns null (bare dot), loop continues and checks END_PERFORM again.
              if (s) body.push(s);
          }
          this.consume(TokenType.END_PERFORM, "Keyword END-PERFORM");
          this.match(TokenType.DOT);

          this.endNode();
          return { type: 'PERFORM', body, until, times };
      } finally {
          this.context.performStack--;
      }
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
