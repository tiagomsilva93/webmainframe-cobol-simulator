
import { 
  ProgramNode, StatementNode, ExpressionNode, ConditionNode, 
  VariableDeclarationNode, PerformStatement, AcceptStatement, DisplayStatement
} from './types';
import { ValidationError } from './validator';

// Definition of the Symbol Record
interface SymbolInfo {
  name: string;
  level: number;      // COBOL Level (01, 77, etc.)
  type: 'X' | '9';    // Logical Type: 'X' (Alphanumeric) or '9' (Numeric)
  length: number;     // Storage size
  line: number;       // Declaration line (Placeholder for now)
}

export class SemanticValidator {
  private static symbolTable: Map<string, SymbolInfo> = new Map();
  private static errors: ValidationError[] = [];

  public static validate(ast: ProgramNode): ValidationError[] {
    this.symbolTable.clear();
    this.errors = [];

    // Pass 1: Build Symbol Table from Data Division
    // Combine Working-Storage and Linkage Section variables
    const allVariables = [
      ...ast.dataDivision.workingStorage,
      ...ast.dataDivision.linkageSection
    ];
    this.buildSymbolTable(allVariables);

    // Pass 2: Validate Statements in Procedure Division
    this.validateStatements(ast.procedureDivision.statements);

    return this.errors;
  }

  private static buildSymbolTable(variables: VariableDeclarationNode[]) {
    variables.forEach(v => {
      const symName = v.name;
      if (this.symbolTable.has(symName)) {
        this.addError(0, 0, 'IGYPS2112-S', `SYMBOL '${symName}' WAS ALREADY DEFINED IN THIS PROGRAM.`, 'ERROR');
        return; 
      }
      this.symbolTable.set(symName, {
        name: symName,
        level: v.level,
        type: v.picType,
        length: v.picLength,
        line: 0 
      });
    });
  }

  private static validateStatements(statements: StatementNode[]) {
    statements.forEach(stmt => {
      switch (stmt.type) {
        case 'MOVE':
          this.validateMove(stmt.source, stmt.target, stmt);
          break;
        case 'ADD':
          this.validateAdd(stmt.value, stmt.target, stmt);
          break;
        case 'SUBTRACT':
          this.validateSubtract(stmt.value, stmt.target, stmt);
          break;
        case 'MULTIPLY':
          this.validateMultiply(stmt.value, stmt.target, stmt);
          break;
        case 'DIVIDE':
          this.validateDivide(stmt.value, stmt.target, stmt);
          break;
        case 'COMPUTE':
          this.validateCompute(stmt.target, stmt.expression, stmt);
          break;
        case 'IF':
          this.validateCondition(stmt.condition, stmt);
          this.validateStatements(stmt.thenBody);
          if (stmt.elseBody) this.validateStatements(stmt.elseBody);
          break;
        case 'PERFORM':
          this.validatePerform(stmt as PerformStatement, stmt);
          break;
        case 'ACCEPT':
          this.validateAccept(stmt as AcceptStatement, stmt);
          break;
        case 'DISPLAY':
          this.validateDisplay(stmt as DisplayStatement, stmt);
          break;
      }
    });
  }

  // --- DISPLAY & ACCEPT VALIDATION ---

  private static validateDisplay(stmt: DisplayStatement, context: any) {
    if (!stmt.values || stmt.values.length === 0) {
        this.addError(context.startLine || 0, 0, 'IGYPS2142-E', 'DISPLAY STATEMENT REQUIRES AT LEAST ONE OPERAND.', 'ERROR');
        return;
    }

    stmt.values.forEach(val => {
        if (typeof val === 'number') {
            // Numeric literal is always valid
            return;
        }
        
        // If it's a string, it could be a Variable OR a String Literal.
        // Due to AST limitations (flattening literals and identifiers),
        // we check if it matches a symbol. 
        // If valid symbol -> Valid.
        // If not symbol -> Treat as Literal (Valid).
        // This avoids false positives for valid string literals.
        const sym = this.symbolTable.get(val);
        if (sym) {
             // Valid identifier reference
        } else {
             // Assumed Literal String - Valid for DISPLAY
        }
    });
  }

