
import { 
  Token, TokenType, ProgramNode, EnvironmentDivisionNode, DataDivisionNode, ProcedureDivisionNode, 
  VariableDeclarationNode, StatementNode, ConditionNode, ExpressionNode, ASTNode,
  MoveStatement, MathStatement, ComputeStatement, DisplayStatement, AcceptStatement, 
  IfStatement, PerformStatement, StopRunStatement, CallStatement, ExitProgramStatement, GobackStatement,
  FileControlEntry, FileDescriptorNode, OpenStatement, CloseStatement, ReadStatement, WriteStatement,
  ExecCicsStatement, CicsCommandType, BMSMapDefinition, BMSField
} from './types';

interface ParserContext {
  currentDivision: TokenType | null;
  ifStack: number;
  performStack: number;
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  
  private context: ParserContext = {
    currentDivision: null,
    ifStack: 0,
    performStack: 0
  };

  private astStack: ASTNode[] = [];
  private rootAST: ASTNode | null = null;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // --- AST Building Helpers ---

  private startNode(type: string, startToken?: Token) {
    const token = startToken || this.peek(); 
    const startLine = token.type === TokenType.EOF ? (this.previous().line || 1) : token.line;
    const node: ASTNode = { type, startLine, endLine: startLine, children: [] };
    if (this.astStack.length > 0) {
      this.astStack[this.astStack.length - 1].children.push(node);
    } else {
      this.rootAST = node;
    }
    this.astStack.push(node);
  }

  private endNode() {
    if (this.astStack.length > 0) {
      const node = this.astStack.pop();
      if (node) node.endLine = this.previous().line;
    }
  }

  // --- Core Parser Methods ---