  private static validateAccept(stmt: AcceptStatement, context: any) {
    // 1. Target must be a valid Identifier in Symbol Table
    const sym = this.validateVariable(stmt.target, context, false);

    if (sym) {
        // 2. Warning for Numeric Fields (Runtime Risk)
        if (sym.type === '9') {
            this.addError(context.startLine || 0, 0, 'IGYPS4005-W', `ACCEPT INTO NUMERIC FIELD '${stmt.target}' MAY CAUSE RUNTIME CONVERSION ERROR.`, 'WARNING');
        }
        // PIC X is the standard receiving field, always valid.
    }
  }

  // --- PERFORM VALIDATION ---

  private static validatePerform(stmt: PerformStatement, context: any) {
      // 1. Recursive Validation of the Body
      // The body contains other statements that must be semantically valid
      if (stmt.body && stmt.body.length > 0) {
          this.validateStatements(stmt.body);
      }

      // 2. Validate TIMES clause
      if (stmt.times !== undefined) {
          this.validatePerformTimes(stmt.times, context);
      }

      // 3. Validate UNTIL clause
      if (stmt.until) {
          this.validatePerformUntil(stmt.until, context);
      }
  }

  private static validatePerformTimes(value: string | number, context: any) {
      if (typeof value === 'number') {
          // Rule: Literal must be positive integer
          if (value <= 0) {
              this.addError(context.startLine || 0, 0, 'IGYPS2135-E', `INVALID TIMES VALUE '${value}'. MUST BE A POSITIVE INTEGER.`, 'ERROR');
          }
      } else {
          // Rule: Identifier must exist and be Numeric (PIC 9)
          const sym = this.validateVariable(value, context, false);
          if (sym) {
              if (sym.type !== '9') {
                  this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `TIMES IDENTIFIER '${value}' MUST BE NUMERIC.`, 'ERROR');
              }
          }
      }
  }

  private static validatePerformUntil(cond: ConditionNode, context: any) {
      // 1. Validate Operands Type (Must be Numeric)
      this.validateConditionOperand(cond.left, context);
      this.validateConditionOperand(cond.right, context);

      // 2. Infinite Loop Detection (Static Analysis)
      // If both operands are literals, the condition is static (e.g., 1 > 0).
      // Since we don't support VARYING logic that modifies variables implicitly, 
      // a static condition usually means an infinite loop or dead code.
      const isLeftLiteral = typeof cond.left === 'number';
      const isRightLiteral = typeof cond.right === 'number';

      if (isLeftLiteral && isRightLiteral) {
          this.addError(context.startLine || 0, 0, 'IGYPS4001-W', `PERFORM UNTIL CONDITION MAY RESULT IN INFINITE LOOP (STATIC OPERANDS).`, 'WARNING');
      }
  }

  // --- OTHER STATEMENTS ---

  private static validateMove(source: string | number, target: string, context: any) {
    const targetSymbol = this.validateVariable(target, context, true);
    if (!targetSymbol) return; 

    if (typeof source === 'number') {
        if (targetSymbol.type !== '9') {
             this.addError(context.startLine || 0, 0, 'IGYPS2104-E', `INVALID MOVE: NUMERIC LITERAL TO ALPHANUMERIC ITEM '${target}'.`, 'ERROR');
        }
    } else {
        const sourceSymbol = this.symbolTable.get(source);

        if (sourceSymbol) {
             if (sourceSymbol.type !== targetSymbol.type) {
                 const srcDesc = sourceSymbol.type === '9' ? 'NUMERIC' : 'ALPHANUMERIC';
                 const tgtDesc = targetSymbol.type === '9' ? 'NUMERIC' : 'ALPHANUMERIC';
                 this.addError(context.startLine || 0, 0, 'IGYPS2104-E', `INVALID MOVE: INCOMPATIBLE DATA TYPES (${srcDesc} TO ${tgtDesc}).`, 'ERROR');
             }
        } else {
             if (targetSymbol.type === '9') {
                 this.addError(context.startLine || 0, 0, 'IGYPS2104-E', `INVALID MOVE: ALPHANUMERIC LITERAL '${source}' TO NUMERIC ITEM '${target}'.`, 'ERROR');
             }
        }
    }
  }

  // --- Arithmetic Validation Wrappers ---

  private static validateAdd(value: string | number, target: string, context: any) {
      this.validateArithmetic(value, target, context, 'ADD');
  }

  private static validateSubtract(value: string | number, target: string, context: any) {
      this.validateArithmetic(value, target, context, 'SUBTRACT');
  }

  private static validateMultiply(value: string | number, target: string, context: any) {
      this.validateArithmetic(value, target, context, 'MULTIPLY');
  }

  private static validateDivide(value: string | number, target: string, context: any) {
      this.validateArithmetic(value, target, context, 'DIVIDE');
  }

  private static validateArithmetic(value: string | number, target: string, context: any, verb: string) {
      // 1. Target must be defined variable AND Numeric
      const targetSymbol = this.validateVariable(target, context, false); // false = must check undefined in validateVariable
      
      if (targetSymbol) {
          if (targetSymbol.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `DATA ITEM '${target}' MUST BE NUMERIC FOR ${verb}.`, 'ERROR');
          }
      }

      // 2. Source must be Numeric (Literal or Variable)
      if (typeof value === 'number') {
          // OK: Numeric Literal
      } else {
          // Check if source is variable
          const sourceSymbol = this.symbolTable.get(value);
          if (sourceSymbol) {
              if (sourceSymbol.type !== '9') {
                  this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `OPERAND '${value}' MUST BE NUMERIC FOR ${verb}.`, 'ERROR');
              }
          } else {
              this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `IDENTIFIER '${value}' WAS NOT DECLARED.`, 'ERROR');
          }
      }
  }

  private static validateCompute(target: string, expr: ExpressionNode, context: any) {
      const targetSymbol = this.validateVariable(target, context, false);
      if (targetSymbol && targetSymbol.type !== '9') {
          this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `TARGET '${target}' MUST BE NUMERIC FOR COMPUTE.`, 'ERROR');
      }
      this.validateExpression(expr, context);
  }

  private static validateExpression(expr: ExpressionNode, context: any) {
      if (expr.type === 'Binary') {
          this.validateExpression(expr.left, context);
          this.validateExpression(expr.right, context);
      } else if (expr.type === 'Unary') {
          this.validateExpression(expr.right, context);
      } else if (expr.type === 'Variable') {
          const sym = this.symbolTable.get(expr.name);
          if (!sym) {
              this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `VARIABLE '${expr.name}' NOT DEFINED.`, 'ERROR');
          } else if (sym.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `VARIABLE '${expr.name}' IN EXPRESSION MUST BE NUMERIC.`, 'ERROR');
          }
      }
  }

  // --- Condition Validation (IF & PERFORM) ---

  private static validateCondition(cond: ConditionNode, context: any) {
     this.validateConditionOperand(cond.left, context);
     this.validateConditionOperand(cond.right, context);
  }

  private static validateConditionOperand(val: string | number, context: any) {
      if (typeof val === 'number') {
          return; // Numeric Literal is valid
      }

      const sym = this.symbolTable.get(val);
      if (sym) {
          // Variable found. Must be PIC 9.
          if (sym.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `INVALID COMPARISON: FIELD '${val}' IS NOT NUMERIC (PIC ${sym.type}).`, 'ERROR');
          }
      } else {
          // Variable not found.
          // In COBOL, quoted strings are string literals. Unquoted are identifiers.
          // Our parser distinguishes LITERAL_STRING vs IDENTIFIER, but AST resolves to string value.
          // For this strict numeric check, if it's not a number and not in symbol table, it's either an error or a string literal.
          // Both are invalid for Numeric Comparison.
          
          this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `IDENTIFIER '${val}' WAS NOT DECLARED.`, 'ERROR');
      }
  }

  private static validateNumericSource(val: string | number, context: any) {
      if (typeof val === 'number') return;
      
      const sym = this.symbolTable.get(val);
      if (sym) {
          if (sym.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `VARIABLE '${val}' MUST BE NUMERIC.`, 'ERROR');
          }
      } else {
          this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `INVALID ARITHMETIC OPERAND '${val}'. EXPECTED NUMERIC LITERAL OR VARIABLE.`, 'ERROR');
      }
  }

  private static validateVariable(name: string, context: any, allowAnyType: boolean): SymbolInfo | undefined {
      const sym = this.symbolTable.get(name);
      if (!sym) {
          this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `VARIABLE '${name}' NOT DEFINED.`, 'ERROR');
          return undefined;
      }
      return sym;
  }

  private static addError(line: number, col: number, code: string, message: string, severity: 'ERROR'|'WARNING') {
      this.errors.push({
          line,
          column: col,
          code,
          message,
          severity
      });
  }
}