  private peek(): Token { return this.tokens[this.current]; }
  private check(type: TokenType): boolean { if (this.isAtEnd()) return false; return this.peek().type === type; }
  private previous(): Token { return this.tokens[this.current - 1]; }
  private advance(): Token { if (!this.isAtEnd()) this.current++; return this.previous(); }
  private isAtEnd(): boolean { return this.peek().type === TokenType.EOF; }
  
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
      if (this.check(type)) { this.advance(); return true; }
    }
    return false;
  }

  // --- Parsing Logic ---

  public parse(): ProgramNode {
    this.context = { currentDivision: null, ifStack: 0, performStack: 0 };
    this.astStack = [];
    this.rootAST = null;

    this.startNode('Program');

    this.parseIdentificationDivision();
    const environmentDivision = this.parseEnvironmentDivision();
    const dataDivision = this.parseDataDivision();
    const procedureDivision = this.parseProcedureDivision();

    this.endNode(); 

    return {
      type: 'Program',
      id: "UNKNOWN", 
      environmentDivision,
      dataDivision,
      procedureDivision,
      debugAST: this.rootAST || undefined
    };
  }

  private parseIdentificationDivision() {
    this.startNode('IdentificationDivision');
    this.context.currentDivision = TokenType.IDENTIFICATION;
    this.consume(TokenType.IDENTIFICATION, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    this.consume(TokenType.PROGRAM_ID, "Program-ID Paragraph");
    this.consume(TokenType.DOT, "End of statement");
    const programId = this.consume(TokenType.IDENTIFIER, "Program Name").value;
    this.consume(TokenType.DOT, "End of statement");
    this.endNode();
    (this.rootAST as any).programId = programId; 
  }

  private parseEnvironmentDivision(): EnvironmentDivisionNode | undefined {
    if (!this.match(TokenType.ENVIRONMENT)) return undefined;

    this.startNode('EnvironmentDivision', this.previous());
    this.context.currentDivision = TokenType.ENVIRONMENT;
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");

    if (this.match(TokenType.CONFIGURATION)) {
        this.consume(TokenType.SECTION, "Section Header");
        this.consume(TokenType.DOT, ".");
        while (!this.check(TokenType.INPUT_OUTPUT) && !this.check(TokenType.DATA) && !this.isAtEnd()) {
            this.advance();
        }
    }

    let fileControl: FileControlEntry[] = [];

    if (this.match(TokenType.INPUT_OUTPUT)) {
        this.startNode('InputOutputSection', this.previous());
        this.consume(TokenType.SECTION, "Section Header");
        this.consume(TokenType.DOT, ".");
        
        if (this.match(TokenType.FILE_CONTROL)) {
            this.consume(TokenType.DOT, ".");
            fileControl = this.parseFileControl();
        }
        this.endNode();
    }

    this.endNode();
    return { fileControl };
  }

  private parseFileControl(): FileControlEntry[] {
    const entries: FileControlEntry[] = [];
    
    while (this.match(TokenType.SELECT)) {
        const fileName = this.consume(TokenType.IDENTIFIER, "File Name").value;
        this.consume(TokenType.ASSIGN, "ASSIGN");
        if (this.check(TokenType.TO)) this.advance(); 
        let externalName = this.parseValue().toString();
        let organization: 'SEQUENTIAL' | 'INDEXED' = 'SEQUENTIAL';
        let accessMode: 'SEQUENTIAL' | 'RANDOM' | 'DYNAMIC' = 'SEQUENTIAL';
        let recordKey: string | undefined;
        let fileStatus: string | undefined;

        while (!this.check(TokenType.SELECT) && !this.check(TokenType.DATA) && !this.check(TokenType.PROCEDURE) && !this.isAtEnd()) {
            if (this.match(TokenType.ORGANIZATION)) {
                if (this.check(TokenType.IS)) this.advance();
                if (this.match(TokenType.LINE) || this.match(TokenType.SEQUENTIAL)) {
                     if (this.previous().type === TokenType.LINE) this.match(TokenType.SEQUENTIAL);
                     organization = 'SEQUENTIAL';
                } else if (this.match(TokenType.INDEXED)) {
                     organization = 'INDEXED';
                }
            } else if (this.match(TokenType.ACCESS)) {
                if (this.check(TokenType.MODE)) this.advance();
                if (this.check(TokenType.IS)) this.advance();
                if (this.match(TokenType.DYNAMIC)) accessMode = 'DYNAMIC';
                else if (this.match(TokenType.RANDOM)) accessMode = 'RANDOM';
                else if (this.match(TokenType.SEQUENTIAL)) accessMode = 'SEQUENTIAL';
            } else if (this.match(TokenType.RECORD)) {
                 if (this.match(TokenType.KEY)) {
                     if (this.check(TokenType.IS)) this.advance();
                     recordKey = this.consume(TokenType.IDENTIFIER, "Key Variable").value;
                 }
            } else if (this.match(TokenType.STATUS) || (this.check(TokenType.FILE) && this.peek().value === 'FILE')) {
                 if (this.match(TokenType.FILE)) this.match(TokenType.STATUS); 
                 else this.match(TokenType.STATUS); 
                 if (this.check(TokenType.IS)) this.advance();
                 fileStatus = this.consume(TokenType.IDENTIFIER, "Status Variable").value;
            } else if (this.match(TokenType.DOT)) {
                break;
            } else {
                this.advance(); 
            }
        }
        entries.push({ fileName, externalName, organization, accessMode, recordKey, fileStatus });
    }
    return entries;
  }

  private parseDataDivision(): DataDivisionNode {
    this.startNode('DataDivision');
    this.context.currentDivision = TokenType.DATA;
    this.consume(TokenType.DATA, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    this.consume(TokenType.DOT, "End of statement");
    
    let fileSection: FileDescriptorNode[] = [];
    if (this.match(TokenType.FILE)) {
        this.startNode('FileSection', this.previous());
        this.consume(TokenType.SECTION, "Section Header");
        this.consume(TokenType.DOT, ".");
        fileSection = this.parseFileSection();
        this.endNode();
    }

    let workingStorage: VariableDeclarationNode[] = [];
    if (this.match(TokenType.WORKING_STORAGE)) {
        this.startNode('WorkingStorageSection', this.previous());
        this.consume(TokenType.SECTION, "Section Header");
        this.consume(TokenType.DOT, ".");
        workingStorage = this.parseVariables();
        this.endNode();
    }

    let linkageSection: VariableDeclarationNode[] = [];
    if (this.match(TokenType.LINKAGE)) {
        this.startNode('LinkageSection', this.previous());
        this.consume(TokenType.SECTION, "Section Header");
        this.consume(TokenType.DOT, ".");
        linkageSection = this.parseVariables();
        this.endNode();
    }
    
    // New MAP SECTION (BMS Simulation)
    let mapSection: BMSMapDefinition[] = [];
    if (this.check(TokenType.MAP_SECTION) || (this.check(TokenType.MAP) && this.peek().value === 'MAP')) {
         if (this.match(TokenType.MAP_SECTION) || this.match(TokenType.MAP)) {
            this.startNode('MapSection', this.previous());
            this.consume(TokenType.SECTION, "Section Header");
            this.consume(TokenType.DOT, ".");
            mapSection = this.parseMapSection();
            this.endNode();
         }
    }

    this.endNode(); 
    return { fileSection, workingStorage, linkageSection, mapSection };
  }

  private parseFileSection(): FileDescriptorNode[] {
      const fds: FileDescriptorNode[] = [];
      while (this.match(TokenType.FD)) {
          const fileName = this.consume(TokenType.IDENTIFIER, "File Name").value;
          while (!this.check(TokenType.DOT) && !this.isAtEnd()) {
              this.advance();
          }
          this.consume(TokenType.DOT, ".");
          const vars = this.parseVariables(true); 
          if (vars.length > 0) {
             const record = vars[0];
             fds.push({ fileName, recordName: record.name, recordLength: record.picLength });
          }
      }
      return fds;
  }

  private parseVariables(stopAtFD: boolean = false): VariableDeclarationNode[] {
    const variables: VariableDeclarationNode[] = [];

    while (this.check(TokenType.LITERAL_NUMBER)) {
       const levelToken = this.advance(); 
       const level = parseInt(levelToken.value, 10);
       const name = this.consume(TokenType.IDENTIFIER, "Variable Name").value;
       this.consume(TokenType.PIC, "PIC Clause");
       
       let picType: 'X' | '9' = 'X';
       let picLength = 0;
       let picStr = "";
       while (!this.check(TokenType.VALUE) && !this.check(TokenType.DOT) && !this.isAtEnd()) {
          picStr += this.advance().value;
       }
       
       if (picStr.includes('X') || picStr.includes('A')) {
           picType = 'X';
           const match = /\((\d+)\)/.exec(picStr);
           picLength = match ? parseInt(match[1]) : picStr.length;
       } else {
           picType = '9';
           const match = /\((\d+)\)/.exec(picStr);
           picLength = match ? parseInt(match[1]) : picStr.length;
       }

       let defaultValue: string | number | undefined;
       if (this.match(TokenType.VALUE)) {
           if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'IS') this.advance();
           if (this.match(TokenType.LITERAL_STRING)) defaultValue = this.previous().value;
           else if (this.match(TokenType.LITERAL_NUMBER)) defaultValue = Number(this.previous().value);
           else if (this.match(TokenType.ZERO)) defaultValue = 0;
           else if (this.match(TokenType.SPACE)) defaultValue = " ";
       }
       this.consume(TokenType.DOT, ".");
       variables.push({ level, name, picType, picLength, defaultValue });
    }
    return variables;
  }

  // --- BMS Parsing ---
  private parseMapSection(): BMSMapDefinition[] {
      const maps: BMSMapDefinition[] = [];
      // FORMAT: MAPSET <NAME>. MAP <NAME>. DFHMDF ...
      
      while (this.match(TokenType.MAPSET)) {
          const mapsetName = this.consume(TokenType.IDENTIFIER, "Mapset Name").value;
          this.match(TokenType.DOT);
          
          while (this.check(TokenType.MAP) || (this.check(TokenType.IDENTIFIER) && this.peek().value === 'MAP')) {
              if (this.check(TokenType.IDENTIFIER)) this.advance(); // consume MAP if parsed as ID
              else this.match(TokenType.MAP);
              
              const mapName = this.consume(TokenType.IDENTIFIER, "Map Name").value;
              this.match(TokenType.DOT);
              
              const fields: BMSField[] = [];
              
              while (this.match(TokenType.DFHMDF)) {
                   let row = 1, col = 1, len = 0, name = "", init = "";
                   
                   // Parse POS(1,1)
                   if (this.match(TokenType.POS)) {
                       this.consume(TokenType.LPAREN, "(");
                       row = Number(this.parseValue());
                       this.match(TokenType.COLON) || this.consume(TokenType.IDENTIFIER, ","); // Using Identifier as comma hack or specific char?
                                                                                               // Actually, Lexer splits by space mostly. 
                                                                                               // Let's assume POS(ROW, COL) might be tokenized as POS, (, ROW, ,, COL, )
                                                                                               // Lexer doesn't have comma. Let's assume space separated POS (1 1) or simplified.
                       // Simplified BMS: POS(Row, Col) where comma is ignored or space
                       // My lexer emits tokens. 
                       // POS ( 1 1 ) 
                       if (this.check(TokenType.LITERAL_NUMBER)) col = Number(this.parseValue());
                       this.consume(TokenType.RPAREN, ")");
                   }

                   // Parse LENGTH=20 or LENGTH 20
                   if (this.match(TokenType.LENGTH)) {
                       if (this.check(TokenType.EQUALS)) this.advance();
                       len = Number(this.parseValue());
                   }
                   
                   // Parse NAME=XX
                   if (this.match(TokenType.NAME)) {
                       if (this.check(TokenType.EQUALS)) this.advance();
                       name = this.consume(TokenType.IDENTIFIER, "Field Name").value;
                   }
                   
                   // Parse INITIAL='VAL'
                   if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'INITIAL') {
                       this.advance();
                       if (this.check(TokenType.EQUALS)) this.advance();
                       init = String(this.parseValue());
                   }

                   this.consume(TokenType.DOT, ".");
                   fields.push({ name, row, col, length: len, initial: init });
              }
              maps.push({ mapsetName, mapName, fields });
          }
      }
      return maps;
  }

  // --- Procedure Division ---

  private parseProcedureDivision(): ProcedureDivisionNode {
    this.startNode('ProcedureDivision');
    this.context.currentDivision = TokenType.PROCEDURE;
    this.consume(TokenType.PROCEDURE, "Division Header");
    this.consume(TokenType.DIVISION, "Division Header");
    
    const usingParameters: string[] = [];
    if (this.match(TokenType.USING)) {
        do {
            usingParameters.push(this.consume(TokenType.IDENTIFIER, "Parameter Name").value);
        } while (this.check(TokenType.IDENTIFIER));
    }
    this.consume(TokenType.DOT, ".");

    const statements: StatementNode[] = [];
    while (!this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
    }
    this.endNode(); 
    return { statements, usingParameters };
  }

  private parseStatement(): StatementNode | null {
    if (this.check(TokenType.ELSE) || this.check(TokenType.END_IF) || this.check(TokenType.END_PERFORM) || this.check(TokenType.DOT)) {
        if (this.check(TokenType.DOT)) return null;
        return null;
    }

    const startToken = this.peek();

    if (this.match(TokenType.EXEC)) return { ...this.parseExecCics(), line: startToken.line };
    if (this.match(TokenType.OPEN)) return { ...this.parseOpen(), line: startToken.line };
    if (this.match(TokenType.CLOSE)) return { ...this.parseClose(), line: startToken.line };
    if (this.match(TokenType.READ)) return { ...this.parseRead(), line: startToken.line };
    if (this.match(TokenType.WRITE)) return { ...this.parseWrite(), line: startToken.line };
    
    if (this.match(TokenType.MOVE)) return { ...this.parseMove(), line: startToken.line };
    if (this.match(TokenType.ADD)) return { ...this.parseMath('ADD'), line: startToken.line };
    if (this.match(TokenType.SUBTRACT)) return { ...this.parseMath('SUBTRACT'), line: startToken.line };
    if (this.match(TokenType.MULTIPLY)) return { ...this.parseMath('MULTIPLY'), line: startToken.line };
    if (this.match(TokenType.DIVIDE)) return { ...this.parseMath('DIVIDE'), line: startToken.line };
    if (this.match(TokenType.COMPUTE)) return { ...this.parseCompute(), line: startToken.line };
    if (this.match(TokenType.DISPLAY)) return { ...this.parseDisplay(), line: startToken.line };
    if (this.match(TokenType.ACCEPT)) return { ...this.parseAccept(), line: startToken.line };
    if (this.match(TokenType.IF)) return { ...this.parseIf(), line: startToken.line };
    if (this.match(TokenType.PERFORM)) return { ...this.parsePerform(), line: startToken.line };
    if (this.match(TokenType.CALL)) return { ...this.parseCall(), line: startToken.line };
    
    if (this.match(TokenType.STOP)) {
        this.consume(TokenType.RUN, "RUN"); this.consume(TokenType.DOT, ".");
        return { type: 'STOP_RUN', line: startToken.line };
    }
    if (this.match(TokenType.GOBACK)) { this.match(TokenType.DOT); return { type: 'GOBACK', line: startToken.line }; }
    if (this.match(TokenType.EXIT)) { this.consume(TokenType.PROGRAM, "PROGRAM"); this.match(TokenType.DOT); return { type: 'EXIT_PROGRAM', line: startToken.line }; }

    this.advance(); 
    return null;
  }

  // --- CICS Parser ---

  private parseExecCics(): Omit<ExecCicsStatement, 'line'> {
      this.consume(TokenType.CICS, "CICS");
      
      let command: CicsCommandType | null = null;
      const params: Record<string, any> = {};

      // Determine Command
      if (this.match(TokenType.SEND)) {
          if (this.match(TokenType.MAP)) command = 'SEND_MAP';
      } else if (this.match(TokenType.RECEIVE)) {
           if (this.match(TokenType.MAP)) command = 'RECEIVE_MAP';
      } else if (this.match(TokenType.READ)) {
          command = 'READ';
      } else if (this.match(TokenType.WRITE)) {
          command = 'WRITE';
      } else if (this.match(TokenType.REWRITE)) {
          command = 'REWRITE';
      } else if (this.match(TokenType.DELETE)) {
          command = 'DELETE';
      } else if (this.match(TokenType.RETURN_CICS)) {
          command = 'RETURN';
      } else if (this.match(TokenType.LINK)) {
          command = 'LINK';
      } else if (this.match(TokenType.HANDLE)) {
          if (this.match(TokenType.CONDITION)) command = 'HANDLE_CONDITION';
      }

      if (!command) this.error(this.peek(), "Unknown CICS Command");

      // Parse Parameters until END-EXEC
      while (!this.check(TokenType.END_EXEC) && !this.isAtEnd()) {
          // Generic Parameter Parsing: KEYWORD(VALUE) or KEYWORD
          const token = this.advance();
          let key = token.value;
          
          // Map Tokens to standard keys
          if (token.type === TokenType.MAP) key = 'MAP';
          if (token.type === TokenType.MAPSET) key = 'MAPSET';
          if (token.type === TokenType.TRANSID) key = 'TRANSID';
          if (token.type === TokenType.COMMAREA) key = 'COMMAREA';
          if (token.type === TokenType.LENGTH) key = 'LENGTH';
          if (token.type === TokenType.RIDFLD) key = 'RIDFLD';
          if (token.type === TokenType.FILE) key = 'FILE';
          if (token.type === TokenType.INTO) key = 'INTO';
          if (token.type === TokenType.PROGRAM) key = 'PROGRAM';

          let value: any = true; // Default flag

          if (this.match(TokenType.LPAREN)) {
               value = this.parseValue(); // Literal or Variable Name
               this.consume(TokenType.RPAREN, ")");
          }
          
          params[key] = value;
      }

      this.consume(TokenType.END_EXEC, "END-EXEC");
      // CICS commands don't need a DOT, but often have one after END-EXEC.
      if (this.check(TokenType.DOT)) this.advance();

      return { type: 'EXEC_CICS', command: command as CicsCommandType, params };
  }

  // ... (Parsers for Open, Close, Read, Write, Move, Math, Compute, Call, Display, Accept, If, Perform, Condition, Expression, Value)
  
  private parseOpen(): Omit<OpenStatement, 'line'> {
      this.startNode('OpenStatement', this.previous());
      let mode: 'INPUT'|'OUTPUT'|'I-O'|'EXTEND' = 'INPUT';
      if (this.match(TokenType.INPUT)) mode = 'INPUT';
      else if (this.match(TokenType.OUTPUT)) mode = 'OUTPUT';
      else if (this.match(TokenType.I_O)) mode = 'I-O';
      else if (this.match(TokenType.EXTEND)) mode = 'EXTEND';
      
      const fileName = this.consume(TokenType.IDENTIFIER, "File Name").value;
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'OPEN', mode, fileName };
  }

  private parseClose(): Omit<CloseStatement, 'line'> {
      this.startNode('CloseStatement', this.previous());
      const fileName = this.consume(TokenType.IDENTIFIER, "File Name").value;
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'CLOSE', fileName };
  }

  private parseRead(): Omit<ReadStatement, 'line'> {
      this.startNode('ReadStatement', this.previous());
      const fileName = this.consume(TokenType.IDENTIFIER, "File Name").value;
      let next = false;
      if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'NEXT') { 
          this.advance();
          if (this.check(TokenType.RECORD)) this.advance();
          next = true;
      }

      let atEnd: StatementNode[] | undefined;
      let notAtEnd: StatementNode[] | undefined;
      let invalidKey: StatementNode[] | undefined;
      let notInvalidKey: StatementNode[] | undefined;

      while (!this.check(TokenType.DOT) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
          if (this.match(TokenType.AT)) {
              this.consume(TokenType.END, "END");
              atEnd = this.parseBlock();
          } else if (this.match(TokenType.NOT)) {
              if (this.match(TokenType.AT)) {
                  this.consume(TokenType.END, "END");
                  notAtEnd = this.parseBlock();
              } else if (this.match(TokenType.INVALID)) {
                  this.consume(TokenType.KEY, "KEY");
                  notInvalidKey = this.parseBlock();
              }
          } else if (this.match(TokenType.INVALID)) {
              this.consume(TokenType.KEY, "KEY");
              invalidKey = this.parseBlock();
          } else {
              break; 
          }
      }

      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'READ', fileName, next, atEnd, notAtEnd, invalidKey, notInvalidKey };
  }

  private parseWrite(): Omit<WriteStatement, 'line'> {
      this.startNode('WriteStatement', this.previous());
      const recordName = this.consume(TokenType.IDENTIFIER, "Record Name").value;
      let invalidKey: StatementNode[] | undefined;
      let notInvalidKey: StatementNode[] | undefined;

      while (!this.check(TokenType.DOT) && !this.isAtEnd()) {
          if (this.match(TokenType.INVALID)) {
              this.consume(TokenType.KEY, "KEY");
              invalidKey = this.parseBlock();
          } else if (this.match(TokenType.NOT)) {
              this.consume(TokenType.INVALID, "INVALID");
              this.consume(TokenType.KEY, "KEY");
              notInvalidKey = this.parseBlock();
          } else {
              break;
          }
      }

      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'WRITE', recordName, invalidKey, notInvalidKey };
  }

  private parseBlock(): StatementNode[] {
      const stmts: StatementNode[] = [];
      while (!this.check(TokenType.DOT) && !this.check(TokenType.NOT) && !this.check(TokenType.AT) && !this.check(TokenType.INVALID) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
          const s = this.parseStatement();
          if (s) stmts.push(s);
          else break;
      }
      return stmts;
  }

  private parseMove(): Omit<MoveStatement, 'line'> {
      this.startNode('Statement', this.previous());
      const value = this.parseValue();
      this.consume(TokenType.TO, "Keyword TO");
      const target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      
      let targetSlice: {start: number, len: number} | undefined;
      // Handle Reference Modification: TO VAR(1:2)
      if (this.match(TokenType.LPAREN)) {
           const start = Number(this.parseValue());
           this.consume(TokenType.COLON, ":");
           const len = Number(this.parseValue());
           this.consume(TokenType.RPAREN, ")");
           targetSlice = { start, len };
      }

      this.match(TokenType.DOT); 
      this.endNode();
      return { type: 'MOVE', source: value, target, targetSlice };
  }

  private parseMath(type: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE'): Omit<MathStatement, 'line'> {
      this.startNode('Statement', this.previous());
      const value = this.parseValue();
      let target = "";
      let requiredPrep = TokenType.TO;
      switch(type) {
          case 'ADD': requiredPrep = TokenType.TO; break;
          case 'SUBTRACT': requiredPrep = TokenType.FROM; break;
          case 'MULTIPLY': requiredPrep = TokenType.BY; break;
          case 'DIVIDE': requiredPrep = TokenType.INTO; break;
      }
      this.consume(requiredPrep, "Preposition");
      target = this.consume(TokenType.IDENTIFIER, "Target Identifier").value;
      this.match(TokenType.DOT);
      this.endNode();
      return { type, value, target };
  }

  private parseCompute(): Omit<ComputeStatement, 'line'> {
    this.startNode('Statement', this.previous());
    const target = this.consume(TokenType.IDENTIFIER, "Target").value;
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'ROUNDED') this.advance();
    this.consume(TokenType.EQUALS, "=");
    const expression = this.parseExpression();
    this.match(TokenType.DOT);
    this.endNode();
    return { type: 'COMPUTE', target, expression };
  }

  private parseCall(): Omit<CallStatement, 'line'> {
      this.startNode('Statement', this.previous());
      const programName = this.parseValue();
      const using: string[] = [];
      if (this.match(TokenType.USING)) {
          do {
              using.push(this.consume(TokenType.IDENTIFIER, "Argument").value);
          } while (!this.check(TokenType.DOT) && this.check(TokenType.IDENTIFIER));
      }
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'CALL', programName, using };
  }

  private parseDisplay(): Omit<DisplayStatement, 'line'> {
      this.startNode('Statement', this.previous());
      const values: (string | number)[] = [];
      do { values.push(this.parseValue()); } while (!this.check(TokenType.DOT) && !this.isKeyword(this.peek().type));
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'DISPLAY', values };
  }

  private parseAccept(): Omit<AcceptStatement, 'line'> {
      this.startNode('Statement', this.previous());
      const target = this.consume(TokenType.IDENTIFIER, "Target").value;
      this.match(TokenType.DOT);
      this.endNode();
      return { type: 'ACCEPT', target };
  }

  private parseIf(): Omit<IfStatement, 'line'> {
      this.context.ifStack++;
      this.startNode('IfStatement', this.previous());
      try {
          const condition = this.parseCondition();
          if (this.match(TokenType.THEN)) {}
          const thenBody: StatementNode[] = [];
          while (!this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
              if (this.check(TokenType.DOT)) break;
              const s = this.parseStatement();
              if (s) thenBody.push(s); else break;
          }
          let elseBody: StatementNode[] | undefined;
          if (this.match(TokenType.ELSE)) {
              elseBody = [];
              while (!this.check(TokenType.END_IF) && !this.isAtEnd()) {
                 if (this.check(TokenType.DOT)) break;
                 const s = this.parseStatement();
                 if (s) elseBody.push(s); else break;
              }
          }
          if (this.match(TokenType.END_IF)) this.match(TokenType.DOT);
          else if (!this.check(TokenType.DOT)) this.match(TokenType.DOT);
          this.endNode();
          return { type: 'IF', condition, thenBody, elseBody };
      } finally { this.context.ifStack--; }
  }

  private parsePerform(): Omit<PerformStatement, 'line'> {
      this.context.performStack++;
      this.startNode('PerformStatement', this.previous());
      try {
          let until: ConditionNode | undefined;
          let times: number | string | undefined;
          if (this.match(TokenType.UNTIL)) until = this.parseCondition();
          else if (this.check(TokenType.LITERAL_NUMBER) || this.check(TokenType.IDENTIFIER)) {
              const val = this.parseValue();
              if (this.match(TokenType.TIMES)) times = val;
          }
          const body: StatementNode[] = [];
          while (!this.check(TokenType.END_PERFORM) && !this.isAtEnd()) {
              const s = this.parseStatement();
              if (s) body.push(s);
          }
          this.consume(TokenType.END_PERFORM, "END-PERFORM");
          this.match(TokenType.DOT);
          this.endNode();
          return { type: 'PERFORM', body, until, times };
      } finally { this.context.performStack--; }
  }

  private parseCondition(): ConditionNode {
      const left = this.parseValue();
      let operator: '=' | '>' | '<' = '=';
      if (this.match(TokenType.EQUALS)) operator = '=';
      else if (this.match(TokenType.GREATER)) operator = '>';
      else if (this.match(TokenType.LESS)) operator = '<';
      const right = this.parseValue();
      return { left, operator, right };
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
    if (this.match(TokenType.LITERAL_NUMBER)) return { type: 'Literal', value: Number(this.previous().value) };
    if (this.match(TokenType.IDENTIFIER)) return { type: 'Variable', name: this.previous().value };
    if (this.match(TokenType.LPAREN)) { const expr = this.parseExpression(); this.consume(TokenType.RPAREN, ")"); return expr; }
    if (this.match(TokenType.MINUS)) { const right = this.parsePrimary(); return { type: 'Unary', operator: TokenType.MINUS, right }; }
    this.error(this.peek(), "Expected Expression");
  }

  private parseValue(): string | number {
      if (this.match(TokenType.LITERAL_NUMBER)) return Number(this.previous().value);
      if (this.match(TokenType.LITERAL_STRING)) return this.previous().value;
      if (this.match(TokenType.IDENTIFIER)) return this.previous().value;
      this.error(this.peek(), "Expected Value");
  }

  private isKeyword(type: TokenType): boolean {
      return type >= TokenType.MOVE && type <= TokenType.HANDLE; // Update range
  }
}
